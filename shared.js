'use strict';
const mysql  = require('mysql2/promise');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
require('./services/load_env');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'tradingbot',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trading_bot',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  timezone: process.env.DB_TIMEZONE || '+00:00'
});

async function query(sql, params = []) {
  try { const [r] = await db.execute(sql, params); return r; }
  catch(e) { console.error('DB:', e.message); return null; }
}

const TRADES_FILE = process.env.TRADES_FILE || path.join(__dirname, 'trades.json');
const activeTrades = {};
const closedTrades = {};
const symbolCooldowns = {}; // { symbol: expiresAtTimestamp }
try {
  if (fs.existsSync(TRADES_FILE)) {
    const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    Object.assign(activeTrades, data);
  }
} catch(e) {}

function saveTrades() {
  try { fs.writeFileSync(TRADES_FILE, JSON.stringify(activeTrades)); } catch(e) {}
}

const API_KEY_ACCT    = process.env.BINANCE_API_KEY || '';
const API_SECRET_ACCT = process.env.BINANCE_API_SECRET || '';

// Mutable state - exported as object properties so full reassignment works
// via shared.accountState = {...} in route files
const shared = {
  db,
  query,
  activeTrades,
  closedTrades,
  symbolCooldowns,
  saveTrades,
  API_KEY_ACCT,
  API_SECRET_ACCT,
  crypto_acct: crypto,
  accountState: {
    balance: 0, available: 0, totalMargin: 0,
    totalUnreal: 0, openPositions: 0, positions: {}, ts: Date.now()
  },
  cbState: {
    active: false, direction: null, triggeredAt: null, consecutiveSL: 0, lastDirection: null
  },
  acctSSEClients: [],
  acctWSClients: new Set(),
};

shared.broadcastAccount = function() {
  const packet = JSON.stringify(shared.accountState);
  const msg = 'data: ' + packet + '\n\n';
  shared.acctSSEClients.forEach((r, i) => {
    try { r.write(msg); } catch(e) { shared.acctSSEClients.splice(i, 1); }
  });
  shared.acctWSClients.forEach(ws => {
    try {
      if (ws.readyState === 1) ws.send(packet);
      else shared.acctWSClients.delete(ws);
    } catch(e) {
      shared.acctWSClients.delete(ws);
    }
  });
};

module.exports = shared;
module.exports.symbolCooldowns = symbolCooldowns;
