'use strict';

const http = require('http');
const mysql = require('mysql2/promise');
const config = require('./config');
const { BinanceFutures } = require('./binance');
const { PositionGuard } = require('./guard');
const { healthSnapshot } = require('./health');

async function main() {
  if (!config.apiKey || !config.apiSecret) throw new Error('Position Guard Binance credentials are required');
  const db = mysql.createPool(config.db);
  const binance = new BinanceFutures(config);
  const guard = new PositionGuard({ config, db, binance });
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

  const server = http.createServer((req, res) => {
    if (req.url !== '/healthz') { res.writeHead(404); return res.end('not found'); }
    const healthy = runtime.ready && runtime.lastScan && Date.now() - new Date(runtime.lastScan.at).getTime() < config.pollMs * 4;
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: healthy, enforce: config.enforce, ...runtime }));
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
