'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, config } = require('../services/jev');
const { evaluateLeverageChoices } = require('../services/jev_leverage_policy');
const { projectPair, filtersFor, requestedRisk } = require('../services/jev_capacity');

const now = 1800000000000;
const symbol = { symbol: 'BTCUSDT', status: 'TRADING', filters: [
  { filterType: 'PRICE_FILTER', tickSize: '0.1', minPrice: '0.1', maxPrice: '1000000' },
  { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '10000', stepSize: '0.001' },
  { filterType: 'MIN_NOTIONAL', notional: '5' }
] };
const brackets = [{ notionalFloor: 0, notionalCap: 100000, initialLeverage: 10, maintMarginRatio: 0.01 }];
function capacity() { return { allowed: true, checkedAt: new Date(now).toISOString(),
  account: { equity: 1000, availableMargin: 1000, marginUsagePct: 20 },
  risk: { remainingRiskAmount: 1000, openRiskPct: 1 },
  capacity: { remainingMargin: 1000 },
  exposure: { remaining: 5000, totalPct: 30, bySymbol: {}, direction: { LONG: 0, SHORT: 0 } },
  limits: { maxSymbolExposurePct: 500, maxDirectionExposurePct: 500,
    maxMarginUsagePct: 90, maxExposurePct: 400, maxPortfolioRiskPct: 5 }, positions: [] }; }
function context() { return { symbol: 'BTCUSDT', opportunityCycleId: 'dynamic-test', marketDataAt: now - 100,
  indicators: { currentPrice: 100, atr: 0.6, ema8: 101, ema21: 100, rsi14: 58, volRatio: 1.3 },
  directionalEvidence: { LONG: { score: 90, tf4h: { status: 'CONFIRMS' }, contributions: [], indicators: {} },
    SHORT: { score: 30, tf4h: { status: 'CONTRADICTS' }, contributions: [], indicators: {} } },
  directionalRisk: { LONG: [], SHORT: [] },
  marketContext: { market_bias: 'BULLISH', size_multiplier: 1 },
  aiVision: { market_state: 'MID_TREND' }, regime: 'TRENDING',
  balance: 1000, passRisk: true, portfolioCapacity: { allowed: true }, hardBlockers: [] }; }
function decision(probability = .84, confidence = .79, noTrade = .11) {
  return { probabilities: { NO_TRADE: noTrade, LONG: probability, SHORT: 1 - probability - noTrade }, confidence }; }
