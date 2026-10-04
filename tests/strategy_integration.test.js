"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { evaluate, config } = require("../services/jev"),
  { universe, cycle, batchOffset } = require("../services/strategy/engine"),
  { ExecutionEngine } = require("../position-guard/execution-engine");
const policy = require("../config/strategy-v2.json"),
  now = 1800000000000;
const bars = Array.from({ length: 60 }, (_, i) => ({
  time: now - (60 - i) * 3600000,
  open: 100,
  high: 100.4,
  low: 99.6,
  close: 100,
  volume: 100,
  quoteVolume: 10000,
}));
const d = () => ({
  symbol: "BTCUSDT",
  timeframe: "1h",
  opportunityCycleId: "strategy-test",
  marketDataAt: now,
  indicators: { currentPrice: 100, atr: 0.5 },
  strategy: {
    version: "two-indicator-v1",
    directions: ["LONG", "SHORT"],
    pair: ["EMA", "RSI"],
    recentCandles: bars,
    indicators: [
      { name: "EMA", value: { fast: 101, slow: 100 }, signal: "LONG" },
      { name: "RSI", value: 60, signal: "LONG" },
    ],
    riskPolicy: policy,
    regime: "TRENDING",
    higherTimeframeTrend: "UP",
    correlationExposure: { status: "UNESTIMATED" },
    volume: { quote24h: 10000000 },
    funding: { rate: 0.0001 },
    recentSystemPerformance: { trades: 0 },
  },
});
const cfg = {
  ...config({}),
  enabled: true,
  observe: false,
  apiKey: "mock",
  executionToken: "mock",
  binanceApiKey: "mock",
  binanceApiSecret: "mock",
};
function mock(decision = "LONG", failure = null) {
  let requests = [];
  const json = (body) => ({ ok: true, json: async () => body });
  return {
    requests,
    fetchImpl: async (url, args) => {
      if (url.includes("portfolio-capacity"))
        return json({
          allowed: true,
          checkedAt: new Date(now).toISOString(),
          positions: [],
          account: { equity: 1000 },
          risk: { remainingRiskAmount: 20, openRiskAmount: 0 },
          capacity: { remainingMargin: 900 },
          exposure: {
            remaining: 4000,
            bySymbol: {},
            direction: { LONG: 0, SHORT: 0 },
          },
          limits: { maxSymbolExposurePct: 100, maxDirectionExposurePct: 300 },
        });
      if (url.includes("ticker/price"))
        return json({ symbol: "BTCUSDT", time: now, price: "100" });
      if (url.includes("exchangeInfo"))
        return json({
          symbols: [
            {
              symbol: "BTCUSDT",
              status: "TRADING",
              filters: [
                {
                  filterType: "PRICE_FILTER",
                  tickSize: ".01",
                  minPrice: ".01",
                  maxPrice: "10000",
                },
                {
                  filterType: "LOT_SIZE",
                  minQty: ".001",
                  stepSize: ".001",
                  maxQty: "10000",
                },
                { filterType: "MIN_NOTIONAL", notional: "5" },
              ],
            },
          ],
        });
      if (url.includes("/time")) return json({ serverTime: Date.now() });
      if (url.includes("commissionRate"))
        return json({ takerCommissionRate: ".001" });
      if (url.includes("leverageBracket"))
        return json([
          {
            symbol: "BTCUSDT",
            brackets: [
              {
                notionalFloor: 0,
                notionalCap: 100000,
                initialLeverage: 10,
                maintMarginRatio: 0.005,
              },
            ],
          },
        ]);
      if (failure === "unavailable") return { ok: false, status: 503 };
      const q = JSON.parse(args.body);
      requests.push(q);
      const answers = {};
      for (const [key, question] of Object.entries(q.questions)) {
        const keys = Object.keys(question.criteria),
          choice = keys.includes("NO_TRADE")
            ? decision
            : keys.includes("x5")
              ? "x5"
              : keys[0];
        answers[key] = {
          type: "choice",
          choice,
          confidence: 0.82,
          probabilities: Object.fromEntries(
            keys.map((k) => [k, k === choice ? 1 : 0]),
          ),
        };
      }
      if (failure === "invalid") Object.values(answers)[0].confidence = 101;
      return json({ model: "jev-test", answers });
    },
  };
}
for (const side of ["LONG", "SHORT", "NO_TRADE"])
  test(`new engine reuses authentic JEV adapter schema: ${side}`, async () => {
    const m = mock(side),
      r = await evaluate(d(), { cfg, now: () => now, ...m });
    if (r.leveragePolicy) {
      assert(r.leveragePolicy.allowedChoices.every(n => n >= (policy.minLeverage ?? 1) && n <= (policy.maxLeverage ?? 10)));
    }
    assert.equal(r.decision, side, JSON.stringify(r));
    assert.equal(m.requests[0].state.indicator_1, "EMA");
    assert.equal(m.requests[0].state.indicator_2, "RSI");
    assert.equal(m.requests[0].state.directionalEvidence, undefined);
    if (side !== "NO_TRADE") {
      assert.equal(r.proposal.leverage, 5);
      assert(r.risk.riskAtStop <= 5);
      assert.equal(r.confidence, 82);
      assert.equal(m.requests.length, 2);
    }
  });
