'use strict';
const { createHash } = require('crypto');
const { chosenContext, operationalBlockers } = require('./jev_authority');
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
function config(env = process.env) {
  const setting = (name, fallback, min, max) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error('JEV_INVALID_CONFIG');
    return n;
  };
  return { enabled: env.JEV_ENABLED === 'true', observe: env.JEV_OBSERVE_ONLY !== 'false',
    provider: env.JEV_PROVIDER || 'typesafe', apiKey: env.TYPESAFE_API_KEY,
    model: env.JEV_MODEL || 'jev-latest', adapterUrl: env.JEV_ADAPTER_URL || 'http://typesafe_adapter:8088',
    adapterToken: env.JEV_ADAPTER_TOKEN || '',
    timeoutMs: setting('JEV_TIMEOUT_MS', 5000, 100, 15000),
    maxAgeMs: setting('JEV_MAX_DATA_AGE_MS', 120000, 1000, 300000),
    maxDriftPct: setting('JEV_MAX_PRICE_DRIFT_PCT', 0.5, 0, 2) };
}
function adapterEnabled(cfg) { return cfg.provider === 'typesafe-adapter'; }
function fresh(timestamp, now, maxAge) {
  if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > maxAge) throw new Error('JEV_STALE_DATA');
}
function validateLevels(p, entry, filter) {
  if (!['LONG', 'SHORT'].includes(p.direction) || ![entry, p.sl, p.tp].every(positive)) throw new Error('JEV_INVALID_LEVELS');
  if (!(p.direction === 'LONG' ? p.sl < entry && entry < p.tp : p.tp < entry && entry < p.sl)) throw new Error('JEV_INVALID_LEVEL_SIDE');
  const tick = Number(filter.tickSize);
  if (!positive(tick)) throw new Error('JEV_INVALID_PRICE_FILTER');
  for (const price of [p.sl, p.tp]) {
    const units = price / tick;
    if (Math.abs(units - Math.round(units)) > 1e-6 ||
        (Number(filter.minPrice) > 0 && price < Number(filter.minPrice)) ||
        (Number(filter.maxPrice) > 0 && price > Number(filter.maxPrice))) throw new Error('JEV_PRICE_FILTER_REJECTED');
  }
}
function options(d, entry, filter) {
  const atr = d.indicators?.atr, slMultiplier = d.slMultiplier ?? 1.5, tpMultiplier = d.tpMultiplier ?? 2;
  if (![atr, slMultiplier, tpMultiplier].every(positive)) throw new Error('JEV_INVALID_LEVELS');
  const tick = Number(filter.tickSize);
  if (!positive(tick)) throw new Error('JEV_INVALID_PRICE_FILTER');
  const round = n => Number((Math.round(n / tick) * tick).toFixed(12));
  return Object.fromEntries(['LONG', 'SHORT'].map(direction => {
    const sign = direction === 'LONG' ? 1 : -1;
    const p = { direction, sl: round(entry - sign * atr * slMultiplier), tp: round(entry + sign * atr * slMultiplier * tpMultiplier) };
    validateLevels(p, entry, filter);
    return [direction, p];
  }));
}
function requestId(d) {
  if (!/^[\w-]{1,100}$/.test(d.opportunityCycleId || '') || !/^[A-Z0-9_]{3,24}$/.test(d.symbol || '')) throw new Error('JEV_INVALID_IDENTITY');
  return createHash('sha256').update(`jev-v2:${d.opportunityCycleId}:${d.symbol}`).digest('hex');
}
// Explicit context selection: never send workflow credentials or the raw input.
function stateFor(d, market, levels) {
  return { schemaVersion: 'aterum-jev-v2', symbol: d.symbol, cycleId: d.opportunityCycleId,
    marketDataAt: d.marketDataAt, market, levels,
    indicators: d.indicators, candles: d.candles, marketContext: d.marketContext,
    technicalScore: d.technicalScore, finalScore: d.finalScore, threshold: d.dynamicThreshold,
    longScore: d.longScore, shortScore: d.shortScore, baselineDirection: d.direction,
    directionalEvidence: d.directionalEvidence, directionalRisk: d.directionalRisk, learningEvidence: d.learning,
    aiResult: d.aiResult, aiVision: d.aiVision, setupLabel: d.setupLabel, policyVersion: d.policyVersion,
    slMultiplier: d.slMultiplier, tpMultiplier: d.tpMultiplier, riskReduction: d.riskReduction,
    leverageOverride: d.leverageOverride, learningDecision: d.learningDecision,
    tf4h: d.tf4h, contributionTable: d.contributionTable, baselineBlockers: d.hardBlockers,
    operationalBlockers: operationalBlockers(d),
    volume24h: d.volume24h, priceChangePct: d.priceChangePct, openInterest: d.openInterest,
    riskDecision: d.riskDecision, portfolioCapacity: d.portfolioCapacity,
    balance: d.balance, availableBalance: d.availableBalance, openCount: d.openCount, openSymbols: d.openSymbols };
}
async function evaluate(d, { cfg = config(), fetchImpl = fetch, now = Date.now } = {}) {
  const id = requestId(d), started = now();
  const result = { id, symbol: d.symbol, mode: cfg.observe ? 'observe' : 'enforce', decision: 'NO_TRADE',
    proposedDecision: 'NO_TRADE', reason: null, marketDataAt: d.marketDataAt, expiresAt: d.marketDataAt + cfg.maxAgeMs };
  try {
    fresh(d.marketDataAt, now(), cfg.maxAgeMs);
    if (!adapterEnabled(cfg) && !cfg.apiKey) throw new Error('JEV_NOT_CONFIGURED');
    if (adapterEnabled(cfg) && !cfg.adapterToken) throw new Error('JEV_ADAPTER_NOT_CONFIGURED');
    const get = async url => {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
      if (!r.ok) throw new Error('JEV_MARKET_UNAVAILABLE');
      return r.json();
    };
    const [ticker, info] = await Promise.all([
      get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${d.symbol}`),
      get('https://fapi.binance.com/fapi/v1/exchangeInfo')
    ]);
    const symbol = info.symbols?.find(s => s.symbol === d.symbol && s.status === 'TRADING');
    const filter = symbol?.filters?.find(f => f.filterType === 'PRICE_FILTER');
    if (ticker.symbol !== d.symbol || !filter) throw new Error('JEV_SYMBOL_MISMATCH');
    const entry = Number(ticker.price);
    fresh(Number(ticker.time), now(), cfg.maxAgeMs);
    if (!positive(d.indicators?.currentPrice) || Math.abs(entry / d.indicators.currentPrice - 1) * 100 > cfg.maxDriftPct) throw new Error('JEV_PRICE_DRIFT');
    const levels = options(d, entry, filter);
    const state = stateFor(d, { entry, timestamp: ticker.time, priceFilter: filter }, levels);
    const questionId = `entry_${id}`;
    const request = { model: cfg.model, state, questions: { [questionId]: { type: 'choice',
      instructions: 'You own the entry decision and direction. Use only two entry gates: (1) EMA trend alignment for the selected side, and (2) momentum confirmation from RSI or volume. When both gates align and operational constraints permit, select LONG or SHORT; use NO_TRADE only when either gate is absent or the selected side fails an operational constraint. Other metrics are context, not strategic vetoes. Each trading option includes fixed numeric TP and SL. This is a proposal, not an executed order.',
      criteria: { NO_TRADE: 'Do not open a position.', LONG: levels.LONG, SHORT: levels.SHORT } } } };
    result.request = request;
    const response = await fetchImpl(adapterEnabled(cfg) ? `${cfg.adapterUrl}/v1/systemone` : ENDPOINT, { method: 'POST', headers: {
      authorization: `Bearer ${adapterEnabled(cfg) ? cfg.adapterToken : cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(cfg.timeoutMs) });
    if (!response.ok) throw new Error(adapterEnabled(cfg) ? 'JEV_ADAPTER_UNAVAILABLE' : 'JEV_API_UNAVAILABLE');
    const body = await response.json();
    fresh(d.marketDataAt, now(), cfg.maxAgeMs);
    if (now() - started > cfg.timeoutMs) throw new Error('JEV_TIMEOUT');
    const a = body.answers?.[questionId];
    const keys = ['NO_TRADE', 'LONG', 'SHORT'];
    if (typeof body.model !== 'string' || (!adapterEnabled(cfg) && !body.model.startsWith('jev-')) || a?.type !== 'choice' || !keys.includes(a.choice) ||
        !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1 ||
        Object.keys(a.probabilities || {}).sort().join() !== [...keys].sort().join() ||
        keys.some(k => !Number.isFinite(a.probabilities[k]) || a.probabilities[k] < 0 || a.probabilities[k] > 1) ||
        Math.abs(keys.reduce((sum,k) => sum + a.probabilities[k], 0) - 1) > 0.001 ||
        keys.some(k => a.probabilities[k] > a.probabilities[a.choice])) throw new Error('JEV_INVALID_RESPONSE');
    result.answer = { provider: cfg.provider, model: body.model, ...a };
    let choice = a.choice;
    const aggressive = process.env.JEV_AGGRESSIVE_ENTRY === 'true';
    const direction = ['LONG', 'SHORT'].includes(d.direction) ? d.direction : null;
    const contributions = Object.fromEntries((d.directionalEvidence?.[direction]?.contributions || []).map(item => [item.component, Number(item.value || 0)]));
    const twoGates = contributions.trend_1h > 0 && (contributions.momentum_rsi > 0 || contributions.volume_quality > 0);
    if (aggressive && choice === 'NO_TRADE' && direction && twoGates) {
      choice = direction;
      result.answer.aggressiveOverride = true;
    }
    result.proposedDecision = choice;
    if (choice === 'NO_TRADE') { result.reason = 'JEV_NO_TRADE'; return result; }
    result.proposal = { ...levels[choice], entry, priceFilter: filter };
    validateLevels(result.proposal, entry, filter);
    if (d.passRisk === false || d.riskDecision?.allowed === false || d.portfolioCapacity?.allowed === false) throw new Error('JEV_RISK_REJECTED');
    result.context = chosenContext(d, choice);
    result.decision = choice;
    result.reason = result.answer.aggressiveOverride ? 'JEV_AGGRESSIVE_TWO_GATE' : 'JEV_PROPOSAL_VALID';
    return result;
  } catch (error) {
    result.reason = /^JEV_[A-Z_]+$/.test(error.message) ? error.message : 'JEV_API_UNAVAILABLE';
    return result;
  }
}
module.exports = { config, fresh, options, validateLevels, requestId, evaluate };
