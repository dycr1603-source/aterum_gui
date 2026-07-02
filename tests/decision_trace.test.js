'use strict';

const assert = require('assert');
const { buildDecisionTrace, buildSizingTrace } = require('../services/decision_trace');

const trace = buildDecisionTrace({
  symbol: 'BTCUSDT',
  direction: 'LONG',
  technicalScore: 100,
  finalScore: 97,
  threshold: 65,
  technicalContributions: [
    { component: 'base', value: 35 },
    { component: 'trend_1h', value: 40 },
    { component: 'trend_4h', value: 15 },
    { component: 'macro', value: 10 },
    { component: 'intelligence', value: 8 },
    { component: 'learning.session', delta: -99 }
  ],
  learningContributions: [
    { component: 'learning.session', delta: -2, ruleId: 18, researchFactor: 1, reviewFactor: 1 },
    { component: 'learning.symbol', delta: -1, ruleId: 3, researchFactor: 0.985, reviewFactor: 1 }
  ],
  learningDelta: -3,
  generatedAt: '2026-07-02T00:00:00.000Z'
});

assert.equal(trace.technicalRawScore, 108);
assert.equal(trace.technicalClampAdjustment, -8);
assert.equal(trace.technicalScore, 100);
assert.equal(trace.learningDelta, -3);
assert.equal(trace.preClampScore, 97);
assert.equal(trace.finalScore, 97);
assert.equal(trace.reconstruction.reconstructedFinal, 97);
assert.equal(trace.reconstruction.valid, true);
assert.equal(trace.contributions.filter(row => row.stage === 'learning').length, 2);
assert.equal(trace.contributions.some(row => row.delta === -99), false, 'duplicated opportunity Learning leaked into trace');

const fallback = buildDecisionTrace({ technicalScore: 72, finalScore: 72, threshold: 65,
  generatedAt: '2026-07-02T00:00:00.000Z' });
assert.equal(fallback.contributions[0].component, 'technical.composite');
assert.equal(fallback.reconstruction.valid, true);

const sizing = buildSizingTrace({
  finalScore: 92,
  riskPct: 1.25,
  maxLoss: 2.5,
  qty: 0.01,
  leverage: 5,
  marginRequired: 20,
  sizingInfo: { effectiveRisk: '2.50%', actualRisk: '1.25%', scoreMultiplier: 1.5,
    regimeMultiplier: 1.1, tf4hMultiplier: 1.1, macroSizeMultiplier: 0.75 },
  portfolioCapacity: { allowed: true, account: { equity: 200, marginUsagePct: 30 },
    risk: { openRiskPct: 3, remainingRiskPct: 2, remainingRiskAmount: 4 },
    capacity: { remainingMargin: 100 }, exposure: { totalPct: 150 } },
  generatedAt: '2026-07-02T00:00:00.000Z'
});
assert.equal(sizing.requestedRiskPct, 2.5);
assert.equal(sizing.actualRiskPct, 1.25);
assert.equal(sizing.portfolioPreflight.remainingRiskPct, 2);
assert.equal(sizing.multipliers.score, 1.5);

console.log('decision trace tests: ok');
