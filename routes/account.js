'use strict';
const express   = require('express');
const https     = require('https');
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');
const router    = express.Router();
const shared    = require('../shared');

const { API_KEY_ACCT, API_SECRET_ACCT, crypto_acct, activeTrades } = shared;

// ── Realtime market transport: Binance WS -> local WS/SSE fanout ──────────────
const sseClients = {}, wsClients = {}, activeWS = {}, lastMarketPacket = {}, latestPrices = {}, latestPriceTs = {};
let realtimeWSS = null;

function hasMarketSubscribers(symbol) {
  return !!((sseClients[symbol] && sseClients[symbol].length) || (wsClients[symbol] && wsClients[symbol].size));
}

function broadcastMarket(symbol, data) {
  const packet = JSON.stringify(data);
  lastMarketPacket[symbol] = packet;
  const sseMsg = 'data: ' + packet + '\n\n';

  (sseClients[symbol] || []).forEach((res, index) => {
    try { res.write(sseMsg); }
    catch (e) { sseClients[symbol].splice(index, 1); }
  });

  if (wsClients[symbol]) {
    wsClients[symbol].forEach(ws => {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(packet);
        else wsClients[symbol].delete(ws);
      } catch (e) {
        wsClients[symbol].delete(ws);
      }
    });
  }
}

function startWS(symbol) {
  if (activeWS[symbol]) return;
  const ws = new WebSocket('wss://fstream.binance.com/ws/' + symbol.toLowerCase() + '@kline_1h');
  ws.on('message', raw => {
    try {
      const k = JSON.parse(raw).k;
      latestPrices[symbol] = +k.c;
      latestPriceTs[symbol] = Date.now();
      broadcastMarket(symbol, { type: 'candle', candle: { time: Math.floor(k.t/1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, closed: k.x } });
    } catch(e) {}
  });
  ws.on('close', () => {
    delete activeWS[symbol];
    if (hasMarketSubscribers(symbol)) setTimeout(() => startWS(symbol), 1000);
  });
  ws.on('error', () => ws.close());
  activeWS[symbol] = ws;
}
function stopWS(symbol) {
  if (activeWS[symbol]) {
    activeWS[symbol].terminate();
    delete activeWS[symbol];
  }
}

function attachRealtimeServer(server) {
  if (realtimeWSS) return realtimeWSS;
  realtimeWSS = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });
  realtimeWSS.on('connection', (socket, req) => {
    socket.on('error', () => {
      try { socket.terminate(); } catch (e) {}
    });

    const url = new URL(req.url, 'http://localhost');
    const channel = url.searchParams.get('channel');

    if (channel === 'market') {
      const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
      if (!wsClients[symbol]) wsClients[symbol] = new Set();
      wsClients[symbol].add(socket);
      startWS(symbol);
      if (lastMarketPacket[symbol]) {
        try { socket.send(lastMarketPacket[symbol]); } catch (e) {}
      }
      socket.on('close', () => {
        if (wsClients[symbol]) {
          wsClients[symbol].delete(socket);
          if (!hasMarketSubscribers(symbol)) stopWS(symbol);
        }
      });
      return;
    }

    if (channel === 'account') {
      shared.acctWSClients.add(socket);
      try { socket.send(JSON.stringify(shared.accountState)); } catch (e) {}
      socket.on('close', () => shared.acctWSClients.delete(socket));
      return;
    }

    try { socket.close(1008, 'Invalid channel'); } catch (e) {}
  });
  return realtimeWSS;
}

// ── Binance HTTP helpers ────────────────────────────────────────────────────────
function signAcct(params) {
  const obj = { ...params, timestamp: Date.now(), recvWindow: 60000 };
  const qs  = Object.entries(obj).map(([k,v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return qs + '&signature=' + crypto_acct.createHmac('sha256', API_SECRET_ACCT).update(qs).digest('hex');
}
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    require('https').get(url, { headers }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}
function httpsPost(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers };
    const req = require('https').request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.end();
  });
}

// ── Account state management ────────────────────────────────────────────────────
let listenKey = null, accountWS = null, listenKeyInterval = null;

