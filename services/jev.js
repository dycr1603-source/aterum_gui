'use strict';
const { createHash } = require('crypto');
const { chosenContext, operationalBlockers } = require('./jev_authority');
const { assessCapacity } = require('./jev_capacity');
const { evaluateLeverageChoices } = require('./jev_leverage_policy');
const { BinanceFutures } = require('../position-guard/binance');
const { intelligenceReference, marketContextForJev } = require('./intelligence_reference');
const entryQuality = require('./jev_entry_quality');
const simpleStrategy = require('./strategy/jev_policy');
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
function config(env = process.env) {
  const setting = (name, fallback, min, max) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error('JEV_INVALID_CONFIG');
    return n;
  };
  const provider = env.JEV_PROVIDER || 'typesafe-jev';
  if (!['typesafe-jev', 'typesafe-adapter'].includes(provider)) throw new Error('JEV_INVALID_PROVIDER');
  const maxLeverage = setting('JEV_MAX_LEVERAGE', 10, 1, 10);
  if (!Number.isInteger(maxLeverage)) throw new Error('JEV_INVALID_CONFIG');
  return { enabled: env.JEV_ENABLED === 'true', observe: env.JEV_OBSERVE_ONLY !== 'false',
    provider, apiKey: env.TYPESAFE_API_KEY, model: env.JEV_MODEL || 'jev-latest',
    dynamicLeverageEnabled: env.JEV_DYNAMIC_LEVERAGE_ENABLED === 'true' && provider === 'typesafe-jev',
    maxLeverage, entryQualityEnabled: env.JEV_ENTRY_QUALITY_ENABLED === 'true',
    binanceApiKey: env.BINANCE_API_KEY || '', binanceApiSecret: env.BINANCE_API_SECRET || '',
    adapterUrl: env.JEV_ADAPTER_URL || 'http://typesafe_adapter:8088', adapterToken: env.JEV_ADAPTER_TOKEN || '',
    capacityUrl: env.JEV_CAPACITY_URL || 'http://position_guard:3091/portfolio-capacity',
    executionToken: env.EXECUTION_ENGINE_TOKEN || '',
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
  const atr = Number(d.indicators?.atr), tick = Number(filter.tickSize);
  if (!positive(atr) || !positive(tick)) throw new Error('JEV_INVALID_LEVELS');
  const round = n => Number((Math.round(n / tick) * tick).toFixed(12));
  const candidates = {};
  for (const direction of ['LONG', 'SHORT']) {
    const sign = direction === 'LONG' ? 1 : -1;
    const make = (kind, multipliers) => Object.fromEntries(multipliers.map((multiplier, index) =>
      [`${kind}${index + 1}`, round(entry + sign * atr * multiplier * (kind === 'tp' ? 1 : -1))]));
    const sl = make('sl', [1, 1.5, 2]), tp = make('tp', [1.5, 2, 3]);
    for (const stop of Object.values(sl)) for (const target of Object.values(tp))
      validateLevels({ direction, sl: stop, tp: target }, entry, filter);
    if (new Set(Object.values(sl)).size !== 3 || new Set(Object.values(tp)).size !== 3) throw new Error('JEV_INVALID_LEVELS');
    candidates[direction] = { sl, tp };
  }
  return candidates;
}
function requestId(d) {
  if (!/^[\w-]{1,100}$/.test(d.opportunityCycleId || '') || !/^[A-Z0-9_]{3,24}$/.test(d.symbol || '')) throw new Error('JEV_INVALID_IDENTITY');
  return createHash('sha256').update(`jev-v3:${d.opportunityCycleId}:${d.symbol}`).digest('hex');
}
function stateFor(d, market, candidates) {
  return { schemaVersion: 'aterum-jev-v3', symbol: d.symbol, cycleId: d.opportunityCycleId,
    timeframe: d.timeframe || '1h',
    timestamp: d.marketDataAt, market, candidates, indicators: d.indicators, candles: d.candles,
    marketContext: marketContextForJev(d.marketContext), directionalEvidence: d.directionalEvidence,
    directionalRisk: d.directionalRisk, tf4h: d.tf4h, volume24h: d.volume24h,
    priceChangePct: d.priceChangePct, openInterest: d.openInterest,
    operationalBlockers: operationalBlockers(d), riskDecision: d.riskDecision,
    portfolioCapacity: d.portfolioCapacity };
}
function choiceAnswer(body, key, criteria) {
  const a = body.answers?.[key], keys = Object.keys(criteria);
  if (a?.type !== 'choice' || !keys.includes(a.choice) || !Number.isFinite(a.confidence) ||
      a.confidence < 0 || a.confidence > 1 || !a.probabilities ||
      Object.keys(a.probabilities).sort().join() !== [...keys].sort().join() ||
      keys.some(k => !Number.isFinite(a.probabilities[k]) || a.probabilities[k] < 0 || a.probabilities[k] > 1) ||
      Math.abs(keys.reduce((sum, k) => sum + a.probabilities[k], 0) - 1) > 0.001 ||
      keys.some(k => a.probabilities[k] > a.probabilities[a.choice])) throw new Error('JEV_INVALID_RESPONSE');
  return a;
}
async function evaluate(d, { cfg = config(), fetchImpl = fetch, now = Date.now } = {}) {
  const simple = d.strategy?.version === 'two-indicator-v1';
  const id = requestId(d);
  const result = { id, symbol: d.symbol, provider: cfg.provider, mode: cfg.observe ? 'observe' : 'enforce',
    decision: 'NO_TRADE', proposedDecision: 'NO_TRADE', reason: null,
    marketDataAt: d.marketDataAt, expiresAt: d.marketDataAt + cfg.maxAgeMs,
    intelligenceReference: intelligenceReference(d.marketContext?.intelligenceSignal),
    validations: { marketFresh: false, symbolTrading: false, candidatesValid: false,
      capacityChecked: false, riskAllowed: false } };
  try {
    fresh(d.marketDataAt, now(), cfg.maxAgeMs);
    result.validations.marketFresh = true;
    if (operationalBlockers(d).length || d.passRisk === false || d.riskDecision?.allowed === false ||
        d.portfolioCapacity?.allowed === false)
      throw new Error('JEV_RISK_REJECTED');
    if (!adapterEnabled(cfg) && !cfg.apiKey) throw new Error('JEV_NOT_CONFIGURED');
    if (adapterEnabled(cfg) && !cfg.adapterToken) throw new Error('JEV_ADAPTER_NOT_CONFIGURED');
    if (!cfg.executionToken) throw new Error('JEV_CAPACITY_UNAVAILABLE');
    let capacity;
    try {
      const response = await fetchImpl(cfg.capacityUrl, { headers: { authorization: `Bearer ${cfg.executionToken}` },
        signal: AbortSignal.timeout(cfg.timeoutMs) });
      if (!response.ok) throw new Error('capacity');
      capacity = await response.json();
      fresh(Date.parse(capacity.checkedAt), now(), cfg.maxAgeMs);
    } catch (_) { throw new Error('JEV_CAPACITY_UNAVAILABLE'); }
    result.validations.capacityChecked = true;
    const get = async url => {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
      if (!r.ok) throw new Error('JEV_MARKET_UNAVAILABLE');
      return r.json();
    };
    const [ticker, info] = await Promise.all([
      get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${d.symbol}`), get('https://fapi.binance.com/fapi/v1/exchangeInfo')
    ]);
    const symbol = info.symbols?.find(s => s.symbol === d.symbol && s.status === 'TRADING');
    const filter = symbol?.filters?.find(f => f.filterType === 'PRICE_FILTER');
    if (ticker.symbol !== d.symbol || !filter) throw new Error('JEV_SYMBOL_MISMATCH');
    result.validations.symbolTrading = true;
    const entry = Number(ticker.price);
    fresh(Number(ticker.time), now(), cfg.maxAgeMs);
    if (!positive(d.indicators?.currentPrice) || Math.abs(entry / d.indicators.currentPrice - 1) * 100 > cfg.maxDriftPct) throw new Error('JEV_PRICE_DRIFT');
    const candidates = simple ? simpleStrategy.levelOptions(d, entry, filter) : options(d, entry, filter);
    result.validations.candidatesValid = true;
    const preflight = simple ? simpleStrategy.preflight(d, entry, symbol, candidates, capacity) : assessCapacity(d, entry, symbol, candidates, capacity);
    result.preflight = { allowed: preflight.allowed, blockedSides: preflight.blockedSides,
      allowedSides: Object.keys(preflight.sides), metrics: preflight.metrics || null };
    if (!preflight.allowed) { result.reason = preflight.reason; return result; }
    if (!simple && cfg.entryQualityEnabled) {
      result.entryQuality = entryQuality.screen(d, capacity, entry);
      if (!result.entryQuality.allowed) { result.reason = result.entryQuality.reasons[0]; return result; }
      for (const side of result.entryQuality.blockedSides) delete preflight.sides[side];
      if (!Object.keys(preflight.sides).length) { result.reason = 'JEV_EXTENDED_ENTRY'; return result; }
    }
    let leverageMarket;
    if (simple || cfg.dynamicLeverageEnabled) {
      if (!cfg.binanceApiKey || !cfg.binanceApiSecret) throw new Error('JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE');
      const binance = new BinanceFutures({ apiKey: cfg.binanceApiKey, apiSecret: cfg.binanceApiSecret, fetchImpl });
      let rawBrackets, commission;
      try { [rawBrackets, commission] = await Promise.all([
        binance.leverageBracket(d.symbol), binance.commissionRate(d.symbol)
      ]); } catch (_) { throw new Error('JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE'); }
      const bracketRow = (Array.isArray(rawBrackets) ? rawBrackets : [rawBrackets]).find(row => row.symbol === d.symbol);
      const coefficient = Number(bracketRow?.notionalCoef || 1);
      leverageMarket = { brackets: bracketRow?.brackets?.map(row => ({ ...row,
        notionalFloor: Number(row.notionalFloor) * coefficient,
        notionalCap: Number(row.notionalCap) * coefficient })),
      feeRate: Number(commission?.takerCommissionRate) };
      if (!Number.isFinite(leverageMarket.feeRate) || leverageMarket.feeRate < 0 ||
          !Array.isArray(leverageMarket.brackets) || !leverageMarket.brackets.length)
        throw new Error('JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE');
    }
    const available = Object.fromEntries(Object.entries(preflight.sides).map(([side, sideOptions]) =>
      [side, { sl: sideOptions.sl, tp: sideOptions.tp }]));
    const market = { entry, timestamp: Number(ticker.time), priceFilter: filter };
    const state = simple ? simpleStrategy.state(d, market, available, capacity) : stateFor({ ...d, portfolioCapacity: capacity }, market, available);
    if (!simple && cfg.entryQualityEnabled) state.entryQuality = result.entryQuality;
    const prefix = `entry_${id}`;
    const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
    const directionCriteria = { NO_TRADE: 'Do not open a position.' };
    for (const side of Object.keys(available)) directionCriteria[side] = `Propose a ${side.toLowerCase()} position within the available account capacity.`;
    const referenceInstructions = state.marketContext?.intelligenceSignal
      ? ' Intelligence is a high-confidence deterministic heuristic reference, not a prior Jev decision or an operational veto. Assess it alongside the market evidence and decide independently.' : '';
    const questions = { [prefix]: choice('Decide independently whether to open no position, LONG, or SHORT from this market snapshot. NO_TRADE is fully valid. Only capacity-feasible sides are offered. Evaluate entry timing, exhaustion, volume and reversal risk, not just trend direction. Prefer NO_TRADE when a timely setup is unsupported. Scores and your option probabilities are not calibrated probabilities of profit; do not chase losses.' + referenceInstructions, directionCriteria) };
    if (simple) questions[`${prefix}_reason`] = choice('Choose the primary explanation for your decision. For NO_TRADE, explain missing edge, account exposure or uncertainty. This describes your choice and does not add another technical indicator.', {
      TREND_CONTINUATION: 'Trend continuation is the primary hypothesis for this opportunity.',
      BREAKOUT: 'The observed price structure supports a breakout hypothesis.',
      REVERSION: 'The observed price structure supports a mean-reversion hypothesis.',
      INSUFFICIENT_EDGE: 'The two signals do not offer enough expected net edge in this context.',
      EXPOSURE_RISK: 'Current positions or exposure make this opportunity unattractive.',
      UNCERTAIN_CONTEXT: 'The market context is too uncertain for a new position.'
    });
    if (simple) questions[`${prefix}_regime`] = choice('Classify current market context; this is explanatory context, not an additional technical veto.', Object.fromEntries(['TRENDING','RANGE','BREAKOUT','HIGH_VOLATILITY','UNCERTAIN'].map(r => [r,r])));
    for (const side of Object.keys(available)) {
      if (!simple && !cfg.dynamicLeverageEnabled) questions[`${prefix}_${side}_leverage`] = choice(`If ${side} is selected, choose among the account-feasible leverage values. No value is preferred.`,
        Object.fromEntries(preflight.sides[side].leverage.filter(n => n <= cfg.maxLeverage).map(n => [`x${n}`, `${n}x leverage`])));
      for (const kind of ['sl', 'tp'])
        questions[`${prefix}_${side}_${kind}`] = choice(`If ${side} is selected, choose one ${kind === 'sl' ? 'stop loss' : 'take profit'} candidate.`,
          Object.fromEntries(Object.entries(available[side][kind]).map(([key, price]) => [key, `${side} ${kind.toUpperCase()} price ${price}`])));
    }
    const request = { model: cfg.model, state, questions };
    result.request = request;
    const ask = async payload => {
      const modelStarted = now();
      const response = await fetchImpl(adapterEnabled(cfg) ? `${cfg.adapterUrl}/v1/systemone` : ENDPOINT, {
        method: 'POST', headers: { authorization: `Bearer ${adapterEnabled(cfg) ? cfg.adapterToken : cfg.apiKey}`,
          'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(cfg.timeoutMs) });
      if (!response.ok) throw new Error(adapterEnabled(cfg) ? 'JEV_ADAPTER_UNAVAILABLE' : 'JEV_API_UNAVAILABLE');
      const body = await response.json();
      fresh(d.marketDataAt, now(), cfg.maxAgeMs);
      if (now() - modelStarted > cfg.timeoutMs) throw new Error('JEV_TIMEOUT');
      if (typeof body.model !== 'string' || (!adapterEnabled(cfg) && !body.model.startsWith('jev-')))
        throw new Error('JEV_INVALID_RESPONSE');
      return body;
    };
    const body = await ask(request);
    const direction = choiceAnswer(body, prefix, questions[prefix].criteria);
    result.answer = { provider: cfg.provider, model: body.model, ...direction };
    result.model = body.model;
    if (simple) result.market_regime = choiceAnswer(body, `${prefix}_regime`, questions[`${prefix}_regime`].criteria).choice;
    result.usage = body.usage && { input_tokens: Number(body.usage.input_tokens || 0), output_tokens: Number(body.usage.output_tokens || 0) };
    result.proposedDecision = direction.choice;
    if (simple) {
      result.confidence = direction.confidence * 100;
      const reasonAnswer = choiceAnswer(body, `${prefix}_reason`, questions[`${prefix}_reason`].criteria);
      result.explanation = questions[`${prefix}_reason`].criteria[reasonAnswer.choice];
      result.explanationCode = reasonAnswer.choice;
    }
    if (direction.choice === 'NO_TRADE') { result.reason = 'JEV_NO_TRADE'; return result; }
    const stopAnswer = choiceAnswer(body, `${prefix}_${direction.choice}_sl`, questions[`${prefix}_${direction.choice}_sl`].criteria);
    const targetAnswer = choiceAnswer(body, `${prefix}_${direction.choice}_tp`, questions[`${prefix}_${direction.choice}_tp`].criteria);
    if (!simple && cfg.entryQualityEnabled) {
      result.entryQuality.selection = entryQuality.validateSelection(direction, entry,
        available[direction.choice].sl[stopAnswer.choice], available[direction.choice].tp[targetAnswer.choice],
        leverageMarket?.feeRate);
      if (!result.entryQuality.selection.allowed) { result.reason = result.entryQuality.selection.reasons[0]; return result; }
    }
    let leverageAnswer;
    if (simple || cfg.dynamicLeverageEnabled) {
      const policy = (simple ? simpleStrategy.projections : evaluateLeverageChoices)({ decision: direction, d, side: direction.choice, entry,
        stop: available[direction.choice].sl[stopAnswer.choice],
        target: available[direction.choice].tp[targetAnswer.choice], capacity, symbol,
        brackets: leverageMarket.brackets, feeRate: leverageMarket.feeRate, maxLeverage: cfg.maxLeverage });
      policy.allowedChoices = policy.allowedChoices.filter(n => preflight.sides[direction.choice].leverage.includes(n));
      result.leveragePolicy = policy;
      if (!policy.allowedChoices.length) { result.reason = 'JEV_NO_FEASIBLE_LEVERAGE'; return result; }
      const leverageKey = `${prefix}_${direction.choice}_leverage`;
      const leverageCriteria = Object.fromEntries(policy.allowedChoices.map(n => [`x${n}`, `${n}x leverage`]));
      const leverageRequest = { model: cfg.model,
        state: { ...state, selectedDirection: direction.choice, directionProbability: policy.metrics.probability,
          directionConfidence: policy.metrics.confidence, decisionMargin: policy.metrics.decisionMargin,
          selectedStop: available[direction.choice].sl[stopAnswer.choice],
          selectedTarget: available[direction.choice].tp[targetAnswer.choice],
          leveragePolicy: { allowedChoices: policy.allowedChoices, caps: policy.caps,
            metrics: policy.metrics } },
        questions: { [leverageKey]: choice('Choose leverage from these risk-approved values. Risk budget is fixed; leverage only changes required margin. No value is preferred.', leverageCriteria) } };
      result.leverageRequest = leverageRequest;
      const second = await ask(leverageRequest);
      if (second.model !== body.model) throw new Error('JEV_MODEL_CHANGED');
      leverageAnswer = choiceAnswer(second, leverageKey, leverageCriteria);
      result.usage = { input_tokens: Number(body.usage?.input_tokens || 0) + Number(second.usage?.input_tokens || 0),
        output_tokens: Number(body.usage?.output_tokens || 0) + Number(second.usage?.output_tokens || 0) };
      policy.selectedLeverage = Number(leverageAnswer.choice.slice(1));
      policy.selectedProjection = policy.projections[policy.selectedLeverage];
      delete policy.projections;
    } else {
      leverageAnswer = choiceAnswer(body, `${prefix}_${direction.choice}_leverage`, questions[`${prefix}_${direction.choice}_leverage`].criteria);
    }
    const leverage = Number(leverageAnswer.choice.slice(1));
    result.selections = { leverage: leverageAnswer, stop: stopAnswer, target: targetAnswer };
    result.proposal = { direction: direction.choice, leverage, entry,
      sl: available[direction.choice].sl[stopAnswer.choice], tp: available[direction.choice].tp[targetAnswer.choice],
      priceFilter: filter };
    validateLevels(result.proposal, entry, filter);
    result.context = simple ? { strategy: d.strategy, indicators: d.indicators, direction: direction.choice } : chosenContext(d, direction.choice);
    if (simple) {
      result.strategy = d.strategy;
      result.confidence = direction.confidence * 100;
      result.contextualRegime = d.strategy.regime;
      result.risk = result.leveragePolicy.selectedProjection;
      // Explanation is the model's validated reason choice, not an inferred win probability.
    }
    result.validations.riskAllowed = true;
    result.decision = direction.choice;
    result.reason = 'JEV_PROPOSAL_VALID';
    return result;
  } catch (error) {
    result.reason = /^JEV_[A-Z_]+$/.test(error.message) ? error.message
      : simple && ['INVALID_STRUCTURE', 'INVALID_LEVELS', 'INVALID_MARKET_DATA'].includes(error.message) ? `JEV_${error.message}` : 'JEV_API_UNAVAILABLE';
    return result;
  }
}
module.exports = { config, fresh, options, validateLevels, requestId, evaluate };