function policy({ d = context(), c = capacity(), answer = decision(), entry = 100, stop = 99, target = 103,
  limits = brackets, feeRate = .001 } = {}) {
  return evaluateLeverageChoices({ decision: answer, d, side: 'LONG', entry, stop, target,
    capacity: c, symbol, brackets: limits, feeRate });
}
test('strong evidence offers higher leverage; low confidence and narrow margin do not', () => {
  const strong = policy();
  assert.deepEqual(strong.allowedChoices, [3, 4, 5, 6, 7]);
  assert.equal(strong.metrics.decisionMargin, .73);
  const weak = policy({ answer: decision(.48, .51, .41) });
  assert.deepEqual(weak.allowedChoices, [2]);
  const narrow = policy({ answer: decision(.51, .9, .44) });
  assert.deepEqual(narrow.allowedChoices, [2]);
});
test('ATR, stop distance, net RR and portfolio stress impose conservative caps', () => {
  assert(Math.max(...policy({ d: { ...context(), indicators: { ...context().indicators, atr: 5 } } }).allowedChoices) <= 3);
  assert(Math.max(...policy({ stop: 95, target: 110 }).allowedChoices) <= 3);
  assert(Math.max(...policy({ target: 101 }).allowedChoices) <= 2);
  assert(Math.max(...policy({ target: 104 }).allowedChoices) > 2);
  const stressed = capacity(); stressed.account.marginUsagePct = 80;
  assert(Math.max(...policy({ c: stressed }).allowedChoices) <= 3);
});
test('symbol bracket, liquidation buffer, fee risk and 10x cap are enforced', () => {
  const limited = policy({ limits: [{ ...brackets[0], initialLeverage: 4 }] });
  assert.deepEqual(limited.allowedChoices, [3, 4]);
  assert.throws(() => policy({ feeRate: .1 }), /DATA_UNAVAILABLE/);
  assert(policy({ answer: decision(.95, .95, .02) }).allowedChoices.every(n => n <= 10));
  assert.throws(() => policy({ c: { ...capacity(), risk: {} } }), /DATA_UNAVAILABLE/);
});
test('higher leverage changes margin, never increases the risk budget or loss at fixed notional', () => {
  const d = { ...context(), riskReduction: .8 }, c = capacity(), budget = requestedRisk(d, 'LONG'), filters = filtersFor(symbol);
  const one = projectPair(d, 'LONG', 100, 99, 1, c, filters, budget);
  const five = projectPair(d, 'LONG', 100, 99, 5, c, filters, budget);
  assert.equal(one.riskBudgetUsd, five.riskBudgetUsd);
  const quantity = Math.min(one.quantity, five.quantity);
  const lossAtOne = quantity * (Math.abs(100 - 99) + (100 + 99) * .001);
  const lossAtFive = quantity * (Math.abs(100 - 99) + (100 + 99) * .001);
  assert.equal(lossAtOne, lossAtFive);
  assert.equal(quantity * 100 / 1, 5 * quantity * 100 / 5);
  assert(lossAtFive <= budget.amount);
});
test('two TypeSafe choices: Jev sees only approved leverage and cannot select another', async () => {
  const calls = [], cfg = { ...config({ JEV_DYNAMIC_LEVERAGE_ENABLED: 'true' }), enabled: true, observe: false,
    apiKey: 'test-only', binanceApiKey: 'test-key', binanceApiSecret: 'test-secret', executionToken: 'test-engine' };
  let invalid = false, direction = 'LONG';
  const fetchImpl = async (url, args = {}) => {
    calls.push({ url, args });
    const json = body => ({ ok: true, json: async () => body });
    if (url.includes('portfolio-capacity')) return json(capacity());
    if (url.includes('ticker/price')) return json({ symbol: 'BTCUSDT', price: '100', time: now });
    if (url.includes('exchangeInfo')) return json({ symbols: [symbol] });
    if (url.includes('/fapi/v1/time')) return json({ serverTime: Date.now() });
    if (url.includes('leverageBracket')) return json([{ symbol: 'BTCUSDT', brackets }]);
    if (url.includes('commissionRate')) return json({ takerCommissionRate: '.001' });
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const request = JSON.parse(args.body);
    const answers = Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
      const choices = Object.keys(question.criteria);
      const selected = choices.includes('NO_TRADE') ? direction : choices.includes('x7')
        ? invalid ? 'x10' : 'x7' : choices.includes('sl1') ? 'sl1' : 'tp3';
      return [key, { type: 'choice', choice: selected, confidence: .79,
        probabilities: Object.fromEntries(choices.map(k => [k, k === selected ? 1 : 0])) }];
    }));
    if (invalid && Object.keys(request.questions).length === 1 &&
        !Object.keys(request.questions[Object.keys(request.questions)[0]].criteria).includes('NO_TRADE'))
      answers[Object.keys(request.questions)[0]].choice = 'x10';
    return json({ model: 'jev-1.13.0', answers, usage: { input_tokens: 2, output_tokens: 1 } });
  };
  const d = context();
  d.marketContext.intelligenceSignal = { signal: 'NO OPERAR', confidence: 'media',
    alerts: [{ detail: 'IGNORED_INTELLIGENCE_OPINION' }] };
  const good = await evaluate(d, { cfg, fetchImpl, now: () => now });
  assert.equal(good.decision, 'LONG', good.reason);
  assert(good.leveragePolicy.allowedChoices.includes(good.proposal.leverage));
  assert(good.leverageRequest.questions[`entry_${good.id}_LONG_leverage`]);
  assert.equal(calls.filter(c => c.url.includes('typesafe.ai')).length, 2);
  for (const c of calls.filter(c => c.url.includes('typesafe.ai'))) {
    assert.equal(JSON.parse(c.args.body).state.marketContext.intelligenceSignal, undefined);
    assert(!c.args.body.includes('IGNORED_INTELLIGENCE_OPINION'));
  }
  assert.equal(good.intelligenceReference.applied, false);
  assert(!JSON.stringify(good).includes('test-secret'));
  const before = calls.length; direction = 'NO_TRADE';
  const noTrade = await evaluate(context(), { cfg, fetchImpl, now: () => now });
  assert.equal(noTrade.decision, 'NO_TRADE');
  assert.equal(calls.slice(before).filter(c => c.url.includes('typesafe.ai')).length, 1);
  direction = 'LONG'; invalid = true;
  const rejected = await evaluate(context(), { cfg, fetchImpl, now: () => now });
  assert.equal(rejected.decision, 'NO_TRADE');
  assert.equal(rejected.reason, 'JEV_INVALID_RESPONSE');
});
test('Binance bracket or commission failure skips Jev before spending model tokens', async () => {
  const cfg = { ...config({ JEV_DYNAMIC_LEVERAGE_ENABLED: 'true' }), enabled: true, observe: false,
    apiKey: 'test-only', binanceApiKey: 'test-key', binanceApiSecret: 'test-secret', executionToken: 'test-engine' };
  let modelCalls = 0;
  const fetchImpl = async url => {
    const json = body => ({ ok: true, json: async () => body });
    if (url.includes('portfolio-capacity')) return json(capacity());
    if (url.includes('ticker/price')) return json({ symbol: 'BTCUSDT', price: '100', time: now });
    if (url.includes('exchangeInfo')) return json({ symbols: [symbol] });
    if (url.includes('/fapi/v1/time')) return json({ serverTime: Date.now() });
    if (url.includes('leverageBracket')) throw new Error('unavailable');
    if (url.includes('commissionRate')) return json({ takerCommissionRate: '.001' });
    if (url.includes('typesafe.ai')) modelCalls++;
    throw new Error('unexpected');
  };
  const r = await evaluate(context(), { cfg, fetchImpl, now: () => now });
  assert.equal(r.decision, 'NO_TRADE');
  assert.equal(r.reason, 'JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE');
  assert.equal(modelCalls, 0);
});
