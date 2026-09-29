'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowPath = path.resolve(__dirname, '../bot-control/workflows/current/trailing-manager.workflow.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const code = workflow.nodes.find(node => node.name === 'Trailing Manager Code').parameters.jsCode;
const snippet = fs.readFileSync(path.resolve(__dirname, '../bot-control/workflows/code/trailing-manager-profit.js'), 'utf8');
assert.equal(code, snippet.replace(/\n$/, ''), 'workflow is out of sync with trailing-manager-profit.js; run scripts/patch-trailing-manager-profit.js');

const FEE = 0.001;
const netAt = (side, entry, exit) => (side === 'SHORT' ? entry - exit : exit - entry) - (entry + exit) * FEE;

function klines(price, range = 1) {
  return Array.from({ length: 30 }, (_, index) => [
    Date.now() - (30 - index) * 3600000,
    String(price), String(price + range / 2), String(price - range / 2), String(price), '1'
  ]);
}

const BASE_POSITION = {
  symbol: 'BTCUSDT', positionSide: 'LONG', side: 'SELL', entryPrice: 100, initialSL: 90, slPrice: 90,
  tp: 120, qty: 1, stage: 'INITIAL', leverage: 5, tick: '0.1', atrRange: 1, hoursOpen: 1
};

async function runScenario(overrides = {}) {
  const s = { ...BASE_POSITION, ...overrides };
  const calls = [];
  const position = overrides.state || {
    positionSide: s.positionSide, slPrice: s.slPrice, qty: s.qty, side: s.side, entryPrice: s.entryPrice,
    initialSL: s.initialSL, stage: s.stage, tp: s.tp, leverage: s.leverage,
    openedAt: Date.now() - s.hoursOpen * 3600000
  };
  const helpers = {
    httpRequest: async options => {
      calls.push({ method: options.method, url: options.url, body: options.body });
      if (options.url.endsWith('/webhook/sl-monitor-get')) return { positions: { [s.symbol]: position } };
      if (options.url.includes('/fapi/v1/exchangeInfo')) return { symbols: [{
        symbol: s.symbol, filters: [{ filterType: 'PRICE_FILTER', tickSize: s.tick }]
      }] };
      if (options.url.includes('/fapi/v1/ticker/price')) return { symbol: s.symbol, price: String(s.currentPrice) };
      if (options.url.includes('/fapi/v1/klines')) return klines(s.currentPrice, s.atrRange);
      if (options.url.endsWith('/executions')) {
        if (s.engineFailure) return {
          ok: false, executionId: options.body.executionId, finalStatus: 'FAILED',
          error: 'Binance rejected request', verificationResult: { verified: false }
        };
        return {
          ok: true, executionId: options.body.executionId, exchangeOrderId: '9001',
          exchangeResponse: { create: { algoId: '9001' } },
          verificationResult: { verified: true, requested: options.body, exchangeVerified: true },
          finalStatus: 'VERIFIED', timestamp: new Date().toISOString()
        };
      }
      if (options.url.endsWith('/webhook/sl-monitor-set')) return { ok: true, positions: { [s.symbol]: options.body } };
      if (options.url.endsWith('/trade')) return { ok: true };
      throw new Error(`Unexpected request ${options.method} ${options.url}`);
    }
  };
  const processMock = { env: {
    BINANCE_API_KEY: 'test-key', BINANCE_API_SECRET: 'test-secret',
    EXECUTION_ENGINE_TOKEN: 'test-engine-token', EXECUTION_ENGINE_URL: 'http://position_guard:3091/executions'
  } };
  const fn = new AsyncFunction('$input', 'process', 'require', 'console', code);
  const output = await fn.call({ helpers }, { first: () => ({ json: {} }) }, processMock, require, { log() {} });
  const slSet = calls.find(call => call.url.endsWith('/webhook/sl-monitor-set'));
  return { result: output[0].json, calls, execution: executionCall(calls), nextState: slSet?.body || null };
}

