'use strict';
const assert = require('node:assert/strict');
const { simulateOutcome, openScenario } = require('../services/simulator');

const enteredAt = Date.now() - 2 * 3600000;
const bar = (minutes, high, low, close) => ({
  openTime: enteredAt + minutes * 60000, high, low, close
});

const long = { direction: 'LONG', entryPrice: 100, initialSL: 95, tp: 110 };
const short = { direction: 'SHORT', entryPrice: 100, initialSL: 105, tp: 90 };
assert.equal(simulateOutcome(long, [bar(1, 111, 99, 109)], 1, enteredAt).firstHit, 'tp');
assert.equal(simulateOutcome(short, [bar(1, 101, 89, 91)], 1, enteredAt).firstHit, 'tp');
const ambiguous = simulateOutcome(long, [bar(1, 111, 94, 103)], 1, enteredAt);
assert.equal(ambiguous.firstHit, 'both_same_bar');
assert.equal(ambiguous.quality, 'bad_ambiguous');
assert.equal(ambiguous.levelsSource, 'recorded');
assert.equal(simulateOutcome({ direction: 'LONG', entryPrice: 100 }, [bar(1, 101, 99, 100)], 1, enteredAt), null);

const scenario = openScenario({ id: 1, symbol: 'BTCUSDT', direction: 'SHORT',
  entry_price: '100', qty: '2', leverage: '5', sl_price: '105', tp_price: '90' });
assert.equal(scenario.pnlAtSl, -10);
assert.equal(scenario.pnlAtTp, 20);
console.log('simulator scenarios: recorded levels, both-side hits, and open-position outcomes');
