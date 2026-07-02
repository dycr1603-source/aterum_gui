'use strict';

const assert = require('assert');
const { computeLearningBias } = require('../services/learning_bias');

const rule = {
  id: 7,
  rule_type: 'symbol',
  rule_key: 'ETHUSDT',
  status: 'active',
  action: 'reduce',
  weight: 0.98,
  research_factor: 0.95,
  review_factor: 0.98,
  sample_size: 20,
  expectancy: -0.2,
  profit_factor: 0.8,
  evidence_level: 'high'
};

const result = computeLearningBias([rule], {}, {
  soft_min_sample: 8,
  hard_min_sample: 20,
  learning_component_delta_cap: 3,
  learning_delta_cap: 8
});

assert.equal(result.totalDelta, -0.5, 'production uses historical weight only');
assert.equal(result.contributions[0].delta, -0.5);
assert.equal(result.contributions[0].shadowDelta, -2.191);
assert.equal(result.contributions[0].externalMarginalDelta, -1.691);
assert.equal(result.shadow.totalDelta, -2.191);
assert.equal(result.shadow.marginalDelta, -1.691);
assert.equal(result.shadow.wouldChangeScore, true);
assert.equal(result.blockers.length, 0, 'Research does not create a production blocker');

const blocking = computeLearningBias([{ ...rule, action: 'block' }], {}, {
  soft_min_sample: 8,
  hard_min_sample: 20,
  learning_component_delta_cap: 3,
  learning_delta_cap: 8,
  block_expectancy_max: -0.75
});
assert.equal(blocking.blockers.length, 1, 'historical Learning hard block remains unchanged');

console.log('research shadow tests: ok');
