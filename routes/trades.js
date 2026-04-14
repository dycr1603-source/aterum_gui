'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { activeTrades, closedTrades, saveTrades } = shared;

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

router.get('/trades', (req, res) => {
  const mergedActive = { ...activeTrades };
  const livePositions = shared.accountState?.positions || {};

  Object.entries(livePositions).forEach(([symbol, pos]) => {
    if (!mergedActive[symbol]) {
      mergedActive[symbol] = buildLiveOnlyTrade(symbol, pos);
    } else if (!mergedActive[symbol].source) {
      mergedActive[symbol].source = 'WORKFLOW';
    }
  });

  res.json({ active: mergedActive, closed: closedTrades });
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
