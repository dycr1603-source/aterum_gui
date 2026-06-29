'use strict';

const net = require('net');
const { execFileSync } = require('child_process');

async function probe(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return true;
}

function redisPing(config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(config.redis.port, config.redis.host);
    let data = '';
    const commands = config.redis.password
      ? `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(config.redis.password)}\r\n${config.redis.password}\r\n*1\r\n$4\r\nPING\r\n`
      : '*1\r\n$4\r\nPING\r\n';
    const timer = setTimeout(() => socket.destroy(new Error('Redis timeout')), 4000);
    socket.on('connect', () => socket.write(commands));
    socket.on('data', chunk => {
      data += chunk.toString();
      if (data.includes('+PONG')) { clearTimeout(timer); socket.end(); resolve(true); }
    });
    socket.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

function workflowStatus(config) {
  const limits = { 'SL Monitor': 30, 'Trailing Manager': 120, 'Advanced AI Trading Bot v2 - Clean': 1800 };
  const names = Object.keys(limits);
  const quoted = names.map(name => `'${name.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT w.name||'|'||w.active||'|'||COALESCE((SELECT e.status FROM execution_entity e WHERE e.workflowId=w.id ORDER BY e.startedAt DESC LIMIT 1),'missing')||'|'||COALESCE((SELECT e.startedAt FROM execution_entity e WHERE e.workflowId=w.id ORDER BY e.startedAt DESC LIMIT 1),'') FROM workflow_entity w WHERE w.name IN (${quoted}) ORDER BY w.name;`;
  const output = execFileSync('sqlite3', ['-readonly', config.n8nDatabase, sql], { encoding: 'utf8', timeout: 5000 });
  const rows = Object.fromEntries(output.trim().split('\n').filter(Boolean).map(line => {
    const [name, active, status, startedAt] = line.split('|');
    const ageSeconds = startedAt ? (Date.now() - new Date(`${startedAt}Z`).getTime()) / 1000 : Infinity;
    return [name, { active: active === '1', status, startedAt, ageSeconds }];
  }));
  return names.map(name => {
    const row = rows[name] || {};
    const ok = row.active === true && row.status === 'success' && row.ageSeconds <= limits[name];
    return { name, ok, detail: row.startedAt ? `${row.status}, ${Math.round(row.ageSeconds)}s ago` : 'no execution',
      error: ok ? null : `active=${row.active === true} status=${row.status || 'missing'} age=${Math.round(row.ageSeconds || 0)}s` };
  });
}

async function healthSnapshot(deps) {
  const { config, db, binance } = deps;
  const checks = [];
  const run = async (name, fn) => {
    const started = Date.now();
    try { await fn(); checks.push({ name, ok: true, ms: Date.now() - started }); }
    catch (error) { checks.push({ name, ok: false, ms: Date.now() - started, error: error.message }); }
  };
  await Promise.all([
    run('MySQL', () => db.query('SELECT 1')),
    run('Redis', () => redisPing(config)),
    run('Dashboard', () => probe(`${config.dashboardBase}/healthz`)),
    run('Chart API', () => probe(`${config.chartBase}/healthz`)),
    run('n8n', () => probe(`${config.n8nBase}/healthz`)),
    run('Research', () => probe(`${config.dashboardBase}/api/research/summary`)),
    run('Learning', () => probe(`${config.dashboardBase}/api/learning/summary`)),
    run('Binance', () => binance.positions()),
    run('Telegram', async () => {
      if (!config.telegramToken) throw new Error('token missing');
      const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getMe`, { signal: AbortSignal.timeout(5000) });
      const body = await response.json(); if (!body.ok) throw new Error(body.description || 'Telegram error');
    })
  ]);
  try { checks.push(...workflowStatus(config).map(row => ({ ...row, ms: 0 }))); }
  catch (error) {
    checks.push({ name: 'SL Monitor', ok: false, ms: 0, error: error.message });
    checks.push({ name: 'Trailing Manager', ok: false, ms: 0, error: error.message });
    checks.push({ name: 'Advanced AI Trading Bot v2 - Clean', ok: false, ms: 0, error: error.message });
  }
  return { ok: checks.every(item => item.ok), checks, at: new Date().toISOString() };
}

module.exports = { healthSnapshot, workflowStatus, redisPing };