function executionCall(calls) {
  return calls.find(call => call.url.endsWith('/executions'));
}

async function assertVerifiedStage(name, scenario, expected) {
  const run = await runScenario(scenario);
  const { result, calls, execution } = run;
  assert(execution, `${name}: Execution Engine did not receive a request (${result.reason})`);
  assert.equal(execution.body.type, expected.type, `${name}: wrong execution type`);
  assert.equal(execution.body.requestedStage, expected.stage, `${name}: wrong requested stage`);
  assert.equal(execution.body.targetPrice, expected.targetPrice, `${name}: wrong target price`);
  assert.equal(result.status, 'SL_UPDATED', `${name}: stage was not advanced`);
  assert.equal(result.finalStatus, 'VERIFIED', `${name}: result was not verified`);
  assert.equal(result.verificationResult.verified, true, `${name}: read-back was not verified`);
  assert(result.telegramText?.includes('SL ACTUALIZADO'), `${name}: verified notification missing`);
  const engineIndex = calls.indexOf(execution);
  const localIndexes = calls.map((call, index) => ({ call, index }))
    .filter(({ call }) => call.url.endsWith('/webhook/sl-monitor-set') || call.url.endsWith('/trade'))
    .map(({ index }) => index);
  assert(localIndexes.length === 2, `${name}: local state was not synchronized`);
  assert(localIndexes.every(index => index > engineIndex), `${name}: local state changed before engine verification`);
  const side = scenario.positionSide || 'LONG';
  const oldSL = scenario.slPrice ?? BASE_POSITION.slPrice;
  assert(side === 'SHORT' ? expected.targetPrice < oldSL : expected.targetPrice > oldSL, `${name}: SL worsened`);
  if (expected.stage !== 'INITIAL') {
    assert(netAt(side, scenario.entryPrice ?? 100, expected.targetPrice) >= 0, `${name}: stage claims profit but stop is net-negative`);
  }
  return run;
}

async function assertNoMove(name, scenario) {
  const { result, execution } = await runScenario(scenario);
  assert.equal(execution, undefined, `${name}: unexpected execution to ${execution?.body?.targetPrice} (${result.reason})`);
  assert.equal(result.status, 'monitoring', `${name}: status changed`);
  assert.equal(result.newSL, result.oldSL, `${name}: SL changed without execution`);
  return result;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── Legacy R path (TP = 2R) keeps working ─────────────────────────────────────
test('0.60R reduces risk by half for LONG and SHORT, with a detailed confirmed notice', async () => {
  for (const side of ['LONG', 'SHORT']) {
    const short = side === 'SHORT';
    const r = await assertVerifiedStage('risk reduction ' + side,
      { positionSide: side, side: short ? 'BUY' : 'SELL', currentPrice: short ? 94 : 106,
        initialSL: short ? 110 : 90, slPrice: short ? 110 : 90, tp: short ? 70 : 130 },
      { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: short ? 105 : 95 });
    assert(r.result.telegramText.includes('SL ACTUALIZADO — RIESGO REDUCIDO'));
    assert(r.result.telegramText.includes('50.0% del inicial'));
    assert(r.result.telegramText.includes(r.result.executionId));
    assert(r.result.telegramText.includes('confirmado por Binance y persistido'));
  }
});
test('ZETA historical 0.543R / 31.6% TP reduces risk once, and 0.63R does not repeat it', async () => {
  const s = { symbol: 'ZETAUSDT', positionSide: 'SHORT', side: 'BUY', entryPrice: .05169,
    initialSL: .05261, slPrice: .05261, tp: .05033, qty: 1195, currentPrice: .05119,
    tick: '0.00001', atrRange: .00084877, hoursOpen: .44 };
  const r = await assertVerifiedStage('ZETA recovered case', s,
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: .05215 });
  assert.equal(r.result.currentR, .543);
  assert.equal(r.result.profitProgress, .316);
  assert(r.result.telegramText.includes('32% del PnL neto al TP'));
  assert(r.result.telegramText.includes('Pérdida máx. al SL'));
  const later = await runScenario({ ...s, currentPrice: .05111, state: r.nextState });
  assert.equal(later.execution, undefined);
  assert.equal(later.result.telegramText, null);
  assert.equal(later.result.newSL, .05215);
});
test('R path: break-even at 1R is fee-covered', async () => {
  await assertVerifiedStage('BE 1R', { currentPrice: 110 }, { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.3 });
});
test('R path: lock at 1.5R keeps +0.5R', async () => {
  await assertVerifiedStage('Lock 1.5R', { currentPrice: 115, stage: 'BREAKEVEN', slPrice: 100.3 },
    { type: 'MOVE_STOP_LOSS', stage: 'LOCK', targetPrice: 105 });
});
test('R path: trailing at 2R uses 1 ATR', async () => {
  await assertVerifiedStage('Trail 2R', { currentPrice: 120, stage: 'LOCK', slPrice: 105 },
    { type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 119 });
});

