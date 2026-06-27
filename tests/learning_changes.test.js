'use strict';

const assert = require('assert');
const shared = require('../shared');
const { compareMetrics } = require('../services/learning_changes')._internals;

const config = {
  change_min_sample: '10',
  change_validation_sample: '20',
  change_min_expectancy_delta: '0.05',
  change_min_avg_r_delta: '0.05',
  change_min_profit_factor_delta: '0.10',
  change_min_win_rate_delta: '3',
  change_volume_drop_pct: '40'
};
const change = { minimum_sample: 10, validation_sample: 20 };

function metrics(overrides = {}) {
  return {
    trades: 24,
    wins: 12,
    losses: 12,
    winRate: 50,
    pnl: 0,
    expectancy: 0,
    profitFactor: 1,
    avgR: 0,
    stdDevR: 0.2,
    maxDrawdown: -5,
    tradesPerDay: 2,
    periodDays: 14,
    ...overrides
  };
}

const improved = compareMetrics(
  metrics({ winRate: 42, expectancy: -0.2, profitFactor: 0.8, avgR: -0.12 }),
  metrics({ winRate: 58, expectancy: 0.25, profitFactor: 1.35, avgR: 0.15 }),
  change,
  config
);
assert.equal(improved.reviewStatus, 'validated');
assert.equal(improved.verdict, 'improved');

const worsened = compareMetrics(
  metrics({ winRate: 58, expectancy: 0.2, profitFactor: 1.3, avgR: 0.15 }),
  metrics({ winRate: 38, expectancy: -0.25, profitFactor: 0.65, avgR: -0.15 }),
  change,
  config
);
assert.equal(worsened.reviewStatus, 'revert_required');
assert.equal(worsened.verdict, 'worsened');

const volumeOnly = compareMetrics(
  metrics({ tradesPerDay: 4 }),
  metrics({ tradesPerDay: 2, expectancy: 0.01, avgR: 0.01, profitFactor: 1.02, winRate: 51 }),
  change,
  config
);
assert.equal(volumeOnly.reviewStatus, 'revert_required');
assert.equal(volumeOnly.verdict, 'volume_only');

const insufficient = compareMetrics(
  metrics({ trades: 24 }),
  metrics({ trades: 3, wins: 3, losses: 0, winRate: 100, expectancy: 2, profitFactor: 9.99, avgR: 2 }),
  change,
  config
);
assert.equal(insufficient.reviewStatus, 'insufficient');
assert.equal(insufficient.verdict, 'no_evidence');

console.log('learning_changes tests: ok');
shared.db.end().catch(() => {});
