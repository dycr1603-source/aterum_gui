'use strict';

const http = require('http');
const mysql = require('mysql2/promise');
const config = require('./config');
const { BinanceFutures } = require('./binance');
const { PositionGuard } = require('./guard');
const { ExecutionEngine } = require('./execution-engine');
const { healthSnapshot } = require('./health');

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

async function main() {
  if (!config.apiKey || !config.apiSecret) throw new Error('Position Guard Binance credentials are required');
  const db = mysql.createPool(config.db);
  const binance = new BinanceFutures(config);
  const executionEngine = new ExecutionEngine({ config, db, binance });
  const guard = new PositionGuard({ config, db, binance, executionEngine });
  await executionEngine.initialize();
  await guard.initialize();
  await db.query('SELECT 1');
  await binance.positions();

  const runtime = { ready: true, startedAt: new Date().toISOString(), lastScan: null, lastHealth: null, lastError: null };
  const scan = async () => {
    try { runtime.lastScan = await guard.scan(); runtime.lastError = null; }
    catch (error) { runtime.lastError = error.message; console.error('[Position Guard] scan:', error.message); }
  };
  const health = async () => {
    runtime.lastHealth = await healthSnapshot({ config, db, binance });
    const failed = runtime.lastHealth.checks.filter(item => !item.ok);
    for (const item of failed) {
      await guard.alert(`health:${item.name}`, `🚨 ATERUM HEALTH\n${item.name} failed: ${item.error || 'inactive'}`).catch(() => null);
    }
  };
  await scan();
  await health();
  const scanTimer = setInterval(scan, config.pollMs);
  const healthTimer = setInterval(health, config.healthMs);

  const server = http.createServer(async (req, res) => {
    try {
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
  });
  server.listen(config.port, '0.0.0.0');
  console.log(`[Position Guard] ready enforce=${config.enforce} poll=${config.pollMs}ms`);

  const stop = async signal => {
    runtime.ready = false; clearInterval(scanTimer); clearInterval(healthTimer); server.close();
    await db.end(); console.log(`[Position Guard] ${signal}, stopped`); process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

if (require.main === module) main().catch(error => { console.error('[Position Guard] fatal:', error.message); process.exit(1); });
module.exports = { main };
