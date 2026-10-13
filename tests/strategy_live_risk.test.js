"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { liveRisk, executionRiskLimit, assertPortfolioRisk } = require('../services/strategy/live-risk');
const { levelOptions } = require('../services/strategy/jev_policy');

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

test('GTC-style entry keeps room for price drift without raising the risk budget', () => {
  const base = { quantity: 429.5, entry: 0.23674, stop: 0.23159, target: 0.24504,
    feeRate: 0.001, slippageBps: 5, fundingReserve: 0.001 };
  const quoted = liveRisk(base).risk;
  const cap = executionRiskLimit({ ...base, side: 'LONG', maxDriftPct: 0.5, allowedRisk: 12 });
  assert(cap > quoted);
  assert(liveRisk({ ...base, entry: base.entry * 1.003 }).risk <= cap);
  assert(liveRisk({ ...base, entry: base.entry * 1.006 }).risk > cap);
  assert.equal(executionRiskLimit({ ...base, side: 'LONG', maxDriftPct: 0.5, allowedRisk: quoted }), quoted);
  const short = { ...base, stop: 0.24504, target: 0.23159 };
  const shortCap = executionRiskLimit({ ...short, side: 'SHORT', maxDriftPct: 0.5, allowedRisk: 12 });
  assert(liveRisk({ ...short, entry: short.entry * 0.997 }).risk <= shortCap);
  assert(liveRisk({ ...short, entry: short.entry * 0.994 }).risk > shortCap);
});

test('offered take profits preserve the net reward floor after one adverse tick', () => {
  const entry = 0.1261, tick = 0.0001;
  const candles = Array.from({ length: 12 }, (_, i) => ({
    low: 0.123 + i * 0.0001, high: 0.13 + i * 0.0001 }));
  const riskPolicy = { feeRate: 0.001, slippageBps: 5, fundingReserve: 0.001, minExpectedR: 1.1 };
  const d = { indicators: { atr: 0.001 }, strategy: { version: 'new-opportunistic-v1',
    directions: ['LONG', 'SHORT'], regime: 'TRENDING', recentCandles: candles,
    shortTerm: { recentCandles: candles, atr: 0.001 }, riskPolicy } };
  const offered = levelOptions(d, entry, { tickSize: String(tick), minPrice: '0.0001', maxPrice: '200' }, 0.5);
  for (const [side, prices] of Object.entries(offered)) {
    const adverse = entry + (side === 'LONG' ? tick : -tick);
    for (const stop of Object.values(prices.sl)) for (const target of Object.values(prices.tp)) {
      const rr = liveRisk({ quantity: 1, entry: adverse, stop, target,
        feeRate: riskPolicy.feeRate, slippageBps: riskPolicy.slippageBps,
        fundingReserve: riskPolicy.fundingReserve }).expectedR;
      assert(rr + 1e-8 >= riskPolicy.minExpectedR, `${side} ${stop}/${target}: ${rr}`);
    }
  }
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
