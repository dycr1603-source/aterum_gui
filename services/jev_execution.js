'use strict';
const { config, fresh, validateLevels } = require('./jev');

// Runs inside the sole writer, after a live quote and before any exchange mutation.
async function validateJevExecution(request, { db, livePrice, quoteTime, rules, now = Date.now(), cfg = config() }) {
  const receipt = request.tradeContext?.jev;
  if (receipt?.mode === 'enforce' && (!cfg.enabled || cfg.observe)) throw new Error('JEV_ENFORCEMENT_DISABLED');
  if (!cfg.enabled && (!receipt || receipt.mode === 'observe')) return;
  if (cfg.observe && (!receipt || receipt.mode === 'observe')) return; // baseline pipeline only
  if (!receipt || receipt.mode !== 'enforce' || !/^[a-f0-9]{64}$/.test(receipt.id || '')) throw new Error('JEV_RECEIPT_REQUIRED');
  const [rows] = await db.execute('SELECT result FROM jev_decisions WHERE id=?', [receipt.id]);
  const result = rows[0]?.result ? JSON.parse(rows[0].result) : null;
  if (!result || result.mode !== 'enforce' || result.id !== receipt.id || result.symbol !== request.symbol ||
      result.decision !== request.positionSide || !result.proposal) throw new Error('JEV_RECEIPT_REJECTED');
  if (result.provider !== cfg.provider) throw new Error('JEV_PROVIDER_CHANGED');
  fresh(result.marketDataAt, now, cfg.maxAgeMs);
  fresh(quoteTime, now, cfg.maxAgeMs);
  if (!Number.isFinite(result.expiresAt) || now > result.expiresAt) throw new Error('JEV_STALE_DATA');
  const p = result.proposal;
  if (!Number.isInteger(p.leverage) || p.leverage < 1 || p.leverage > 10 || request.leverage !== p.leverage)
    throw new Error('JEV_LEVERAGE_CHANGED');
  if (request.stopLoss !== p.sl || request.takeProfit !== p.tp) throw new Error('JEV_LEVELS_CHANGED');
  if (Math.abs(livePrice / p.entry - 1) * 100 > cfg.maxDriftPct) throw new Error('JEV_PRICE_DRIFT');
  validateLevels(p, livePrice, { tickSize: rules.tick, minPrice: rules.minPrice, maxPrice: rules.maxPrice });
  // Bind all replays of a decision to the same existing engine idempotency key.
  const hex = result.id.slice(0, 32);
  const expected = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  if (request.executionId !== expected) throw new Error('JEV_EXECUTION_ID_MISMATCH');
}
module.exports = { validateJevExecution };
