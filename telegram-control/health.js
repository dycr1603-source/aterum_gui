'use strict';

const fs = require('fs');
const net = require('net');

function redisCommand(config, command) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.createConnection({ host: config.redis.host, port: config.redis.port });
    let data = '';
    const timeout = setTimeout(() => socket.destroy(new Error('Redis timeout')), 4000);
    socket.on('connect', () => {
      const commands = [];
      if (config.redis.password) commands.push(['AUTH', config.redis.password]);
      commands.push([command]);
      socket.write(commands.map(parts => `*${parts.length}\r\n${parts.map(part => `$${Buffer.byteLength(String(part))}\r\n${part}\r\n`).join('')}`).join(''));
    });
    socket.on('data', chunk => {
      data += chunk.toString();
      if (data.includes('+PONG')) {
        clearTimeout(timeout);
        socket.end();
        resolve(Date.now() - started);
      } else if (data.includes('-ERR')) {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(data.trim().slice(0, 160)));
      }
    });
    socket.on('error', error => { clearTimeout(timeout); reject(error); });
  });
}

async function timed(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - started, error: error.message };
  }
}

async function getHealth({ config, api, audit, telegram }) {
  const results = await Promise.all([
    timed('Docker', async () => fs.existsSync('/.dockerenv') ? 'container runtime' : Promise.reject(new Error('not in Docker'))),
    timed('MySQL', () => audit.ping().then(ms => `${ms}ms`)),
    timed('Redis', () => redisCommand(config, 'PING').then(ms => `${ms}ms`)),
    timed('Dashboard', () => api.dashboardProbe('/healthz').then(result => `${result.status}/${result.ms}ms`)),
    timed('GUI', () => api.dashboardProbe('/').then(result => `${result.status}/${result.ms}ms`)),
    timed('n8n', () => api.n8nProbe('/healthz').then(result => `${result.status}/${result.ms}ms`)),
    timed('Research', () => api.dashboardProbe('/api/research/summary').then(result => `${result.status}/${result.ms}ms`)),
    timed('Learning', () => api.dashboardProbe('/api/learning/summary').then(result => `${result.status}/${result.ms}ms`)),
    timed('Binance', async () => {
      const response = await fetch('https://fapi.binance.com/fapi/v1/ping', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return `HTTP ${response.status}`;
    }),
    timed('Claude', async () => {
      if (!config.anthropicConfigured) throw new Error('ANTHROPIC_API_KEY missing');
      const latest = await api.latestReport();
      if (!latest.report) throw new Error('sin informe persistido');
      return `${latest.report.model || 'modelo registrado'} / ${latest.report.created_at || latest.report.report_date}`;
    }),
    timed('Telegram', () => telegram.getMe().then(bot => `@${bot.username}`))
  ]);
  return { ok: results.every(item => item.ok), generatedAt: new Date().toISOString(), services: results };
}

module.exports = { getHealth };
