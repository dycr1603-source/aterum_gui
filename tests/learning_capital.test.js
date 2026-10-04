'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../routes/learning'), 'utf8');
const functions = source.slice(source.indexOf('function currentLossStreak('), source.indexOf('async function getPostTradeFactor('));
async function status(rows, config = {}) {
  const context = vm.createContext({
    Date, getConfig: async () => config,
    db: { execute: async () => [rows] }, shared: {},
    num: value => Number(value) || 0,
    configNum: (cfg, key, fallback) => Number(cfg[key] ?? fallback),
    round: (value, digits) => Number(value.toFixed(digits)),
    normalizeSetup: () => 'test', hourBucket: () => 'test'
  });
  return vm.runInContext(functions + '\ngetCapitalStatus(100)', context);
}
test('weekly losses stay visible without blocking entries', async () => {
  const result = await status([{ pnl_usdt: -24.36, closed_at: new Date(Date.now() - 2 * 86400000) }]);
  assert.equal(result.weeklyPct, -24.36);
  assert.equal(result.weeklyBlockingEnabled, false);
  assert.equal(result.halted, false);
});
test('daily loss protection still blocks entries', async () => {
  const result = await status([{ pnl_usdt: -16, closed_at: new Date() }]);
  assert.equal(result.halted, true);
  assert.match(result.reasons.join(), /límite diario/);
});
test('recent consecutive loss protection still blocks entries', async () => {
  const result = await status(Array.from({ length: 4 }, () => ({ pnl_usdt: -1, closed_at: new Date() })));
  assert.equal(result.halted, true);
  assert.match(result.reasons.join(), /4 pérdidas globales consecutivas/);
});