// ── Time lock uses the real initial risk, not 2% of price ─────────────────────
test('time lock after 4h at 0.8R locks 30% of net PnL', async () => {
  await assertVerifiedStage('Time Lock', { currentPrice: 108, hoursOpen: 5 },
    { type: 'MOVE_STOP_LOSS', stage: 'TIME_LOCK', targetPrice: 102.6 });
});
test('time lock ignores +2% price move that is only 0.2R', async () => {
  await assertNoMove('Time Lock 0.2R', { currentPrice: 102, hoursOpen: 5 });
});

// ── Profit progress path ──────────────────────────────────────────────────────
test('MOVR: 0.85R / 45% of TP net reduces risk, stays INITIAL', async () => {
  const movr = { symbol: 'MOVRUSDT', entryPrice: 1.025, initialSL: 0.9915, slPrice: 0.9915, tp: '1.0860000000',
    qty: 5.7, tick: '0.001', atrRange: 0.0105 };
  const first = await assertVerifiedStage('MOVR reduce', { ...movr, currentPrice: 1.0535 },
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: 1.009 });
  assert(Math.abs(first.result.profitProgress - 0.448) < 0.01, `MOVR progress ${first.result.profitProgress}`);
  assert(Math.abs(first.result.netPnL - 0.150) < 0.005, `MOVR net ${first.result.netPnL}`);
  // Next cycle at ~51% of the TP net profit (0.95R) reaches fee-covered break-even.
  await assertVerifiedStage('MOVR BE', { ...movr, slPrice: 1.009, currentPrice: 1.057 },
    { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 1.028 });
});
test('TP < 2R: 0.82R with 54% of TP net reaches break-even', async () => {
  await assertVerifiedStage('TP 1.5R BE', { tp: 115, currentPrice: 108.2 },
    { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.3 });
});
test('TP < 2R: 86% of TP net starts trailing at 1.3R', async () => {
  await assertVerifiedStage('TP 1.5R trail', { tp: 115, currentPrice: 113, stage: 'BREAKEVEN', slPrice: 100.3 },
    { type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 112 });
});
test('TP = 1R: profit progress protects before the R ladder could', async () => {
  await assertVerifiedStage('TP 1R BE', { tp: 110, currentPrice: 105.5 },
    { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.3 });
});
test('TP > 2R: R ladder leads, profit progress does not delay it', async () => {
  const far = { tp: 130 };
  await assertVerifiedStage('TP 3R BE', { ...far, currentPrice: 110 }, { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.3 });
  await assertVerifiedStage('TP 3R lock', { ...far, currentPrice: 115, stage: 'BREAKEVEN', slPrice: 100.3 },
    { type: 'MOVE_STOP_LOSS', stage: 'LOCK', targetPrice: 105 });
  await assertVerifiedStage('TP 3R trail', { ...far, currentPrice: 120, stage: 'LOCK', slPrice: 105 },
    { type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 119 });
  await assertNoMove('TP 3R 0.8R', { ...far, currentPrice: 108.2, slPrice: 95 });
});
test('below profit and R floors nothing moves', async () => {
  await assertNoMove('0.3R', { currentPrice: 103 });
  // 60% of a tiny 0.5R TP is only 0.3R: the R floor blocks noise-driven BE and risk cut.
  await assertNoMove('tiny TP', { tp: 105, currentPrice: 103 });
});