for (const failure of ["unavailable", "invalid"])
  test(`JEV ${failure} closes new-entry gate`, async () => {
    const r = await evaluate(d(), {
      cfg,
      now: () => now,
      ...mock("LONG", failure),
    });
    assert.equal(r.decision, "NO_TRADE");
    assert.match(r.reason, /UNAVAILABLE|INVALID_RESPONSE/);
  });
test("liquidity universe logs rejection reasons, permits liquid altcoins", () => {
  const args = {
    now,
    policy,
    info: {
      symbols: [
        {
          symbol: "SOLUSDT",
          quoteAsset: "USDT",
          contractType: "PERPETUAL",
          status: "TRADING",
          onboardDate: now - 100 * 86400000,
        },
      ],
    },
    tickers: [{ symbol: "SOLUSDT", quoteVolume: 10000000 }],
    books: [{ symbol: "SOLUSDT", bidPrice: 100, askPrice: 100.01 }],
  };
  assert.equal(universe(args)[0].status, "SELECTED");
  args.books[0].askPrice = 105;
  assert(universe(args)[0].reasons.includes("SPREAD"));
});
test("unapproved configuration never invokes JEV or market API", async () => {
  const events = [];
  const db = {
    execute: async (sql, args) => {
      events.push({ sql, args });
      return [[]];
    },
  };
  const r = await cycle({
    db,
    policy: { ...policy, pair: null, manualActivation: null },
    report: null,
    fetchImpl: () => assert.fail("network"),
    evaluateJev: () => assert.fail("JEV"),
  });
  assert.equal(r.passAI, false);
  assert.match(r.skipReason, /NO_SELECTED_PAIR/);
  assert(
    events.some(
      (e) => e.sql.includes("strategy_events") && e.args?.[1] === "DECISION",
    ),
  );
});
test("Binance rejection never persists open state; strategy failure latches breaker", async () => {
  const calls = [],
    db = {
      execute: async (sql, args) => {
        calls.push(sql);
        return [[]];
      },
    };
  const engine = new ExecutionEngine({ config: {}, db, binance: {} });
  engine.existing = async () => null;
  engine.event = async () => {};
  engine.dispatch = async () => {
    throw Object.assign(Error("BINANCE_REJECTED"), { retryable: false });
  };
  engine.persistVerifiedState = async () =>
    assert.fail("Unconfirmed position persisted");
  engine.notifyFailure = async () => false;
  const result = await engine.run({
    executionId: "11111111-1111-4111-8111-111111111111",
    type: "OPEN_POSITION",
    symbol: "BTCUSDT",
    positionSide: "LONG",
    maxAttempts: 1,
    tradeContext: { strategy: { version: "two-indicator-v1" } },
  });
  assert.equal(result.ok, false);
  assert(calls.some((s) => s.includes("strategy_breaker")));
});
test("unverified open notification cannot be emitted; confirmed two-indicator alert includes all fields", async () => {
  const code = fs.readFileSync(
      "bot-control/workflows/code/build-verified-open-notification-v1.js",
      "utf8",
    ),
    fn = new (Object.getPrototypeOf(async function () {}).constructor)(
      "$input",
      code,
    );
  const x = {
    strategyV2: true,
    strategy: d().strategy,
    jev: { confidence: 82, risk: { riskAtStop: 5, expectedR: 2 } },
    symbol: "BTCUSDT",
    leverage: 5,
    executionId: "test",
    exchangeOrderId: "123",
    success: true,
    finalStatus: "VERIFIED",
    verificationResult: {
      verified: true,
      pipelineVerified: true,
      persistenceStatus: "VERIFIED",
      after: { position: { side: "LONG", entryPrice: 100 } },
      requested: { stopLoss: 98, takeProfit: 106 },
      portfolioAllocation: { allowed: true },
    },
  };
  const run = (x) => fn({ first: () => ({ json: x }) });
  await assert.rejects(() => run({ ...x, success: false }));
  const result = await run(x);
  assert(result[0].json.text.includes("BINANCE CONFIRMED"));
  assert(result[0].json.text.includes("EMA"));
  assert.equal(result[0].json.notificationEventKey, "open:test");
});
test("GUI scripts compile and new workflow bypasses legacy scoring gates", () => {
  const html = require("../views/strategy").getStrategyHTML();
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
    if (!m[1].includes("src=")) new vm.Script(m[2]);
  const raw = require("../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json"),
    w = Array.isArray(raw) ? raw[0] : raw;
  assert.equal(
    w.connections["If: Two Indicator Engine"].main[0][0].node,
    "Two Indicator Decision",
  );
  assert.equal(
    w.connections["If: Two Indicator Engine"].main[1][0].node,
    "Risk Guard",
  );
  assert.equal(
    w.connections["If: Strategy Approved"].main[0][0].node,
    "Position Sizer",
  );
  assert.equal(w.connections["If: Strategy Approved"].main[1][0].node, "Strategy Scan Report");
  assert.equal(w.connections["Telegram: Trade Opened"], undefined);
});
test('each scheduled scan moves by a full batch across the liquid universe', () => {
  const count = 163, size = 24, start = 0;
  const offsets = Array.from({ length: 7 }, (_, i) => batchOffset(start + i * 900000, count, size));
  assert.deepEqual(offsets, [0, 24, 48, 72, 96, 120, 144]);
  assert.equal(new Set(offsets).size, 7);
});
test('a no-opportunity report sends one compact hourly summary without symbol lists', async () => {
  const code = fs.readFileSync(require.resolve('../bot-control/workflows/code/strategy-no-trade.js'), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('$input', code);
  const posted = [];
  const checked = Array.from({ length: 175 }, (_, i) => ({ symbol: `TOKEN${i}USDT`, reasons: ['LOW_DEPTH', 'NO_TWO_INDICATOR_SIGNAL'], depthQuote: 1200 + i, requiredDepthQuote: 100000, indicators: [{ name: 'ADX', signal: 'SHORT' }, { name: 'BOLLINGER', signal: 'NO_TRADE' }] }));
  const input = { first: () => ({ json: { strategyV2: true, opportunityCycleId: 'cycle-1', passAI: false, skipReason: 'NO_OPPORTUNITY', universeSummary: { scanned: 175, eligible: 175, checked, reasons: { LOW_DEPTH: 175 } } } }) };
  const helper = { helpers: { httpRequest: async request => { posted.push(request); return { status: 'SENT' }; } } };
  const first = await run.call(helper, input);
  const second = await run.call(helper, input);
  assert.equal(posted.length, 2);
  assert.equal(first[0].json.notificationEventKey, second[0].json.notificationEventKey);
  assert.match(posted[0].body.text, /Analizados: 175 de 175/);
  assert.match(posted[0].body.text, /Profundidad insuficiente: 175/);
  assert(!posted[0].body.text.includes('TOKEN0USDT'));
  assert(posted[0].body.text.length < 500);
});
test('engine checks every eligible symbol when no entry is found', async () => {
  const when = 1800000000000;
  const symbols = Array.from({ length: 30 }, (_, i) => `TOKEN${i}USDT`);
  const candles = Array.from({ length: 240 }, (_, i) => {
    const open = when - (240 - i) * 14400000;
    return [open, '100', '101', '99', '100', '100', open + 14400000 - 1, '10000'];
  });
  const db = { execute: async sql => {
    if (sql.includes('FROM strategy_breaker')) return [[{ halted: 0, peak_equity: 1000 }]];
    if (sql.includes('FROM trades WHERE')) return [[]];
    if (sql.includes('FROM strategy_events WHERE event_type=')) return [[]];
    return [[]];
  } };
  let depthRequests = 0;
  const fetchImpl = async url => {
    let data;
    if (url.includes('portfolio-capacity')) data = { checkedAt: new Date(when).toISOString(), allowed: true, account: { equity: 1000 }, positions: [] };
    else if (url.endsWith('/exchangeInfo')) data = { symbols: symbols.map(symbol => ({ symbol, quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: when - 120 * 86400000 })) };
    else if (url.endsWith('/ticker/24hr')) data = symbols.map(symbol => ({ symbol, quoteVolume: '10000000' }));
    else if (url.endsWith('/ticker/bookTicker')) data = symbols.map(symbol => ({ symbol, bidPrice: '99.99', askPrice: '100.01' }));
    else if (url.includes('/depth')) { depthRequests++; data = { bids: [], asks: [] }; }
    else if (url.includes('/premiumIndex')) data = { lastFundingRate: '0.0001' };
    else if (url.includes('/klines')) data = candles;
    else throw Error(`Unexpected URL ${url}`);
    return { ok: true, json: async () => data };
  };
  const report = require('../docs/strategy/results.json');
  const result = await cycle({ db, fetchImpl, policy, report, now: () => when,
    evaluateJev: () => assert.fail('No symbol passed market quality') });
  assert.equal(result.skipReason, 'NO_OPPORTUNITY');
  assert.equal(result.universeSummary.eligible, 30);
  assert.equal(result.universeSummary.scanned, 30);
  assert.equal(result.universeSummary.checked.length, 30);
  assert(result.universeSummary.checked.every(x => x.reasons.includes('NO_TWO_INDICATOR_SIGNAL')));
  assert.equal(depthRequests, 0);
});

test("feedback uses actual Binance entry time and filled quantity, not delayed DB time/request quantity", async () => {
  const { capture } = require("../services/strategy/feedback");
  const start = 1700000000000,
    end = start + 3600000,
    calls = [];
  const fills = [
    {
      time: start,
      orderId: 1,
      positionSide: "LONG",
      side: "BUY",
      qty: 1,
      realizedPnl: 0,
      commission: 0.1,
      commissionAsset: "USDT",
    },
    {
      time: end,
      orderId: 2,
      positionSide: "LONG",
      side: "SELL",
      qty: 1,
      realizedPnl: 2,
      commission: 0.1,
      commissionAsset: "USDT",
    },
  ];
  const binance = {
    request: async (_method, path, args) => {
      calls.push({ path, args });
      return path.includes("userTrades") ? [fills[0]] : [];
    },
    userTrades: async (_symbol, time) => {
      assert.equal(time, start);
      return fills;
    },
  };
  const db = { execute: async () => [[]] };
  const feedback = await capture({
    db,
    binance,
    trade: {
      id: 7,
      symbol: "BTCUSDT",
      direction: "LONG",
      market_order_id: 1,
      opened_at: new Date(start + 120000),
      entry_price: 100,
    },
    original: {
      executionId: "test",
      quantity: 1.1,
      leverage: 2,
      stopLoss: 98,
      takeProfit: 104,
      tradeContext: {
        strategy: d().strategy,
        strategyRisk: { riskAtStop: 3 },
        strategyConfidence: 80,
      },
    },
    close: { closedAt: end, exitPrice: 102, closeReason: "TP" },
  });
  assert.equal(feedback.accountingComplete, true);
  assert.equal(feedback.entryTime, start);
  assert.equal(feedback.net, 1.8);
  assert.equal(
    calls.find((c) => c.path.includes("income")).args.startTime,
    start,
  );
});

test("disabled or observe-only JEV cannot bypass the strategy receipt gate", async () => {
  const { validateJevExecution } = require("../services/jev_execution");
  for (const cfg of [
    { enabled: false, observe: true },
    { enabled: true, observe: true },
    { enabled: true, observe: false },
  ]) {
    await assert.rejects(
      () =>
        validateJevExecution(
          { tradeContext: { strategy: { version: "two-indicator-v1" } } },
          {
            cfg,
            db: { execute: () => assert.fail("should reject before DB") },
          },
        ),
      /STRATEGY_JEV_ENFORCEMENT_REQUIRED/,
    );
  }
});
