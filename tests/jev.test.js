'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, config, validateLevels, options, requestId } = require('../services/jev');
const { validateJevExecution } = require('../services/jev_execution');
const now = 1800000000000;
const cfg = { ...config({}), enabled: true, observe: false, apiKey: 'test-secret' };
const input = () => ({ ...require('./fixtures/jev_context')(), symbol: 'BTCUSDT', opportunityCycleId: 'cycle-1', marketDataAt: now - 100,
  direction: 'LONG', indicators: { currentPrice: 100, atr: 2 }, slMultiplier: 1.5, tpMultiplier: 2,
  passRisk: true, portfolioCapacity: { allowed: true }, hardBlockers: [], balance: 1000 });
const filter = { filterType: 'PRICE_FILTER', tickSize: '0.1', minPrice: '0.1', maxPrice: '1000000' };
function mock(choice = 'LONG', alter = x => x) {
  const calls = [];
  const fetchImpl = async (url, args) => {
    calls.push({ url, args });
    if (url.includes('ticker/price')) return { ok: true, json: async () => ({ symbol: 'BTCUSDT', price: '100', time: now }) };
    if (url.includes('exchangeInfo')) return { ok: true, json: async () => ({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', filters: [filter] }] }) };
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const request = JSON.parse(args.body), key = Object.keys(request.questions)[0];
    return { ok: true, json: async () => alter({ model: 'jev-1.13.0', answers: { [key]: { type: 'choice', choice,
      confidence: 1, probabilities: Object.fromEntries(['NO_TRADE','LONG','SHORT'].map(k => [k, k === choice ? 1 : 0])) } }, usage: { input_tokens: 1, output_tokens: 0 } }) };
  };
  return { fetchImpl, calls };
}
for (const choice of ['NO_TRADE','LONG','SHORT']) test(`Jev ${choice} authentic API contract`, async () => {
  const m = mock(choice), d = { ...input(), direction: choice === 'SHORT' ? 'SHORT' : 'LONG' };
  const result = await evaluate(d, { cfg, now: () => now, ...m });
  assert.equal(result.decision, choice);
  if (choice !== 'NO_TRADE') {
    validateLevels(result.proposal, 100, filter);
    assert.equal(result.proposal.sl, choice === 'LONG' ? 97 : 103);
    assert.equal(result.proposal.tp, choice === 'LONG' ? 106 : 94);
  }
  assert.equal(m.calls.length, 3);
  const request = JSON.parse(m.calls[2].args.body);
  assert.equal(request.model, 'jev-latest');
  assert.equal(request.questions[`entry_${result.id}`].type, 'choice');
  assert(!JSON.stringify(result).includes('test-secret'));
});
test('incomplete, wrong binding, malformed distribution fail closed', async () => {
  for (const alter of [() => ({}), b => ({ ...b, answers: { wrong: Object.values(b.answers)[0] } }),
    b => { Object.values(b.answers)[0].probabilities.LONG = NaN; return b; },
    b => { Object.values(b.answers)[0].confidence = '1'; return b; }]) {
    const r = await evaluate(input(), { cfg, now: () => now, ...mock('LONG', alter) });
    assert.equal(r.decision, 'NO_TRADE'); assert.equal(r.reason, 'JEV_INVALID_RESPONSE');
  }
});
test('invalid and out-of-filter levels', () => {
  for (const p of [{ sl: NaN, tp: 106 }, { sl: 100, tp: 106 }, { sl: 97, tp: 98 }, { sl: '97', tp: 106 },
    { sl: 97.01, tp: 106 }, { sl: -1, tp: 106 }]) assert.throws(() => validateLevels({ direction: 'LONG', ...p }, 100, filter));
  assert.throws(() => options({ ...input(), indicators: { atr: 1000 } }, 100, filter));
  assert.throws(() => validateLevels({ direction: 'LONG', sl: 97, tp: 106 }, 100, { ...filter, maxPrice: 105 }));
});
test('stale/future data do not call API', async () => {
  for (const marketDataAt of [now - cfg.maxAgeMs - 1, now + 1, undefined]) {
    const m = mock();
    const r = await evaluate({ ...input(), marketDataAt }, { cfg, now: () => now, ...m });
    assert.equal(r.reason, 'JEV_STALE_DATA'); assert.equal(m.calls.length, 0);
  }
});
test('unavailable API and timeout never retry', async () => {
  let calls = 0;
  const m = mock();
  const fetchImpl = async (url, args) => {
    if (url.includes('typesafe')) { calls++; throw new Error('secret token in arbitrary transport error'); }
    return m.fetchImpl(url,args);
  };
  const r = await evaluate(input(), { cfg, now: () => now, fetchImpl });
  assert.equal(r.decision, 'NO_TRADE'); assert.equal(r.reason, 'JEV_API_UNAVAILABLE'); assert.equal(calls,1);
  let time = now;
  const late = mock('LONG', b => { time += 6000; return b; });
  const timeout = await evaluate(input(), { cfg, now: () => time, ...late });
  assert.equal(timeout.reason, 'JEV_TIMEOUT');
});
test('operational risk veto preserved', async () => {
  for (const d of [{ ...input(), passRisk: false }, { ...input(), portfolioCapacity: { allowed: false } },
    { ...input(), hardBlockers: [{ code: 'COOLDOWN' }] }]) {
    const r = await evaluate(d, { cfg, now: () => now, ...mock() });
    assert.equal(r.decision, 'NO_TRADE'); assert.equal(r.proposedDecision, 'LONG'); assert.match(r.reason, /REJECTED$/);
  }
});
test('observation is marked, missing credentials fail closed, default disabled', async () => {
  assert.equal(config({}).enabled, false); assert.equal(config({}).observe, true);
  const r = await evaluate(input(), { cfg: { ...cfg, observe: true }, now: () => now, ...mock() });
  assert.equal(r.mode, 'observe'); assert.equal(r.decision, 'LONG');
  const missing = await evaluate(input(), { cfg: { ...cfg, apiKey: '' }, now: () => now, ...mock() });
  assert.equal(missing.reason, 'JEV_NOT_CONFIGURED');
});
test('engine binds persisted proposal, symbol, expiry, levels, precision and idempotency ID', async () => {
  const r = await evaluate(input(), { cfg, now: () => now, ...mock() });
  const hex = requestId(input()).slice(0,32);
  const executionId = [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  const request = { executionId, symbol: 'BTCUSDT', positionSide: 'LONG', stopLoss: 97, takeProfit: 106,
    tradeContext: { jev: { id:r.id, mode:'enforce' } } };
  const deps = { cfg, now, quoteTime: now, livePrice: 100, rules: { tick:0.1 }, db: { execute: async () => [[{ result: JSON.stringify(r) }]] } };
  await validateJevExecution(request, deps);
  await assert.rejects(validateJevExecution(request, { ...deps, quoteTime: now - cfg.maxAgeMs - 1 }), /STALE/);
  for (const change of [{ symbol:'ETHUSDT' }, { positionSide:'SHORT' }, { stopLoss:96 }, { executionId:'another' }, { tradeContext:{} }])
    await assert.rejects(validateJevExecution({ ...request, ...change }, deps), /JEV_/);
  await assert.rejects(validateJevExecution(request, { ...deps, now: now + cfg.maxAgeMs }), /STALE/);
  await assert.rejects(validateJevExecution(request, { ...deps, livePrice:102 }), /DRIFT/);
  await assert.rejects(validateJevExecution(request, { ...deps, rules:{ tick:2 } }), /PRICE_FILTER/);
});
module.exports = { input, mock };
test('wrong market symbol, stale quote and excessive drift reject before model call', async () => {
  for (const quote of [{symbol:'ETHUSDT',price:'100',time:now}, {symbol:'BTCUSDT',price:'100',time:now-300000},
    {symbol:'BTCUSDT',price:'102',time:now}, {symbol:'BTCUSDT',price:'0',time:now}]) {
    const m=mock();
    const fetchImpl=async(url,args)=>url.includes('ticker/price') ? {ok:true,json:async()=>quote} : m.fetchImpl(url,args);
    const r=await evaluate(input(),{cfg,now:()=>now,fetchImpl});
    assert.equal(r.decision,'NO_TRADE');assert.equal(m.calls.some(c=>c.url.includes('typesafe')),false);
  }
});
test('switching to observation or disabling forbids replaying old enforced proposals', async () => {
  const request={tradeContext:{jev:{mode:'enforce',id:'a'.repeat(64)}}};
  for(const c of [{...cfg,observe:true},{...cfg,enabled:false}])
    await assert.rejects(validateJevExecution(request,{cfg:c}),/ENFORCEMENT_DISABLED/);
});
test('Jev can choose the opposite direction with a lower technical score', async () => {
  const d = input();
  d.hardBlockers = [{code:'TECHNICAL_SCORE'}, {code:'LEARNING_HARD_BLOCK'}];
  const r = await evaluate(d, {cfg, now:()=>now, ...mock('SHORT')});
  assert.equal(r.decision,'SHORT');
  assert.equal(r.proposal.sl,103); assert.equal(r.proposal.tp,94);
  assert.equal(r.context.technicalScore,30);
  assert.equal(r.context.tf4h.status,'CONTRADICTS');
  assert.equal(r.context.aiResult.direction_bias,'SHORT');
  assert.equal(r.context.contributionTable[0].value,30);
});
test('correlation is checked for Jev selected side instead of original side', async () => {
  const d=input();
  d.hardBlockers=[{code:'PORTFOLIO_CORRELATION',candidateDirection:'LONG'}];
  d.directionalRisk.LONG=[{code:'PORTFOLIO_CORRELATION'}];
  const short=await evaluate(d,{cfg,now:()=>now,...mock('SHORT')});
  assert.equal(short.decision,'SHORT');
  const long=await evaluate(d,{cfg,now:()=>now,...mock('LONG')});
  assert.equal(long.decision,'NO_TRADE'); assert.equal(long.reason,'JEV_RISK_REJECTED');
});
test('missing evidence for chosen direction fails closed without using other-side context',async()=>{
  const d=input(); delete d.directionalEvidence.SHORT;
  const r=await evaluate(d,{cfg,now:()=>now,...mock('SHORT')});
  assert.equal(r.decision,'NO_TRADE'); assert.equal(r.reason,'JEV_DIRECTIONAL_DATA_MISSING');
});
test('candidate eligibility does not require a technical signal or learning approval',()=>{
  const {eligibleForJev}=require('../services/jev_authority');
  const d={...input(),direction:'NEUTRAL',finalScore:20,hardBlockers:[{code:'TECHNICAL_SCORE'},{code:'DIRECTION_AMBIGUOUS'},{code:'LEARNING_HARD_BLOCK'}]};
  assert.equal(eligibleForJev(d),true);
  assert.equal(eligibleForJev({...d,hardBlockers:[{code:'SYMBOL_COOLDOWN'}]}),false);
  assert.equal(eligibleForJev({...d,directionalRisk:{LONG:[{}],SHORT:[{}]}}),false);
});
test('official adapter is accepted with its provider model and internal bearer token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('ticker/price')) return { ok: true, json: async () => ({ symbol: 'BTCUSDT', price: '100', time: now }) };
    if (url.includes('exchangeInfo')) return { ok: true, json: async () => ({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', filters: [filter] }] }) };
    return { ok: true, json: async () => ({ model: 'claude-haiku-4-5-20251001', answers: {
      [`entry_${requestId(input())}`]: { type: 'choice', choice: 'SHORT', confidence: .7,
        probabilities: { NO_TRADE: .1, LONG: .2, SHORT: .7 } }
    }, usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  const adapterCfg = { ...cfg, provider: 'typesafe-adapter', apiKey: '', adapterToken: 'internal-test',
    adapterUrl: 'http://typesafe_adapter:8088' };
  const result = await evaluate(input(), { cfg: adapterCfg, now: () => now, fetchImpl });
  assert.equal(result.decision, 'SHORT');
  assert.equal(result.answer.provider, 'typesafe-adapter');
  const adapterCall = calls[2];
  assert.equal(adapterCall.url, 'http://typesafe_adapter:8088/v1/systemone');
  assert.equal(adapterCall.options.headers.authorization, 'Bearer internal-test');
  assert.equal(JSON.parse(adapterCall.options.body).model, 'jev-latest');
});
test('adapter unavailable or missing token fails closed with no retry', async () => {
  const adapterCfg = { ...cfg, provider: 'typesafe-adapter', apiKey: '', adapterToken: '' };
  const missing = await evaluate(input(), { cfg: adapterCfg, now: () => now, ...mock('LONG') });
  assert.equal(missing.reason, 'JEV_ADAPTER_NOT_CONFIGURED');
  let adapterCalls = 0;
  const m = mock('LONG');
  const unavailable = await evaluate(input(), { cfg: { ...adapterCfg, adapterToken: 'x' }, now: () => now,
    fetchImpl: async (url, opts) => {
      if (url.includes('typesafe_adapter')) { adapterCalls++; return { ok: false, status: 503, json: async () => ({}) }; }
      return m.fetchImpl(url, opts);
    } });
  assert.equal(unavailable.reason, 'JEV_ADAPTER_UNAVAILABLE');
  assert.equal(adapterCalls, 1);
});