// ── SHORT ─────────────────────────────────────────────────────────────────────
test('SHORT: 0.82R with 54% of TP net reaches break-even', async () => {
  await assertVerifiedStage('SHORT BE', { positionSide: 'SHORT', side: 'BUY', initialSL: 110, slPrice: 110, tp: 85, currentPrice: 91.8 },
    { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 99.8 });
});
test('SHORT: risk reduction, lock and trailing', async () => {
  const short = { positionSide: 'SHORT', side: 'BUY', initialSL: 110, tp: 80 };
  await assertVerifiedStage('SHORT reduce', { ...short, slPrice: 110, currentPrice: 93.5 },
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: 105 });
  await assertVerifiedStage('SHORT lock', { ...short, slPrice: 99.8, stage: 'BREAKEVEN', currentPrice: 85 },
    { type: 'MOVE_STOP_LOSS', stage: 'LOCK', targetPrice: 95 });
  await assertVerifiedStage('SHORT trail', { ...short, slPrice: 95, stage: 'LOCK', currentPrice: 80 },
    { type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 81 });
  await assertNoMove('SHORT never worsens', { ...short, slPrice: 90, stage: 'LOCK', currentPrice: 85 });
});

// ── Fees ──────────────────────────────────────────────────────────────────────
test('high R but little net profit does not claim break-even', async () => {
  const tight = { entryPrice: 100, initialSL: 99.8, slPrice: 99.8, tp: 100.4, tick: '0.01', atrRange: 0.05 };
  const { execution, result } = await assertVerifiedStage('fee-eaten 1.2R', { ...tight, currentPrice: 100.24 },
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: 99.9 });
  assert(result.currentR >= 1.2 - 1e-9, 'scenario should exceed 1R');
  assert(execution.body.targetPrice < tight.entryPrice, 'fee-eaten trade must not be labelled break-even');
});
test('break-even stop covers both fee legs, naive +0.1% would not', async () => {
  assert(netAt('LONG', 100, 100.1) < 0, 'naive BE should be net negative');
  assert(netAt('LONG', 100, 100.3) > 0);
  assert(netAt('SHORT', 100, 99.8) >= 0);
  const { result } = await runScenario({ currentPrice: 110 });
  assert(/Protegido al SL \(neto estimado\): \+\$0\.1/.test(result.telegramText), 'protected net PnL not reported');
});

test('legacy net-negative break-even is upgraded even below the 0.1R step', async () => {
  // Live MOVR state: BREAKEVEN at 1.026 (entry +0.1%) still loses after fees.
  await assertVerifiedStage('MOVR legacy BE', { symbol: 'MOVRUSDT', entryPrice: 1.025, initialSL: 0.9915, slPrice: 1.026,
    stage: 'BREAKEVEN', tp: 1.086, qty: 5.7, tick: '0.001', atrRange: 0.0105, currentPrice: 1.062 },
  { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 1.028 });
  await assertNoMove('fee-covered BE stays', { symbol: 'MOVRUSDT', entryPrice: 1.025, initialSL: 0.9915, slPrice: 1.028,
    stage: 'BREAKEVEN', tp: 1.086, qty: 5.7, tick: '0.001', atrRange: 0.0105, currentPrice: 1.062 });
});

