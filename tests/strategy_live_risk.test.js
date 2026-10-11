"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { liveRisk, assertPortfolioRisk } = require('../services/strategy/live-risk');

const policy = { riskFraction: 0.22, maxPortfolioRisk: 0.44, maxPositions: 2,
  feeRate: 0.001, slippageBps: 5, fundingReserve: 0.001, minExpectedR: 1.5 };

test('a small live quote change can raise stop loss without crossing portfolio limits', () => {
  const proposal = { quantity: 0.003, entry: 81362, stop: 85787.9, target: 70297.2,
    feeRate: policy.feeRate, slippageBps: policy.slippageBps, fundingReserve: policy.fundingReserve };
  const quoted = liveRisk(proposal);
  const current = liveRisk({ ...proposal, entry: proposal.entry - 0.01 });
  assert(current.risk > quoted.risk);
  assert(current.expectedR >= policy.minExpectedR);
  assert.doesNotThrow(() => assertPortfolioRisk({ risk: current.risk, equity: 86.6067,
    openRisk: 0, positions: 0, policy }));
});

test('live stop risk still rejects per-trade and aggregate overspend', () => {
  const base = { equity: 100, openRisk: 0, positions: 0, policy };
  assert.throws(() => assertPortfolioRisk({ ...base, risk: 22.01 }), /STRATEGY_PORTFOLIO_RISK_EXCEEDED/);
  assert.throws(() => assertPortfolioRisk({ ...base, risk: 21, openRisk: 24 }), /STRATEGY_PORTFOLIO_RISK_EXCEEDED/);
  assert.throws(() => assertPortfolioRisk({ ...base, risk: 1, positions: 2 }), /STRATEGY_PORTFOLIO_RISK_EXCEEDED/);
  assert.throws(() => assertPortfolioRisk({ ...base, risk: 1, openRisk: NaN }), /STRATEGY_PORTFOLIO_RISK_UNAVAILABLE/);
});

test('live reward ratio is recalculated at the new quote', () => {
  const proposal = { quantity: 1, entry: 100, stop: 103, target: 96,
    feeRate: policy.feeRate, slippageBps: policy.slippageBps, fundingReserve: policy.fundingReserve };
  const quoted = liveRisk(proposal);
  const current = liveRisk({ ...proposal, entry: 99.6 });
  assert(quoted.expectedR > current.expectedR);
  assert(current.expectedR < policy.minExpectedR);
});
