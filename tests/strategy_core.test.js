"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const I = require("../services/strategy/indicators"),
  R = require("../services/strategy/risk"),
  M = require("../services/strategy/metrics"),
  B = require("../services/strategy/backtest"),
  { account } = require("../services/strategy/feedback"),
  { promotion } = require("../services/strategy/policy");
const policy = require("../config/strategy-v2.json");
test('margin allocation caps each position at 45 percent and combined margin at 90 percent, with leverage 5–10', () => {
  const { projections } = require('../services/strategy/jev_policy');
  const p = { ...policy, riskFraction: 0.02, feeRate: 0, slippageBps: 0, fundingReserve: 0, minLeverage: 5, maxLeverage: 10, maxMarginFractionPerPosition: 0.45, maxTotalMarginFraction: 0.9 };
  const capacity = { account: { equity: 1000, marginUsed: 0 }, risk: { remainingRiskAmount: 100, openRiskAmount: 0 }, capacity: { remainingMargin: 900 }, exposure: { remaining: 100000, bySymbol: {}, direction: { LONG: 0 } }, limits: { maxSymbolExposurePct: 2000, maxDirectionExposurePct: 2000 } };
  const args = { d: { symbol: 'TESTUSDT', strategy: { riskPolicy: p } }, side: 'LONG', entry: 100, stop: 99.99, target: 102, capacity, symbol: { filters: [{ filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001', maxQty: '10000' }, { filterType: 'MIN_NOTIONAL', notional: '5' }] }, brackets: [{ notionalFloor: 0, notionalCap: 100000, initialLeverage: 10, maintMarginRatio: 0.005 }], feeRate: 0 };
  let result = projections(args);
  assert.deepEqual(result.allowedChoices, [5, 6, 7, 8, 9, 10]);
  for (const s of Object.values(result.projections)) assert(Math.abs(s.margin - 450) < 0.1);
  capacity.account.marginUsed = 600;
  result = projections(args);
  assert(result.allowedChoices.length > 0);
  for (const s of Object.values(result.projections)) assert(s.margin <= 300);
  capacity.account.marginUsed = 900;
  assert.deepEqual(projections(args).allowedChoices, []);
  capacity.account.marginUsed = 0;
  assert.deepEqual(projections({ ...args, d: { ...args.d, strategy: { riskPolicy: { ...p, minExpectedR: 1.5 } } }, target: 100.01 }).allowedChoices, []);
});
test('manual activation preserves failed validation and is bound to its report and candidate', () => {
  const candidate = { pair: ['ADX', 'BOLLINGER'], timeframe: '4h', scale: 0.8, directions: ['SHORT'], management: 'existing' };
  const report = { reportId: 'test-report', frozenCandidate: candidate };
  const p = { ...policy, ...candidate, entryMode: 'pair', adxThreshold: 25, bollingerSigma: 2, minExpectedR: 0, manualActivation: { enabled: true, reportId: 'test-report', reason: 'Operator request', authorizedAt: '2026-10-04T00:00:00Z' } };
  const result = promotion(p, report);
  assert.equal(result.allowed, true);
  assert.equal(result.validationPassed, false);
  assert.equal(result.activation, 'MANUAL_UNVALIDATED');
  assert(result.reasons.includes('ROBUSTNESS_REJECTED'));
  assert.equal(promotion(p, { ...report, reportId: 'different' }).allowed, false);
  assert.equal(promotion({ ...p, directions: ['LONG'] }, report).allowed, false);
  assert.equal(promotion({ ...p, manualActivation: null }, report).allowed, false);
});
test('manual override binds the wider signal and reward policy exactly', () => {
  const report = { reportId: policy.manualActivation.reportId, frozenCandidate: { pair: policy.pair, timeframe: policy.timeframe, scale: policy.scale, directions: ['SHORT'], management: 'existing' } };
  assert.equal(promotion(policy, report).activation, 'MANUAL_UNVALIDATED');
  for (const edit of [{ adxThreshold: 20 }, { bollingerSigma: 1.5 }, { minExpectedR: 1 }, { directions: ['SHORT'] }, { minVotes: 6 }, { minDepthQuote: 500 }])
    assert.equal(promotion({ ...policy, ...edit }, report).allowed, false);
});
const bars = (n = 100) =>
  Array.from({ length: n }, (_, i) => ({
    time: i * 3600000,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100 + i * 0.1,
    volume: 100,
    quoteVolume: 10000,
  }));
test("indicator reference values, Wilder RSI/ATR and flat prices", () => {
  assert.deepEqual(I.smooth([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const f = I.calculate(bars());
  assert.equal(f.at(-1).signals.RSI.value, 100);
  assert.equal(f.at(-1).atr, 2);
  assert.equal(f.at(-1).signals.EMA.signal, "LONG");
  const flat = bars().map((b) => ({
    ...b,
    open: 100,
    close: 100,
    high: 101,
    low: 99,
  }));
  const x = I.calculate(flat).at(-1);
  assert.equal(x.signals.RSI.value, 50);
  assert.equal(x.signals.ADX.value.adx, 0);
  assert.equal(x.signals.VWAP.value, 100);
  assert.equal(x.signals.RVOL.value, 1);
  assert.equal(x.signals.STOCH_RSI.value, 50);
});
test('lower ADX and Bollinger thresholds increase eligible signals without changing defaults', () => {
  const sample = (slope, wave, frequency) => Array.from({ length: 120 }, (_, i) => {
    const close = 100 + slope * i + wave * Math.sin(i * frequency);
    return { time: i * 14400000, open: close, high: close + 1, low: close - 1, close, volume: 100, quoteVolume: 10000 };
  });
  const adxBars = sample(-0.05, 0.5, 0.55);
  const regularAdx = I.calculate(adxBars, 0.8).at(-1);
  const widerAdx = I.calculate(adxBars, 0.8, { adxThreshold: 22, bollingerSigma: 1.8 }).at(-1);
  assert.equal(regularAdx.signals.ADX.signal, 'NEUTRAL');
  assert.equal(widerAdx.signals.ADX.signal, 'SHORT');
  const bandBars = sample(-0.1, 0.1, 0.4);
  assert.equal(I.calculate(bandBars, 0.8).at(-1).signals.BOLLINGER.signal, 'NEUTRAL');
  assert.equal(I.calculate(bandBars, 0.8, { adxThreshold: 22, bollingerSigma: 1.8 }).at(-1).signals.BOLLINGER.signal, 'SHORT');
});
test('JEV target choices offer at least two gross reward units for the widest stop', () => {
  const { levelOptions } = require('../services/strategy/jev_policy');
  const result = levelOptions({ strategy: { directions: ['LONG', 'SHORT'], recentCandles: bars() }, indicators: { atr: 2 } }, 110, { tickSize: '0.1' });
  for (const [side, options] of Object.entries(result)) {
    const stop = Math.max(...Object.values(options.sl).map(x => Math.abs(110 - x)));
    const targets = Object.values(options.tp).map(x => Math.abs(110 - x));
    assert(targets[0] >= stop * 2 - 1e-8, side);
    assert(targets[1] > targets[0] && targets[2] > targets[1], side);
  }
});
test("no future bars influence indicators; all ten families calculated", () => {
  const a = bars(150),
    prefix = I.calculate(a.slice(0, 90));
  a[120].high = 10000;
  a[120].close = 1000;
  assert.deepEqual(I.calculate(a).slice(0, 90), prefix);
  assert.equal(Object.keys(prefix.at(-1).signals).length, 10);
  assert.equal(I.pairs().length, 37);
  assert(!I.pairs().some((p) => p.includes("RSI") && p.includes("STOCH_RSI")));
});
test("exactly two signals produce LONG SHORT or NO_TRADE; non-directional pair cannot invent direction", () => {
  const f = {
    ready: true,
    signals: {
      EMA: { signal: "LONG" },
      RSI: { signal: "LONG" },
      ATR: { signal: "ACTIVE" },
      RVOL: { signal: "ACTIVE" },
    },
  };
  assert.equal(I.signal(f, ["EMA", "RSI"]), "LONG");
  f.signals.RSI.signal = "SHORT";
  assert.equal(I.signal(f, ["EMA", "RSI"]), "NO_TRADE");
  f.signals.EMA.signal = "SHORT";
  assert.equal(I.signal(f, ["EMA", "RSI"]), "SHORT");
  assert.equal(I.signal(f, ["ATR", "RVOL"]), "NO_TRADE");
  assert.throws(() => I.signal(f, ["EMA"]), /TWO_INDICATORS/);
});
test('ten readings require five of eight directional votes; ATR and RVOL cannot invent a side', () => {
  const names = I.DIRECTIONAL;
  const feature = { ready: true, signals: Object.fromEntries([
    ...names.map((name, i) => [name, { signal: i < 5 ? 'LONG' : 'SHORT' }]),
    ['ATR', { signal: 'ACTIVE' }], ['RVOL', { signal: 'ACTIVE' }],
  ]) };
  const approved = I.consensus(feature, 5);
  assert.equal(approved.direction, 'LONG');
  assert.equal(approved.supporting, 5);
  assert.equal(approved.opposing, 3);
  assert.equal(approved.confirmations, 2);
  feature.signals[names[4]].signal = 'SHORT';
  assert.equal(I.consensus(feature, 5).direction, 'NO_TRADE');
  assert.equal(I.consensus({ ready: false, signals: feature.signals }, 5).direction, 'NO_TRADE');
});
test('minimum Binance lot is rejected only when its lower-bound stop risk exceeds the budget', () => {
  const { minimumLotRisk } = require('../services/strategy/engine');
  const symbol = { filters: [
    { filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001', maxQty: '100' },
    { filterType: 'MIN_NOTIONAL', notional: '5' },
  ] };
  assert(minimumLotRisk(symbol, 100000, 1000, policy) > 100 * policy.riskFraction);
  assert(minimumLotRisk(symbol, 100, 0.5, policy) < 100 * policy.riskFraction);
});
test("data gaps, duplicate and corrupt OHLC cannot generate signals", () => {
  for (const alter of [
    (b) => (b[50].time = b[49].time),
    (b) => (b[50].low = 200),
    (b) => (b[50].close = NaN),
    (b) => (b[50].volume = -1),
  ]) {
    const b = bars();
    alter(b);
    assert.throws(() => I.validateBars(b, 3600000));
  }
});
test("structural stops and targets for both directions obey ticks", () => {
  for (const side of ["LONG", "SHORT"]) {
    const levels = R.levels({
      bars: bars(),
      entry: 110,
      side,
      atr: 2,
      tick: 0.1,
    });
    R.validateLevels({ entry: 110, side, ...levels });
    assert(Math.abs(levels.stop / 0.1 - Math.round(levels.stop / 0.1)) < 1e-8);
    assert.notEqual(Math.abs(levels.stop - 110), 1.1);
  }
});
const sizing = {
  entry: 100,
  stop: 98,
  target: 106,
  side: "LONG",
  allowedRisk: 5,
  availableMargin: 1000,
  feeRate: 0.001,
  slippageBps: 5,
  leverage: 1,
};
test("1x and 10x do not multiply capital at risk", () => {
  const a = R.size(sizing),
    b = R.size({ ...sizing, leverage: 10 });
  assert.equal(a.quantity, b.quantity);
  assert.equal(a.riskAtStop, b.riskAtStop);
  assert(Math.abs(a.margin / b.margin - 10) < 1e-9);
  assert(a.riskAtStop <= 5);
  for (const leverage of [0, 11, 1.2, NaN])
    assert.throws(() => R.size({ ...sizing, leverage }), /LEVERAGE/);
  assert.throws(
    () => R.size({ ...sizing, stop: 50, leverage: 10 }),
    /LIQUIDATION/,
  );
});
test("fees funding and PnL apply to notional for LONG and SHORT", () => {
  assert.deepEqual(
    R.pnl({
      side: "LONG",
      entry: 100,
      exit: 110,
      quantity: 2,
      feeRate: 0.001,
      funding: 0.1,
    }),
    { gross: 20, fees: 0.42, funding: 0.1, net: 19.479999999999997 },
  );
  const s = R.pnl({
    side: "SHORT",
    entry: 100,
    exit: 90,
    quantity: 2,
    feeRate: 0.001,
    funding: -0.1,
  });
  assert(Math.abs(s.net - 19.72) < 1e-8);
  assert.throws(() => R.size({ ...sizing, feeRate: NaN }));
});
test("circuit breaker rejects missing health, drawdown and losing streak without disabling management", () => {
  const status = {
    drawdown: 0,
    lossStreak: 0,
    apiHealthy: true,
    jevHealthy: true,
    dataValid: true,
    reconciled: true,
    executionMatched: true,
  };
  assert(R.breaker(status, policy).allowed);
  for (const key of [
    "apiHealthy",
    "jevHealthy",
    "dataValid",
    "reconciled",
    "executionMatched",
  ]) {
    const b = R.breaker({ ...status, [key]: false }, policy);
    assert(!b.allowed);
    assert(b.manageOpenPositions);
  }
  assert(!R.breaker({ ...status, drawdown: 0.2 }, policy).allowed);
  assert(!R.breaker({ ...status, lossStreak: 10 }, policy).allowed);
});
test("backtest delays entry, charges funding and takes stop first on ambiguous bar", () => {
  const data = {
    symbol: "XUSDT",
    timeframe: "1h",
    start: 0,
    intervalMs: 3600000,
    bars: bars(),
    funding: [],
  };
  data.bars[63] = { ...data.bars[63], high: 200, low: 1 };
  const d = B.prepare(data);
  for (const f of d.features) {
    f.signals.EMA.signal = "LONG";
    f.signals.RSI.signal = "LONG";
  }
  d.fundingByBar.set(63 * 3600000, [
    { time: 63 * 3600000, rate: 0.001, markPrice: 100 },
  ]);
  const trades = B.unitTrades(d, {
    pair: ["EMA", "RSI"],
    management: "fixed",
    start: 60 * 3600000,
    end: 90 * 3600000,
    policy: { ...policy, minQuoteVolume: 0 },
  });
  assert(trades.length > 0);
  const t = trades[0];
  assert.equal(t.entryTime, 62 * 3600000);
  assert(t.entryTime >= t.signalTime + 3600000);
  assert.equal(t.exitReason, "STOP");
  assert(t.funding > 0);
  assert(t.fees > 0);
  assert(t.net < t.gross);
});
test("net PF and expectancy count losing costs, Monte Carlo deterministic, empty rejected", () => {
  const trades = [
    { net: 5, gross: 6, fees: 1, r: 1, exitTime: 1 },
    { net: -4, gross: -3, fees: 1, r: -0.8, exitTime: 2 },
  ];
  const m = M.metrics(trades, 100);
  assert.equal(m.profitFactor, 1.25);
  assert.equal(m.expectancy, 0.5);
  assert.equal(m.grossLoss, 3);
  assert.equal(m.fees, 2);
  const opts = { iterations: 100, seed: 42 };
  assert.deepEqual(M.monteCarlo(trades, opts), M.monteCarlo(trades, opts));
  assert.equal(M.monteCarlo([], opts).available, false);
  assert(!promotion(policy, null).allowed);
});
test("feedback never treats missing fees, hedged funding or incomplete fill quantities as zero net cost", () => {
  const base = {
    side: "LONG",
    quantity: 1,
    entryTime: 1,
    exitTime: 10,
    entryOrderId: 1,
    funding: [{ asset: "USDT", income: "-.1" }],
    fills: [
      {
        time: 2,
        positionSide: "LONG",
        side: "BUY",
        qty: "1",
        orderId: 1,
        realizedPnl: "0",
        commission: ".1",
        commissionAsset: "USDT",
      },
      {
        time: 9,
        positionSide: "LONG",
        side: "SELL",
        qty: "1",
        orderId: 2,
        realizedPnl: "2",
        commission: ".1",
        commissionAsset: "USDT",
      },
    ],
  };
  assert(account(base).accountingComplete);
  assert(Math.abs(account(base).net - 1.7) < 1e-8);
  assert.equal(account({ ...base, hedged: true }).net, null);
  assert.equal(account({ ...base, fills: base.fills.slice(0, 1) }).net, null);
});

test("zero-trade combinations cannot qualify and confidence is not calibrated from sparse winners", () => {
  const { eligible } = require("../scripts/strategy/experiment");
  assert.equal(
    eligible({
      metrics: M.metrics([]),
      breakdown: { symbol: {}, period: {} },
      halted: false,
    }).passed,
    false,
  );
  const { calibrate } = require("../services/strategy/calibration");
  const c = calibrate(
    Array.from({ length: 20 }, (_, i) => ({
      accountingComplete: true,
      entryTime: i,
      exitTime: i + 1,
      confidence: 95,
      r: 1,
      net: 1,
      gross: 1.1,
      fees: 0.1,
    })),
  );
  assert.equal(c.minimumConfidence, null);
  assert.equal(c.leverageThresholds, null);
});

test("historical data checksum changes when any close or funding amount is corrupted", () => {
  const { contentHash } = require("../scripts/strategy/download");
  const d = {
    symbol: "BTCUSDT",
    timeframe: "1h",
    start: 0,
    end: 100,
    bars: bars(),
    funding: [{ time: 50, rate: 0.001, markPrice: 100 }],
  };
  const before = contentHash(d);
  d.funding[0].rate = 0.1;
  assert.notEqual(contentHash(d), before);
});

test("missing funding coverage remains pending even with balanced entry and exit fills", () => {
  const result = account({
    fills: [
      {
        time: 1,
        positionSide: "LONG",
        side: "BUY",
        qty: 1,
        orderId: 1,
        realizedPnl: 0,
        commission: 0.1,
        commissionAsset: "USDT",
      },
      {
        time: 2,
        positionSide: "LONG",
        side: "SELL",
        qty: 1,
        orderId: 2,
        realizedPnl: 1,
        commission: 0.1,
        commissionAsset: "USDT",
      },
    ],
    funding: [],
    side: "LONG",
    quantity: 1,
    entryTime: 1,
    exitTime: 2,
    entryOrderId: 1,
    fundingCoverageVerified: false,
  });
  assert.equal(result.accountingComplete, false);
  assert.equal(result.net, null);
});

test("invalid quantity caps cannot escape sizing as NaN", () => {
  for (const maxQty of [NaN, -1, 0, "100"])
    assert.throws(() => R.size({ ...sizing, maxQty }), /INVALID_RISK_INPUT/);
});