// ── Volatility adaptation ─────────────────────────────────────────────────────
test('break-even waits when the stop would sit inside ATR noise', async () => {
  // TP 1R at 0.55R: BE is due by profit progress, but ATR=12 needs a 6-point gap; only the risk cut fits.
  await assertVerifiedStage('wide ATR', { tp: 110, currentPrice: 105.5, atrRange: 12 },
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: 95 });
});
test('position size does not change the decision', async () => {
  const small = await runScenario({ tp: 115, currentPrice: 108.2, qty: 0.01 });
  const large = await runScenario({ tp: 115, currentPrice: 108.2, qty: 2500 });
  assert.equal(small.execution.body.targetPrice, large.execution.body.targetPrice);
  assert.equal(small.execution.body.requestedStage, large.execution.body.requestedStage);
  assert.equal(small.result.profitProgress, large.result.profitProgress);
});
test('missing TP falls back to the pure R ladder', async () => {
  await assertVerifiedStage('no TP 0.82R', { tp: null, currentPrice: 108.2 },
    { type: 'MOVE_STOP_LOSS', stage: 'INITIAL', targetPrice: 95 });
  await assertNoMove('no TP 0.5R', { tp: null, currentPrice: 105 });
  await assertVerifiedStage('no TP 1R', { tp: null, currentPrice: 110 },
    { type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.3 });
});

// ── SL never worsens / noise ──────────────────────────────────────────────────
test('SL never moves backwards', async () => {
  await assertNoMove('LOCK with higher SL', { currentPrice: 115, stage: 'LOCK', slPrice: 112 });
  await assertNoMove('TRAILING pullback', { currentPrice: 118, stage: 'TRAILING', slPrice: 119 });
  await assertNoMove('price below entry', { currentPrice: 97, stage: 'BREAKEVEN', slPrice: 100.3 });
});
test('trailing ignores improvements below 0.1R', async () => {
  await assertNoMove('tiny trail', { currentPrice: 120, stage: 'TRAILING', slPrice: 118.95, tick: '0.05' });
  await assertVerifiedStage('trail continues after 2R', { currentPrice: 118, stage: 'TRAILING', slPrice: 110 },
    { type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 117 });
});

// ── Restarts / idempotency ────────────────────────────────────────────────────
test('re-running with the persisted state is a no-op', async () => {
  const first = await runScenario({ tp: 115, currentPrice: 108.2 });
  assert(first.nextState, 'first run did not persist');
  const second = await runScenario({ tp: 115, currentPrice: 108.2, state: first.nextState });
  assert.equal(second.execution, undefined, 'second run re-executed the same protection');
  const restarted = await runScenario({ currentPrice: 110, stage: 'BREAKEVEN', slPrice: 100.3 });
  assert.equal(restarted.execution, undefined, 'restart re-executed break-even');
});
test('rejected Binance request does not advance local state and retries next cycle', async () => {
  const failed = await runScenario({ currentPrice: 110, engineFailure: true });
  assert.equal(failed.result.status, 'monitoring', 'Rejected Binance request advanced local stage');
  assert.equal(failed.result.finalStatus, 'FAILED');
  assert(failed.result.telegramText.includes('EXECUTION FAILED'), 'Failure notification missing');
  assert(!failed.result.telegramText.includes('SL ACTUALIZADO'), 'Failure emitted a success notification');
  assert.equal(failed.calls.some(call => call.url.endsWith('/webhook/sl-monitor-set')), false,
    'Rejected Binance request updated SL Monitor');
  assert.equal(failed.calls.some(call => call.url.endsWith('/trade')), false,
    'Rejected Binance request updated Dashboard');
  const retry = await runScenario({ currentPrice: 110 });
  assert.equal(retry.execution.body.targetPrice, 100.3);
});

(async () => {
  let failures = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ok  ${name}`); }
    catch (error) { failures++; console.error(`  FAIL ${name}\n       ${error.message}`); }
  }
  if (failures) { console.error(`trailing manager regression tests: ${failures} failed`); process.exit(1); }
  console.log(`trailing manager regression tests: ok (${tests.length})`);
})();
