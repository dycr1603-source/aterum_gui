"use strict";

function liveRisk({ quantity, entry, stop, target, feeRate, slippageBps, fundingReserve }) {
  const costs = (entry + stop) * (feeRate + slippageBps / 10000) + entry * fundingReserve;
  const risk = quantity * (Math.abs(entry - stop) + costs);
  const reward = quantity * (Math.abs(target - entry) -
    (entry + target) * (feeRate + slippageBps / 10000) - entry * fundingReserve);
  if (!(Number.isFinite(risk) && risk > 0 && Number.isFinite(reward))) throw Error('STRATEGY_LIVE_RISK_INVALID');
  return { risk, reward, expectedR: reward / risk };
}

function assertPortfolioRisk({ risk, equity, openRisk, positions, policy }) {
  if (!(Number.isFinite(risk) && risk > 0 && Number.isFinite(equity) && equity > 0 &&
      Number.isFinite(openRisk) && openRisk >= 0 && Number.isInteger(positions) && positions >= 0))
    throw Error('STRATEGY_PORTFOLIO_RISK_UNAVAILABLE');
  if (risk > equity * policy.riskFraction + 1e-8 ||
      risk + openRisk > equity * policy.maxPortfolioRisk + 1e-8 ||
      positions >= policy.maxPositions) throw Error('STRATEGY_PORTFOLIO_RISK_EXCEEDED');
}

module.exports = { liveRisk, assertPortfolioRisk };
