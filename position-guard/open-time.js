'use strict';

// Rewind signed fills from the current Binance quantity to the first fill of
// the still-open net position. No estimate is returned for incomplete history.
function inferOpenTime(position, fills, { now = Date.now(), historyStart = now - 7 * 86400000 } = {}) {
  if (!Array.isArray(fills) || fills.length >= 1000 || !Number.isFinite(position.qty) || position.qty <= 0) return null;
  const side = position.side;
  const relevant = fills.filter(fill => fill.positionSide === side || fill.positionSide === 'BOTH');
  relevant.sort((a,b) => Number(b.time)-Number(a.time) || Number(b.id)-Number(a.id));
  let quantity = position.qty;
  const tolerance = Math.max(1e-8, position.qty * 1e-7);
  for (const fill of relevant) {
    const time = Number(fill.time), qty = Number(fill.qty);
    if (!Number.isFinite(time) || time < historyStart || time > now || !Number.isFinite(qty) || qty <= 0) return null;
    const opening = side === 'LONG' ? fill.side === 'BUY' : fill.side === 'SELL';
    const closing = side === 'LONG' ? fill.side === 'SELL' : fill.side === 'BUY';
    if (!opening && !closing) return null;
    quantity += opening ? -qty : qty;
    if (quantity < -tolerance) return null;
    if (Math.abs(quantity) <= tolerance) return time;
  }
  return null;
}

async function readOpenTime(binance, position, now = Date.now()) {
  const start = now - 7 * 86400000;
  const fills = await binance.userTrades(position.symbol, start);
  return inferOpenTime(position, fills, { now, historyStart: start });
}
module.exports = { inferOpenTime, readOpenTime };
