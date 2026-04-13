'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { activeTrades, closedTrades, saveTrades } = shared;

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

router.get('/trades', (req, res) => res.json({ active: activeTrades, closed: closedTrades }));

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
