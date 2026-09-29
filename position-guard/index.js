'use strict';

const http = require('http');
const mysql = require('mysql2/promise');
const config = require('./config');
const { BinanceFutures } = require('./binance');
const { PositionGuard } = require('./guard');
const { ExecutionEngine } = require('./execution-engine');
const { PortfolioAllocator } = require('./portfolio-allocation');
const { healthSnapshot } = require('./health');
const { operationDrain } = require('./operation-drain');

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100000) req.destroy(new Error('request too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (_) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function startupReconciliationEvent(summary = {}) {
  const fields = ['positions','protected','unprotected','emergencyClosed','reconciled','driftDetected',
    'adopted','pendingPersistence','pendingExecutions','projectionsRefreshed','durationMs','at','errors'];
  const actual = Object.fromEntries(fields.filter(key => summary[key] !== undefined).map(key => [key, summary[key]]));
  const ok = summary.ok === true;
  return {
    eventType: 'STARTUP_RECONCILIATION_COMPLETED',
    severity: ok ? 'INFO' : 'WARNING',
    expected: { source: 'PROCESS_START', comparison: 'BINANCE_VS_LOCAL_OPEN_TRADES' },
    actual,
    action: 'RECONCILE_BINANCE_POSITIONS_AND_OPEN_TRADES',
    actionStatus: ok ? 'SUCCESS' : 'PARTIAL'
  };
}

async function main() {
  if (!config.apiKey || !config.apiSecret) throw new Error('Position Guard Binance credentials are required');
  const db = mysql.createPool(config.db);
  const binance = new BinanceFutures(config);
  const portfolioAllocator = new PortfolioAllocator({ config, binance, db });
  const executionEngine = new ExecutionEngine({ config, db, binance, portfolioAllocator });
  const guard = new PositionGuard({ config, db, binance, executionEngine });
  await executionEngine.initialize();
  await guard.initialize();
  await db.query('SELECT 1');
  await binance.positions();

  const runtime = { ready: true, startedAt: new Date().toISOString(), lastScan: null, lastHealth: null, lastError: null };
  const operations = operationDrain();
  const scan = () => operations.run(async () => {
    if (!runtime.ready) return;
    try { runtime.lastScan = await guard.scan(); runtime.lastError = null; }
    catch (error) {
      runtime.lastError = error.message;
      runtime.lastScan = { ok:false, errors:[error.message], at:new Date().toISOString() };
      console.error('[Position Guard] scan:', error.message);
    }
  });
  const health = () => operations.run(async () => {
    if (!runtime.ready) return;
    runtime.lastHealth = await healthSnapshot({ config, db, binance });
    const failed = runtime.lastHealth.checks.filter(item => !item.ok);
    for (const item of failed) {
      console.warn(`[Position Guard] health ${item.name}: ${item.error || 'inactive'} (internal only)`);
    }
  });
  await scan();
  try { await guard.event(startupReconciliationEvent(runtime.lastScan)); }
  catch (error) { console.error('[Position Guard] startup audit:', error.message); }
  await health();
  const scanTimer = setInterval(scan, config.pollMs);
  const healthTimer = setInterval(health, config.healthMs);

  const server = http.createServer((req, res) => operations.run(async () => {
    try {
      if (!runtime.ready) return sendJson(res, 503, { ok: false, error: 'POSITION_GUARD_DRAINING' });
      const url = new URL(req.url, `http://${req.headers.host || 'position-guard'}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const healthy = runtime.ready && runtime.lastScan && Date.now() - new Date(runtime.lastScan.at).getTime() < config.pollMs * 4;
        return sendJson(res, healthy ? 200 : 503, { ok: healthy, enforce: config.enforce,
          executionEngine: Boolean(config.executionToken), ...runtime });
      }
      if (req.method === 'POST' && url.pathname === '/executions') {
        if (!config.executionToken) return sendJson(res, 503, { ok: false, error: 'execution engine token is not configured' });
        const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (supplied !== config.executionToken) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
        const result = await executionEngine.execute(await readJson(req));
        return sendJson(res, 200, result);
      }
      if (['GET', 'POST'].includes(req.method) && url.pathname === '/portfolio-capacity') {
        if (!config.executionToken) return sendJson(res, 503, { allowed: false, error: 'execution engine token is not configured' });
        const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (supplied !== config.executionToken) return sendJson(res, 401, { allowed: false, error: 'unauthorized' });
        const body = req.method === 'POST' ? await readJson(req) : {};
        return sendJson(res, 200, await portfolioAllocator.capacity(body.candidate || null));
      }
      if (req.method === 'POST' && url.pathname === '/reconciliations') {
        if (!config.executionToken) return sendJson(res, 503, { ok: false, error: 'execution engine token is not configured' });
        const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (supplied !== config.executionToken) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
        const input = await readJson(req);
        if (String(input.persistenceStatus || 'PENDING').toUpperCase() === 'PENDING') {
          try {
            return sendJson(res, 200, await executionEngine.finalizeExternalClose(input));
          } catch (error) {
            const errorContext = { executionId: input.executionId || null, correlationId: input.correlationId || null,
              httpMethod: error.httpMethod || null, url: error.url || null,
              statusCode: error.statusCode || error.code || null,
              responseBody: error.responseBody || error.body || null, stackTrace: error.stack || null,
              verificationStatus: 'VERIFIED', persistenceStatus: 'FAILED' };
            const failed = await executionEngine.recordExternalClose({ ...input,
              persistenceStatus: 'FAILED', errorContext });
            return sendJson(res, 200, { ...failed, ok: false,
              error: 'Verified close lifecycle finalization failed', errorContext });
          }
        }
        return sendJson(res, 200, await executionEngine.recordExternalClose(input));
      }
      return sendJson(res, 404, { ok: false, error: 'not found' });
    } catch (error) {
      console.error('[Position Guard] request:', error.message);
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }));
  server.listen(config.port, '0.0.0.0');
  console.log(`[Position Guard] ready enforce=${config.enforce} poll=${config.pollMs}ms`);

  let stopping = false;
  const stop = async signal => {
    if (stopping) return;
    stopping = true;
    runtime.ready = false; clearInterval(scanTimer); clearInterval(healthTimer);
    await new Promise(resolve => server.close(resolve));
    await operations.wait();
    await Promise.allSettled([...executionEngine.inFlight.values()]);
    await db.end(); console.log(`[Position Guard] ${signal}, stopped`); process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

if (require.main === module) main().catch(error => { console.error('[Position Guard] fatal:', error.message); process.exit(1); });
module.exports = { main, startupReconciliationEvent };
