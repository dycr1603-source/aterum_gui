'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { activeTrades, closedTrades, saveTrades, query } = shared;

function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPositiveNum(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function millis(value, fallback = Date.now()) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLiveOnlyTrade(symbol, pos) {
  const qty = Math.abs(parseFloat(pos?.qty ?? pos?.positionAmt ?? 0)) || 0;
  const entryPrice = parseFloat(pos?.entryPrice || pos?.markPrice || 0) || 0;
  return {
    symbol,
    side: pos?.side || 'LONG',
    entryPrice,
    sl: (Number.isFinite(parseFloat(pos?.sl)) && parseFloat(pos?.sl) > 0) ? parseFloat(pos.sl) : null,
    tp: (Number.isFinite(parseFloat(pos?.tp)) && parseFloat(pos?.tp) > 0) ? parseFloat(pos.tp) : null,
    qty,
    leverage: parseFloat(pos?.leverage || 1) || 1,
    openedAt: shared.accountState?.ts || Date.now(),
    finalScore: null,
    aiRegime: 'LIVE',
    aiBias: pos?.side || 'N/A',
    stage: 'LIVE_ONLY',
    status: 'open',
    initialSL: null,
    source: 'BINANCE_LIVE',
    unrealized: parseFloat(pos?.unrealized || 0) || 0,
    markPrice: parseFloat(pos?.markPrice || 0) || 0,
    hasSL: !!pos?.hasSL,
    hasTP: !!pos?.hasTP
  };
}

function buildDbClosedTrade(row) {
  const entryPrice = num(row.entry_price, 0);
  const exitPrice = num(row.exit_price, entryPrice);
  const qty = num(row.qty, 0);
  const openedAt = millis(row.opened_at, millis(row.created_at));
  const closedAt = millis(row.closed_at, Date.now());

  return {
    symbol: row.symbol,
    side: row.direction || row.side || 'N/A',
    entryPrice,
    sl: num(row.sl_price),
    tp: num(row.tp_price),
    qty,
    leverage: num(row.leverage, 1),
    openedAt,
    finalScore: num(row.final_score),
    aiRegime: row.ai_regime || 'N/A',
    aiBias: row.ai_bias || row.direction || 'N/A',
    stage: row.trailing_stage || 'CLOSED',
    status: 'closed',
    initialSL: num(row.initial_sl || row.sl_price),
    closedAt,
    duration: Math.max(0, closedAt - openedAt),
    exitPrice,
    finalPnL: num(row.pnl_usdt, 0),
    finalR: String(num(row.r_final, 0)),
    closeReason: row.close_reason || 'db',
    source: 'MYSQL'
  };
}

async function buildTradesSnapshot() {
  const mergedActive = { ...activeTrades };
  const mergedClosed = { ...closedTrades };
  const livePositions = shared.accountState?.positions || {};

  Object.entries(livePositions).forEach(([symbol, pos]) => {
    if (!mergedActive[symbol]) {
      mergedActive[symbol] = buildLiveOnlyTrade(symbol, pos);
    } else if (!mergedActive[symbol].source) {
      mergedActive[symbol].source = 'WORKFLOW';
    }
    if (mergedActive[symbol]) {
      mergedActive[symbol] = {
        ...mergedActive[symbol],
        side: pos?.side || mergedActive[symbol].side,
        entryPrice: num(pos?.entryPrice, num(mergedActive[symbol].entryPrice, 0)),
        qty: num(pos?.qty, Math.abs(num(pos?.positionAmt, 0))) || num(mergedActive[symbol].qty, 0),
        leverage: num(pos?.leverage, num(mergedActive[symbol].leverage, 1)),
        markPrice: num(pos?.markPrice),
        unrealized: num(pos?.unrealized, 0),
        sl: optionalPositiveNum(pos?.sl, optionalPositiveNum(mergedActive[symbol].sl)),
        tp: optionalPositiveNum(pos?.tp, optionalPositiveNum(mergedActive[symbol].tp)),
        hasSL: !!pos?.hasSL || optionalPositiveNum(pos?.sl, optionalPositiveNum(mergedActive[symbol].sl)) != null,
        hasTP: !!pos?.hasTP || optionalPositiveNum(pos?.tp, optionalPositiveNum(mergedActive[symbol].tp)) != null,
        liveSyncedAt: shared.accountState?.ts || Date.now()
      };
    }
  });

  const rows = await query(`
    SELECT
      t.*,
      tc.exit_price,
      tc.pnl_usdt,
      tc.r_final,
      tc.close_reason,
      tc.closed_at
    FROM trades t
    JOIN trade_closes tc ON tc.trade_id = t.id
    WHERE t.status = 'CLOSED'
    ORDER BY tc.closed_at DESC
    LIMIT 50
  `);

  if (Array.isArray(rows)) {
    rows.forEach(row => {
      if (!mergedClosed[row.symbol]) {
        mergedClosed[row.symbol] = buildDbClosedTrade(row);
      }
    });
  }

  return { active: mergedActive, closed: mergedClosed };
}

async function buildDailySnapshot() {
  const todayRows = await query(`
    SELECT
      ROUND(COALESCE(SUM(tc.pnl_usdt),0), 8) AS dailyPnl,
      COUNT(*) AS closedTrades,
      MAX(tc.closed_at) AS lastClosedAt
    FROM trade_closes tc
    WHERE DATE(tc.closed_at) = UTC_DATE()
  `);
  const row = Array.isArray(todayRows) ? todayRows[0] : {};
  const balance = num(shared.accountState?.balance, 0);
  const totalMargin = num(shared.accountState?.totalMargin, 0);
  const dailyPnl = num(row?.dailyPnl, 0);
  return {
    dailyPnl,
    dailyRoi: balance > 0 ? (dailyPnl / balance) * 100 : 0,
    marginPct: balance > 0 ? (totalMargin / balance) * 100 : 0,
    closedTrades: num(row?.closedTrades, 0),
    lastClosedAt: row?.lastClosedAt || null
  };
}

function buildPriceSnapshot(trades) {
  const prices = {};
  Object.entries(shared.accountState?.positions || {}).forEach(([symbol, pos]) => {
    if (num(pos?.markPrice, 0) > 0) prices[symbol] = num(pos.markPrice, 0);
  });
  Object.entries(trades.active || {}).forEach(([symbol, trade]) => {
    if (prices[symbol] == null && num(trade?.markPrice, 0) > 0) prices[symbol] = num(trade.markPrice, 0);
  });
  return prices;
}

router.post('/trade', (req, res) => {
  const t = req.body;
  if (!t.symbol) return res.status(400).json({ error: 'symbol required' });
  activeTrades[t.symbol] = {
    symbol: t.symbol, side: t.side, entryPrice: t.entryPrice,
    sl: t.sl, tp: t.tp, qty: t.qty, leverage: t.leverage,
    openedAt: t.openedAt || Date.now(), finalScore: t.finalScore,
    aiRegime: t.aiResult?.regime || 'N/A', aiBias: t.aiResult?.direction_bias || 'N/A',
    stage: t.stage || 'INITIAL', status: 'open', initialSL: t.initialSL || t.sl
  };
  delete closedTrades[t.symbol];
  saveTrades();
  console.log(`Trade abierto: ${t.symbol} ${t.side} @ ${t.entryPrice}`);
  res.json({ ok: true });
});

router.delete('/trade/:symbol', (req, res) => {
  const symbol    = req.params.symbol.toUpperCase();
  const reason    = req.query.reason || 'manual';
  const exitPrice = req.query.exitPrice ? parseFloat(req.query.exitPrice) : null;
  if (activeTrades[symbol]) {
    const t   = activeTrades[symbol];
    const ep  = exitPrice || t.entryPrice;
    const pnl = t.side === 'SHORT' ? (t.entryPrice - ep) * t.qty : (ep - t.entryPrice) * t.qty;
    const ir  = Math.abs(t.entryPrice - t.sl);
    const fr  = ir > 0 ? ((Math.abs(ep - t.entryPrice) / ir) * (pnl >= 0 ? 1 : -1)).toFixed(2) : '0';
    closedTrades[symbol] = {
      ...t, status: 'closed', closedAt: Date.now(),
      duration: Date.now() - t.openedAt, exitPrice: ep,
      finalPnL: +pnl.toFixed(2), finalR: fr, closeReason: reason
    };
    delete activeTrades[symbol];
    saveTrades();
    console.log(`Trade cerrado: ${symbol} reason=${reason} pnl=${pnl.toFixed(2)}`);
  }
  res.json({ ok: true, closed: symbol });
});

router.get('/trades', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await buildTradesSnapshot());
});

router.get('/api/dashboard/state', async (req, res) => {
  const snapshotTs = Date.now();
  const trades = await buildTradesSnapshot();
  const stats = await buildDailySnapshot();
  const prices = buildPriceSnapshot(trades);
  res.set('Cache-Control', 'no-store');
  res.json({
    ts: snapshotTs,
    account: shared.accountState,
    trades,
    prices,
    stats,
    sources: {
      accountTs: shared.accountState?.ts || null,
      tradesTs: snapshotTs,
      statsTs: snapshotTs
    }
  });
});

router.post('/sync', (req, res) => {
  const activeSymbols = req.body.symbols || [];
  Object.keys(activeTrades).forEach(symbol => {
    if (!activeSymbols.includes(symbol)) {
      const t = activeTrades[symbol];
      closedTrades[symbol] = { ...t, status: 'closed', closedAt: Date.now(), duration: Date.now() - t.openedAt, closeReason: 'sync', finalPnL: 0, finalR: '0' };
      delete activeTrades[symbol];
    }
  });
  saveTrades();
  res.json({ ok: true, active: Object.keys(activeTrades) });
});

module.exports = router;