async function fetchAccountSnapshot() {
  try {
    const [balances, positions] = await Promise.all([
      httpsGet(`https://fapi.binance.com/fapi/v2/balance?${signAcct({})}`, { 'X-MBX-APIKEY': API_KEY_ACCT }),
      httpsGet(`https://fapi.binance.com/fapi/v2/positionRisk?${signAcct({})}`, { 'X-MBX-APIKEY': API_KEY_ACCT })
    ]);
    const usdt    = (Array.isArray(balances) ? balances : []).find(b => b.asset === 'USDT') || {};
    const openPos = (Array.isArray(positions) ? positions : []).filter(p => Math.abs(parseFloat(p.positionAmt || 0)) > 0);
    const posMap  = {};
    openPos.forEach(p => {
      posMap[p.symbol] = {
        side:        parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT',
        unrealized:  parseFloat(p.unRealizedProfit || 0),
        margin:      parseFloat(p.isolatedWallet || 0),
        markPrice:   parseFloat(p.markPrice || 0),
        entryPrice:  parseFloat(p.entryPrice || 0),
        leverage:    parseFloat(p.leverage || 1)
      };
    });
    const bal    = parseFloat(usdt.balance || 0);
    const unreal = openPos.reduce((s, p) => s + parseFloat(p.unRealizedProfit || 0), 0);
    shared.accountState = {
      balance:       bal,
      equity:        bal + unreal,
      available:     parseFloat(usdt.availableBalance || 0),
      totalMargin:   openPos.reduce((s, p) => s + parseFloat(p.isolatedWallet || 0), 0),
      totalUnreal:   unreal,
      openPositions: openPos.length,
      positions:     posMap,
      ts:            Date.now()
    };
    shared.broadcastAccount();
  } catch(e) { console.error('[Account] Snapshot error:', e.message); }
}

async function startUserDataStream() {
  try {
    const keyData = await httpsPost(`https://fapi.binance.com/fapi/v1/listenKey`, { 'X-MBX-APIKEY': API_KEY_ACCT, 'Content-Type': 'application/json' });
    listenKey = keyData.listenKey;
    if (!listenKey) throw new Error('No listenKey received');
    console.log(`[Account WS] Listen key obtained`);
    await fetchAccountSnapshot();
    if (accountWS) try { accountWS.terminate(); } catch(e) {}
    accountWS = new WebSocket(`wss://fstream.binance.com/ws/${listenKey}`);
    accountWS.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.e === 'ACCOUNT_UPDATE') {
          const a = msg.a || {};
          (a.B || []).forEach(b => {
            if (b.a === 'USDT') {
              shared.accountState.balance   = parseFloat(b.wb || 0);
              shared.accountState.available = parseFloat(b.cw || 0);
            }
          });
          (a.P || []).forEach(p => {
            const sym = p.s, amt = parseFloat(p.pa || 0);
            if (Math.abs(amt) > 0) {
              shared.accountState.positions[sym] = {
                ...shared.accountState.positions[sym],
                unrealized: parseFloat(p.up || 0),
                margin:     parseFloat(p.iw || 0),
                side:       amt > 0 ? 'LONG' : 'SHORT'
              };
            } else { delete shared.accountState.positions[sym]; }
          });
          shared.accountState.totalUnreal   = Object.values(shared.accountState.positions).reduce((s, p) => s + (p.unrealized || 0), 0);
          shared.accountState.totalMargin   = Object.values(shared.accountState.positions).reduce((s, p) => s + (p.margin || 0), 0);
          shared.accountState.openPositions = Object.keys(shared.accountState.positions).length;
          shared.accountState.equity        = shared.accountState.balance + shared.accountState.totalUnreal;
          shared.accountState.ts            = Date.now();
          shared.broadcastAccount();
        }
        if (msg.e === 'ORDER_TRADE_UPDATE') {
          const o = msg.o || {};
          if (o.X === 'FILLED' || o.X === 'PARTIALLY_FILLED') { setTimeout(fetchAccountSnapshot, 1000); }
        }
      } catch(e) { console.error('[Account WS] Parse error:', e.message); }
    });
    accountWS.on('close', () => { console.log('[Account WS] Closed — reconnecting in 5s'); setTimeout(startUserDataStream, 5000); });
    accountWS.on('error', e => { console.error('[Account WS] Error:', e.message); });
    if (listenKeyInterval) clearInterval(listenKeyInterval);
    listenKeyInterval = setInterval(async () => {
      try {
        await httpsPost(`https://fapi.binance.com/fapi/v1/listenKey`, { 'X-MBX-APIKEY': API_KEY_ACCT });
        console.log('[Account WS] Listen key refreshed');
      } catch(e) { console.error('[Account WS] Keep-alive error:', e.message); }
    }, 30 * 60 * 1000);
  } catch(e) {
    console.error('[Account WS] Start error:', e.message, '— retry in 10s');
    setTimeout(startUserDataStream, 10000);
  }
}

