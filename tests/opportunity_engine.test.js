'use strict';

const assert = require('assert');
const engine = require('../services/opportunity_engine');
const { computeLearningBias } = require('../services/learning_bias');

function klineSeries(start, step, count = 100, volume = 1000) {
  return Array.from({ length: count }, (_, index) => {
    const close = start + step * index;
    const open = close - step * 0.4;
    return [index * 3600000, String(open), String(close + Math.abs(step)), String(close - Math.abs(step)), String(close), String(volume + index * 4)];
  });
}

const exchangeInfo = {
  symbols: [
    { symbol: 'AAAUSDT', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDT', underlyingType: 'COIN' },
    { symbol: 'BBBUSDT', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDT', underlyingType: 'COIN' },
    { symbol: 'CCCUSDT', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDT', underlyingType: 'COIN' },
    { symbol: 'OLDUSDT', status: 'SETTLING', contractType: 'PERPETUAL', quoteAsset: 'USDT', underlyingType: 'COIN' }
  ]
};
const tickers = [
  { symbol: 'AAAUSDT', quoteVolume: '500000000', priceChangePercent: '6' },
  { symbol: 'BBBUSDT', quoteVolume: '25000000', priceChangePercent: '1' },
  { symbol: 'CCCUSDT', quoteVolume: '1000000', priceChangePercent: '2' }
];
const now = Date.parse('2026-06-30T00:00:00Z');
const states = new Map([
  ['AAAUSDT', { last_deep_scan_at: '2026-06-29T23:45:00Z', consecutive_skips: 0 }],
  ['BBBUSDT', { last_deep_scan_at: '2026-06-29T18:00:00Z', consecutive_skips: 2 }]
]);

const universe = engine.buildUniverse(exchangeInfo, tickers, states, now, { ...engine.DEFAULTS, refreshBatchSize: 2 });
assert.strictEqual(universe.length, 3, 'all tradable crypto USDT contracts are evaluated at coarse stage');
assert.strictEqual(universe.filter(item => item.eligible).length, 2, 'liquidity eligibility is explicit');
assert.strictEqual(universe.find(item => item.symbol === 'AAAUSDT').due, false, 'hot symbol is not repeated before freshness expiry');
assert.strictEqual(universe.find(item => item.symbol === 'BBBUSDT').due, true, 'stale symbol becomes due');
assert.strictEqual(engine.selectRefreshBatch(universe, { ...engine.DEFAULTS, refreshBatchSize: 1 })[0].symbol, 'BBBUSDT');
assert(!engine.selectRefreshBatch(universe, { ...engine.DEFAULTS, refreshBatchSize: 3 }).some(item => item.symbol === 'AAAUSDT'), 'fresh hot symbols are not re-evaluated early');

const snapshot = {
  klines1h: klineSeries(100, 0.4, 100, 1000),
  klines4h: klineSeries(80, 0.8, 60, 4000),
  funding: { lastFundingRate: '-0.0006' },
  openInterest: { openInterest: '3000000' },
  ticker: { quoteVolume: '600000000' },
  marketContext: {
    scoreAdjustment: { long: 4, short: -4 },
    intelligenceSignal: { confidence: 'media', scoreAdjustment: { ifLong: 4, ifShort: -4 } }
  }
};
const scored = engine.scoreSnapshot(snapshot);
assert.strictEqual(scored.direction, 'LONG');
assert(scored.score >= 65, 'aligned setup clears fixed threshold');
assert(scored.score < 100, 'ordinary aligned setup preserves ranking headroom');
assert.strictEqual(scored.contributions.filter(item => item.component === 'trend_4h').length, 1, '4H contributes exactly once');
assert.strictEqual(
  Math.round(scored.contributions.reduce((sum, item) => sum + item.value, 0) * 100) / 100,
  scored.score,
  'score equals visible additive contributions'
);

const rules = [
  { id: 1, rule_type: 'regime', rule_key: 'TRENDING', status: 'active', action: 'reduce', weight: 0.90, research_factor: 1, review_factor: 1, sample_size: 40, evidence_level: 'high' },
  { id: 2, rule_type: 'setup', rule_key: 'TRENDING / CONFIRMS / BULLISH', status: 'active', action: 'reduce', weight: 0.92, research_factor: 1, review_factor: 1, sample_size: 20, evidence_level: 'high' },
  { id: 3, rule_type: 'symbol', rule_key: 'AAAUSDT', status: 'active', action: 'reduce', weight: 0.90, research_factor: 1, review_factor: 1, sample_size: 20, evidence_level: 'medium' },
  { id: 4, rule_type: 'session', rule_key: '00-04', status: 'active', action: 'reduce', weight: 0.90, research_factor: 1, review_factor: 1, sample_size: 20, evidence_level: 'medium' },
  { id: 5, rule_type: 'score_band', rule_key: '90-99', status: 'active', action: 'reduce', weight: 0.90, research_factor: 1, review_factor: 1, sample_size: 20, evidence_level: 'medium' }
];
const bias = computeLearningBias(rules, {}, { soft_min_sample: 8, hard_min_sample: 20, learning_component_delta_cap: 3, learning_delta_cap: 8 });
assert(!bias.contributions.some(item => item.component === 'learning.regime'), 'nested regime penalty is suppressed when setup exists');
assert.strictEqual(bias.totalDelta, -8, 'accumulated learning bias has a visible hard cap');
assert.strictEqual(95 + bias.totalDelta, 87, 'excellent setup cannot collapse through multiplicative penalties');

const positivelyCorrelated = Array.from({ length: 20 }, (_, index) => index / 100);
const opposite = positivelyCorrelated.map(value => -value);
assert(Math.abs(engine.correlation(positivelyCorrelated, opposite)) > 0.99);
assert(engine.exposureCorrelation(0.9, 'LONG', 'LONG') > 0.8, 'same-direction exposure is correlated');
assert(engine.exposureCorrelation(0.9, 'SHORT', 'LONG') < 0, 'opposite directions diversify positively correlated markets');
assert(engine.exposureCorrelation(-0.9, 'SHORT', 'LONG') > 0.8, 'opposite direction on inverse markets recreates exposure');

console.log('opportunity engine unit tests: ok');
