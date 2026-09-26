'use strict';
// Serves workspace views against an existing backend, with its real login/session.
// No DB initialization, order requests, or background trading workers are started.
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pages = {
  '/dashboard': user => require('../views/dashboard').getDashboardHTML('BTCUSDT', user),
  '/analytics': user => require('../views/analytics').getAnalyticsHTML(user),
  '/ai-data': user => require('../views/aidata').getAIDataHTML(user),
  '/research': user => require('../views/research').getResearchHTML(user),
  '/knowledge': user => require('../views/knowledge').getKnowledgeHTML(user),
  '/simulator': user => require('../views/simulator').getSimulatorHTML(user),
  '/crypto-play': user => require('../views/play').getPlayHTML(user)
};
function createPreview({ upstream = 'http://127.0.0.1:3001' } = {}) {
  const target = new URL(upstream);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Preview requires a loopback backend');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET','HEAD'].includes(req.method) && !(req.method === 'POST' && url.pathname === '/login')) { res.writeHead(405); return res.end('Read-only GUI preview'); }
    if (url.pathname.startsWith('/aterum-assets/')) {
      const asset = path.resolve(root, 'assets', '.' + decodeURIComponent(url.pathname.slice('/aterum-assets'.length)));
      if (!asset.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(asset) || !fs.statSync(asset).isFile()) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(asset)] || 'application/octet-stream');
      return fs.createReadStream(asset).pipe(res);
    }
    const proxy = http.request({ hostname: target.hostname, port: target.port || 80, path: req.url, method: req.method, headers: {...req.headers, host: target.host} }, upstreamRes => {
      if (pages[url.pathname] && upstreamRes.statusCode === 200) {
        let html = '';
        upstreamRes.setEncoding('utf8'); upstreamRes.on('data', chunk => html += chunk);
        upstreamRes.on('end', () => {
          const username = html.match(/class="nav-user[^\"]*">([^<]*)</)?.[1] || '';
          const user = { username: username.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") };
          const content = url.pathname === '/dashboard' ? require('../views/dashboard').getDashboardHTML((url.searchParams.get('symbol') || 'BTCUSDT').replace(/[^a-z0-9]/gi, '').toUpperCase(), user) : pages[url.pathname](user);
          res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(content);
        });
      } else { res.writeHead(upstreamRes.statusCode, upstreamRes.headers); upstreamRes.pipe(res); }
    });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Backend no disponible'); });
    res.on('close', () => proxy.destroy()); req.pipe(proxy);
  });
  // Existing market/account transports; preserve their upstream handshake.
  server.on('upgrade', (req, socket, head) => {
    const proxy = http.request({hostname:target.hostname, port:target.port || 80, path:req.url, headers:{...req.headers,host:target.host}});
    proxy.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(response.headers).map(([k,v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
      socket.on('error', () => upstreamSocket.destroy()); upstreamSocket.on('error', () => socket.destroy());
      socket.on('close', () => upstreamSocket.destroy());
    });
    proxy.on('error', () => socket.destroy()); proxy.end();
  });
  return server;
}
if (require.main === module) createPreview().listen(Number(process.env.GUI_PREVIEW_PORT || 3101), '127.0.0.1', () => console.log('GUI preview: http://127.0.0.1:' + (process.env.GUI_PREVIEW_PORT || 3101)));
module.exports = { createPreview, pages };