// Update unrealized PnL every 3s
async function updateUnrealized() {
  if (Object.keys(shared.accountState.positions).length === 0) return;
  try {
    const symbols = Object.keys(shared.accountState.positions);
    await Promise.all(symbols.map(async sym => {
      const freshMark = latestPrices[sym] != null && (Date.now() - (latestPriceTs[sym] || 0) < 5000)
        ? latestPrices[sym]
        : null;
      const mark = freshMark != null
        ? freshMark
        : parseFloat((await httpsGet(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`)).price || 0);
      if (mark > 0 && shared.accountState.positions[sym]) {
        const pos   = shared.accountState.positions[sym];
        const entry = pos.entryPrice || 0;
        const trade = activeTrades[sym];
        if (trade && entry > 0) {
          const q      = parseFloat(trade.qty || 0);
          const unreal = pos.side === 'SHORT' ? (entry - mark) * q : (mark - entry) * q;
          shared.accountState.positions[sym].unrealized = +unreal.toFixed(4);
          shared.accountState.positions[sym].markPrice  = mark;
          latestPrices[sym] = mark;
          latestPriceTs[sym] = Date.now();
        }
      }
    }));
    shared.accountState.totalUnreal = Object.values(shared.accountState.positions).reduce((s, p) => s + (p.unrealized || 0), 0);
    shared.accountState.equity      = shared.accountState.balance + shared.accountState.totalUnreal;
    shared.accountState.ts          = Date.now();
  } catch(e) {}
  if (shared.acctSSEClients.length > 0) {
    const msg = 'data: ' + JSON.stringify(shared.accountState) + '\n\n';
    shared.acctSSEClients.forEach((r, i) => { try { r.write(msg); } catch(e) { shared.acctSSEClients.splice(i, 1); } });
  }
}

// Start on module load
startUserDataStream();
setInterval(updateUnrealized, 3000);
setInterval(fetchAccountSnapshot, 30000);

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/api/klines', (req, res) => {
  const { symbol = 'BTCUSDT', interval = '1h', limit = '100' } = req.query;
  https.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { res.set('Content-Type', 'application/json'); res.send(d); });
  }).on('error', e => res.status(500).json({ error: e.message }));
});

router.get('/api/price', (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';
  https.get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { res.set('Content-Type', 'application/json'); res.send(d); });
  }).on('error', e => res.status(500).json({ error: e.message }));
});

router.get('/api/depth', (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const limit = req.query.limit || '24';
  https.get(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=${limit}`, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { res.set('Content-Type', 'application/json'); res.send(d); });
  }).on('error', e => res.status(500).json({ error: e.message }));
});

router.get('/api/recent-trades', (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const limit = req.query.limit || '24';
  https.get(`https://fapi.binance.com/fapi/v1/trades?symbol=${symbol}&limit=${limit}`, r => {
    let d = ''; r.on('data', c => d += c);
    r.on('end', () => { res.set('Content-Type', 'application/json'); res.send(d); });
  }).on('error', e => res.status(500).json({ error: e.message }));
});

router.get('/api/stream/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  if (!sseClients[symbol]) sseClients[symbol] = [];
  sseClients[symbol].push(res);
  startWS(symbol);
  if (lastMarketPacket[symbol]) res.write('data: ' + lastMarketPacket[symbol] + '\n\n');
  req.on('close', () => {
    sseClients[symbol] = (sseClients[symbol] || []).filter(r => r !== res);
    if (!hasMarketSubscribers(symbol)) stopWS(symbol);
  });
});

router.get('/api/account', (req, res) => res.json(shared.accountState));

router.get('/api/account/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  shared.acctSSEClients.push(res);
  res.write('data: ' + JSON.stringify(shared.accountState) + '\n\n');
  req.on('close', () => {
    const i = shared.acctSSEClients.indexOf(res);
    if (i !== -1) shared.acctSSEClients.splice(i, 1);
  });
});

router.get('/api/all-prices', async (req, res) => {
  const symbols = [...Object.keys(shared.activeTrades), ...Object.keys(shared.closedTrades)];
  const results = {};
  const stale = [];
  symbols.forEach(sym => {
    const age = Date.now() - (latestPriceTs[sym] || 0);
    if (latestPrices[sym] != null && age < 10000) results[sym] = latestPrices[sym];
    else stale.push(sym);
  });
  await Promise.all(stale.map(sym => new Promise(resolve => {
    https.get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        try {
          results[sym] = parseFloat(JSON.parse(d).price);
          latestPrices[sym] = results[sym];
          latestPriceTs[sym] = Date.now();
        } catch(e) {}
        resolve();
      });
    }).on('error', () => resolve());
  })));
  res.json(results);
});

module.exports = router;
module.exports.attachRealtimeServer = attachRealtimeServer;
