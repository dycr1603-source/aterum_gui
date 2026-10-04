'use strict';
const { config, fresh, validateLevels } = require('./jev');

// Runs inside the sole writer, after a live quote and before any exchange mutation.
async function validateJevExecution(request, { db, livePrice, quoteTime, rules, now = Date.now(), cfg = config() }) {
  const receipt = request.tradeContext?.jev;
  if (process.env.STRATEGY_ENGINE === 'two-indicator' && request.tradeContext?.strategy?.version !== 'two-indicator-v1') throw new Error('STRATEGY_RECEIPT_REQUIRED');
  const simpleRequired = process.env.STRATEGY_ENGINE === 'two-indicator' || request.tradeContext?.strategy?.version === 'two-indicator-v1';
  if (simpleRequired && (!cfg.enabled || cfg.observe || receipt?.mode !== 'enforce')) throw new Error('STRATEGY_JEV_ENFORCEMENT_REQUIRED');
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
  if (request.tradeContext?.strategy && result.strategy?.version !== 'two-indicator-v1') throw new Error('STRATEGY_RECEIPT_REQUIRED');
  if (result.strategy?.version === 'two-indicator-v1') {
    const { load, promotion } = require('./strategy/policy');
    const policy = load();
    const report = require('./strategy/engine').readReport();
    if (JSON.stringify(result.strategy.riskPolicy) !== JSON.stringify(policy)) throw new Error('STRATEGY_POLICY_CHANGED');
    if (policy.mode !== 'enforce' || !promotion(policy, report).allowed || result.strategy.reportId !== report?.reportId) throw new Error('STRATEGY_NOT_PROMOTED');
    if (request.leverage < (policy.minLeverage ?? 1) || request.leverage > (policy.maxLeverage ?? 10)) throw new Error('STRATEGY_LEVERAGE_OUT_OF_RANGE');
    const state = await require('./strategy/store').status(db);
    if (state.halted) throw new Error('STRATEGY_CIRCUIT_BREAKER');
    if (!result.risk || request.quantity !== result.risk.quantity || JSON.stringify(request.tradeContext.strategy) !== JSON.stringify(result.strategy)) throw new Error('STRATEGY_RECEIPT_CHANGED');
    const risk = request.quantity * (Math.abs(livePrice - request.stopLoss) + (livePrice + request.stopLoss) * (policy.feeRate + policy.slippageBps / 10000) + livePrice * policy.fundingReserve);
    if (risk > result.risk.riskAtStop + 1e-8) throw new Error('STRATEGY_LIVE_RISK_INCREASED');
  }
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
