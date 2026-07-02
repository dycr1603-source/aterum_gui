'use strict';

const crypto = require('crypto');
const shared = require('../shared');
const { computeLearningBias, number, clamp, round } = require('./learning_bias');

const DEFAULTS = Object.freeze({
  minQuoteVolume: Number(process.env.OPPORTUNITY_MIN_QUOTE_VOLUME || 5_000_000),
  minOpenInterest: Number(process.env.OPPORTUNITY_MIN_OPEN_INTEREST || 1_000_000),
  maxPriceChangePct: Number(process.env.OPPORTUNITY_MAX_PRICE_CHANGE_PCT || 45),
  refreshBatchSize: Number(process.env.OPPORTUNITY_REFRESH_BATCH_SIZE || 32),
  deepConcurrency: Number(process.env.OPPORTUNITY_DEEP_CONCURRENCY || 8),
  entryThreshold: Number(process.env.OPPORTUNITY_ENTRY_THRESHOLD || 65),
  maxCorrelation: Number(process.env.OPPORTUNITY_MAX_CORRELATION || 0.80),
  hotRevisitMinutes: Number(process.env.OPPORTUNITY_HOT_REVISIT_MINUTES || 30),
  warmRevisitMinutes: Number(process.env.OPPORTUNITY_WARM_REVISIT_MINUTES || 60),
  coldRevisitMinutes: Number(process.env.OPPORTUNITY_COLD_REVISIT_MINUTES || 180)
});

const EXCLUDED_SYMBOLS = new Set([
  'RIVERUSDT', 'XAGUSDT', 'XAUUSDT', 'OILUSDT',
  'NASDAQUSDT', 'LYNUSDT', 'BARDUSDT'
]);

function emaSeries(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * k + result[index - 1] * (1 - k));
  }
  return result;
}

function lastEma(values, period) {
  const series = emaSeries(values, period);
  return series[series.length - 1] || 0;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;
  let current = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    gain = ((gain * (period - 1)) + Math.max(delta, 0)) / period;
    loss = ((loss * (period - 1)) + Math.max(-delta, 0)) / period;
    current = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
  }
  return current;
}

function atr(highs, lows, closes, period = 14) {
  const values = [];
  for (let index = 1; index < highs.length; index += 1) {
    values.push(Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1])
    ));
  }
  if (!values.length) return 0;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0)
    / Math.min(period, values.length);
  for (let index = period; index < values.length; index += 1) {
    current = ((current * (period - 1)) + values[index]) / period;
  }
  return current;
}

function vwap(highs, lows, closes, volumes) {
  let total = 0;
  let volume = 0;
  for (let index = 0; index < closes.length; index += 1) {
    const typical = (highs[index] + lows[index] + closes[index]) / 3;
    total += typical * volumes[index];
    volume += volumes[index];
  }
  return volume > 0 ? total / volume : closes[closes.length - 1];
}

function returns(values) {
  const result = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > 0) result.push((values[index] - values[index - 1]) / values[index - 1]);
  }
  return result;
}

function correlation(left = [], right = []) {
  const size = Math.min(left.length, right.length);
  if (size < 10) return null;
  const a = left.slice(-size);
  const b = right.slice(-size);
  const meanA = a.reduce((sum, value) => sum + value, 0) / size;
  const meanB = b.reduce((sum, value) => sum + value, 0) / size;
  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < size; index += 1) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    numerator += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator > 0 ? numerator / denominator : null;
}

function exposureCorrelation(marketCorrelation, candidateDirection, openDirection) {
  if (marketCorrelation == null) return null;
  if (!openDirection) return Math.abs(marketCorrelation);
  const candidateSign = candidateDirection === 'SHORT' ? -1 : 1;
  const openSign = openDirection === 'SHORT' ? -1 : 1;
  return marketCorrelation * candidateSign * openSign;
}

function parseKlines(rows) {
  if (!Array.isArray(rows) || rows.length < 50) throw new Error('Klines insuficientes');
  return {
    closes: rows.map(row => number(row[4])),
    highs: rows.map(row => number(row[2])),
    lows: rows.map(row => number(row[3])),
    volumes: rows.map(row => number(row[5]))
  };
}

function addContribution(list, component, value, evidence, details = {}) {
  list.push({ component, value: round(value, 2), evidence, ...details });
}

function directionalScore(direction, snapshot) {
  const oneHour = parseKlines(snapshot.klines1h);
  const fourHour = parseKlines(snapshot.klines4h);
  const price = oneHour.closes[oneHour.closes.length - 1];
  const ema8 = lastEma(oneHour.closes, 8);
  const ema21 = lastEma(oneHour.closes, 21);
  const ema50 = lastEma(oneHour.closes, 50);
  const rsi14 = rsi(oneHour.closes, 14);
  const atrValue = atr(oneHour.highs, oneHour.lows, oneHour.closes, 14);
  const atrPct = price > 0 ? (atrValue / price) * 100 : 0;
  const currentVwap = vwap(oneHour.highs, oneHour.lows, oneHour.closes, oneHour.volumes);
  const vwapDistance = currentVwap > 0 ? ((price - currentVwap) / currentVwap) * 100 : 0;
  const averageVolume = oneHour.volumes.slice(-21, -1).reduce((sum, value) => sum + value, 0) / 20;
  const currentVolume = oneHour.volumes[oneHour.volumes.length - 2] || oneHour.volumes[oneHour.volumes.length - 1];
  const volumeRatio = averageVolume > 0 ? currentVolume / averageVolume : 1;
  const ema8_4h = lastEma(fourHour.closes, 8);
  const ema21_4h = lastEma(fourHour.closes, 21);
  const ema50_4h = lastEma(fourHour.closes, 50);
  const trend4h = ema8_4h > ema21_4h && ema21_4h > ema50_4h
    ? 'LONG'
    : ema8_4h < ema21_4h && ema21_4h < ema50_4h ? 'SHORT' : 'NEUTRAL';
  const contributions = [];
  addContribution(contributions, 'base', 15, 'Escala común del score');

  const long = direction === 'LONG';
  let trend = 0;
  if ((long && ema8 > ema21) || (!long && ema8 < ema21)) trend += 10;
  if ((long && ema21 > ema50) || (!long && ema21 < ema50)) trend += 10;
  const spread = ema50 > 0 ? Math.abs(ema8 - ema50) / ema50 * 100 : 0;
  if (spread >= 0.25 && ((long && ema8 > ema50) || (!long && ema8 < ema50))) trend += 5;
  addContribution(contributions, 'trend_1h', trend, 'EMA 8/21/50', { current: round(spread), maximum: 25 });

  let momentum = 0;
  if (long) {
    if (rsi14 >= 52 && rsi14 <= 68) momentum = 15;
    else if (rsi14 >= 45 && rsi14 < 52) momentum = 7;
    else if (rsi14 > 68 && rsi14 <= 78) momentum = 5;
    else if (rsi14 > 82) momentum = -10;
    else if (rsi14 < 35) momentum = -5;
  } else if (rsi14 >= 32 && rsi14 <= 48) momentum = 15;
  else if (rsi14 > 48 && rsi14 <= 55) momentum = 7;
  else if (rsi14 >= 22 && rsi14 < 32) momentum = 5;
  else if (rsi14 < 18) momentum = -10;
  else if (rsi14 > 65) momentum = -5;
  addContribution(contributions, 'momentum_rsi', momentum, 'RSI 14', { current: round(rsi14), maximum: 15 });

  let structure = 0;
  const directionalDistance = long ? vwapDistance : -vwapDistance;
  if (directionalDistance >= 0.1 && directionalDistance <= 3) structure = 10;
  else if (directionalDistance > 3 && directionalDistance <= 5) structure = 3;
  else if (directionalDistance < -1) structure = -5;
  addContribution(contributions, 'vwap_structure', structure, 'Distancia al VWAP', { current: round(vwapDistance), maximum: 10 });

  let volume = 0;
  if (volumeRatio >= 1.2 && volumeRatio <= 3) volume = 10;
  else if (volumeRatio >= 0.8 && volumeRatio < 1.2) volume = 4;
  else if (volumeRatio > 4) volume = -8;
  else if (volumeRatio < 0.6) volume = -5;
  addContribution(contributions, 'volume_quality', volume, 'Volumen de vela cerrada / promedio 20', { current: round(volumeRatio), maximum: 10 });

  const higherTimeframe = trend4h === direction ? 15 : trend4h === 'NEUTRAL' ? 0 : -15;
  addContribution(contributions, 'trend_4h', higherTimeframe, 'EMA 8/21/50 4H', { current: trend4h, maximum: 15 });

  let volatility = 0;
  if (atrPct >= 0.5 && atrPct <= 3) volatility = 5;
  else if (atrPct > 5) volatility = -8;
  else if (atrPct < 0.3) volatility = -5;
  addContribution(contributions, 'volatility_quality', volatility, 'ATR porcentual', { current: round(atrPct), maximum: 5 });

  const fundingRate = number(snapshot.funding?.lastFundingRate);
  let funding = 0;
  if (fundingRate >= 0.0005) funding = long ? -3 : 5;
  else if (fundingRate <= -0.0005) funding = long ? 5 : -3;
  addContribution(contributions, 'funding', funding, 'Funding contrarian', { current: round(fundingRate, 8), maximum: 5 });

  const quoteVolume = number(snapshot.ticker?.quoteVolume);
  const liquidity = quoteVolume >= 500_000_000 ? 5 : quoteVolume >= 100_000_000 ? 3 : 1;
  addContribution(contributions, 'liquidity', liquidity, 'Volumen quote 24H', { current: round(quoteVolume, 0), maximum: 5 });

  const openInterest = number(snapshot.openInterest?.openInterest) * price;
  const oiQuality = openInterest >= 100_000_000 ? 5 : openInterest >= 10_000_000 ? 3 : openInterest >= 1_000_000 ? 1 : -5;
  addContribution(contributions, 'open_interest', oiQuality, 'Open interest nocional', { current: round(openInterest, 0), maximum: 5 });

  const macroDelta = clamp(number(snapshot.marketContext?.scoreAdjustment?.[direction.toLowerCase()]), -8, 8);
  addContribution(contributions, 'macro', macroDelta, 'Contexto determinista BTC/ETH/F&G', { maximum: 8 });
  const intelRaw = direction === 'LONG'
    ? number(snapshot.marketContext?.intelligenceSignal?.scoreAdjustment?.ifLong)
    : number(snapshot.marketContext?.intelligenceSignal?.scoreAdjustment?.ifShort);
  const intelConfidence = snapshot.marketContext?.intelligenceSignal?.confidence;
  const intelDelta = clamp(intelConfidence === 'alta' ? intelRaw : intelConfidence === 'media' ? intelRaw * 0.5 : 0, -5, 5);
  addContribution(contributions, 'intelligence', intelDelta, 'Noticias y sesión; confianza requerida', { maximum: 5 });

  const score = clamp(contributions.reduce((sum, item) => sum + number(item.value), 0), 0, 100);
  return {
    direction,
    score: round(score, 2),
    contributions,
    indicators: {
      ema8: round(ema8, 8), ema21: round(ema21, 8), ema50: round(ema50, 8),
      rsi14: round(rsi14), atr: round(atrValue, 8), atrPct: round(atrPct),
      vwap: round(currentVwap, 8), volRatio: round(volumeRatio),
      fundingRate: round(fundingRate, 8), currentPrice: round(price, 8),
      currentOI: round(openInterest, 0)
    },
    tf4h: {
      trend: trend4h,
      status: trend4h === direction ? 'CONFIRMS' : trend4h === 'NEUTRAL' ? 'NEUTRAL' : 'CONTRADICTS',
      ema8: round(ema8_4h, 8), ema21: round(ema21_4h, 8), ema50: round(ema50_4h, 8),
      rsi: round(rsi(fourHour.closes, 14)), price: round(fourHour.closes[fourHour.closes.length - 1], 8)
    },
    returns: returns(oneHour.closes.slice(-50)),
    candles: {
      closes: oneHour.closes.slice(-5), highs: oneHour.highs.slice(-5),
      lows: oneHour.lows.slice(-5), volumes: oneHour.volumes.slice(-5)
    }
  };
}

function scoreSnapshot(snapshot, config = DEFAULTS) {
  const long = directionalScore('LONG', snapshot);
  const short = directionalScore('SHORT', snapshot);
  const winner = long.score >= short.score ? long : short;
  const loser = winner === long ? short : long;
  const separation = winner.score - loser.score;
  const direction = winner.score >= number(config.entryThreshold, DEFAULTS.entryThreshold) && separation >= 6
    ? winner.direction
    : 'NEUTRAL';
  return {
    ...winner,
    direction,
    longScore: long.score,
    shortScore: short.score,
    separation: round(separation),
    technicalBlockers: direction === 'NEUTRAL' ? [{
      code: winner.score < number(config.entryThreshold, DEFAULTS.entryThreshold) ? 'TECHNICAL_SCORE' : 'DIRECTION_AMBIGUOUS',
      current: winner.score < number(config.entryThreshold, DEFAULTS.entryThreshold) ? winner.score : separation,
      minimum: winner.score < number(config.entryThreshold, DEFAULTS.entryThreshold)
        ? number(config.entryThreshold, DEFAULTS.entryThreshold) : 6,
      margin: round(winner.score < number(config.entryThreshold, DEFAULTS.entryThreshold)
        ? winner.score - number(config.entryThreshold, DEFAULTS.entryThreshold) : separation - 6)
    }] : []
  };
}

function revisitMinutes(ticker, config = DEFAULTS) {
  const change = Math.abs(number(ticker.priceChangePercent));
  const volume = number(ticker.quoteVolume);
  if (change >= 5 || volume >= 500_000_000) return number(config.hotRevisitMinutes, DEFAULTS.hotRevisitMinutes);
  if (change >= 2 || volume >= 100_000_000) return number(config.warmRevisitMinutes, DEFAULTS.warmRevisitMinutes);
  return number(config.coldRevisitMinutes, DEFAULTS.coldRevisitMinutes);
}

function buildUniverse(exchangeInfo, tickers, states = new Map(), now = Date.now(), config = DEFAULTS) {
  const tickerMap = new Map((tickers || []).map(ticker => [ticker.symbol, ticker]));
  const allTradable = (exchangeInfo?.symbols || []).filter(contract =>
    contract.status === 'TRADING'
    && contract.contractType === 'PERPETUAL'
    && contract.quoteAsset === 'USDT'
    && contract.underlyingType === 'COIN'
    && !EXCLUDED_SYMBOLS.has(contract.symbol)
  );
  return allTradable.map(contract => {
    const ticker = tickerMap.get(contract.symbol) || {};
    const quoteVolume = number(ticker.quoteVolume);
    const change = Math.abs(number(ticker.priceChangePercent));
    const state = states.get(contract.symbol) || {};
    const lastScan = state.last_deep_scan_at ? new Date(state.last_deep_scan_at).getTime() : 0;
    const revisit = revisitMinutes(ticker, config);
    const ageMinutes = lastScan ? Math.max(0, (now - lastScan) / 60000) : Number.POSITIVE_INFINITY;
    const eligible = quoteVolume >= number(config.minQuoteVolume, DEFAULTS.minQuoteVolume)
      && change <= number(config.maxPriceChangePct, DEFAULTS.maxPriceChangePct);
    const liquidity = clamp(Math.log10(Math.max(quoteVolume, 1)) - 6, 0, 4) / 4;
    const movement = clamp(change / 10, 0, 1);
    const coarseScore = round((liquidity * 60) + (movement * 40), 2);
    const due = !lastScan || ageMinutes >= revisit;
    const freshness = lastScan ? clamp(ageMinutes / revisit, 0, 4) : 10;
    const priority = round((due ? 100 : 0) + freshness * 25 + coarseScore * 0.35 + number(state.consecutive_skips) * 2, 2);
    return {
      symbol: contract.symbol,
      contract,
      ticker,
      eligible,
      quoteVolume,
      priceChangePct: number(ticker.priceChangePercent),
      coarseScore,
      due,
      ageMinutes: Number.isFinite(ageMinutes) ? round(ageMinutes, 1) : null,
      revisitMinutes: revisit,
      priority,
      firstScan: !lastScan
    };
  });
}

function selectRefreshBatch(universe, config = DEFAULTS) {
  const eligible = universe.filter(item => item.eligible);
  const never = eligible.filter(item => item.firstScan).sort((a, b) => b.coarseScore - a.coarseScore);
  const due = eligible.filter(item => !item.firstScan && item.due).sort((a, b) => b.priority - a.priority);
  const batchSize = number(config.refreshBatchSize, DEFAULTS.refreshBatchSize);
  const fairnessSlots = Math.max(1, Math.floor(batchSize * 0.75));
  const selected = never.slice(0, fairnessSlots);
  const ids = new Set(selected.map(item => item.symbol));
  for (const item of due) {
    if (selected.length >= batchSize) break;
    if (!ids.has(item.symbol)) {
      selected.push(item);
      ids.add(item.symbol);
    }
  }
  for (const item of never.slice(fairnessSlots)) {
    if (selected.length >= batchSize) break;
    if (!ids.has(item.symbol)) {
      selected.push(item);
      ids.add(item.symbol);
    }
  }
  return selected;
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function ensureTables() {
  await shared.db.execute(`CREATE TABLE IF NOT EXISTS market_scan_cycles (
    id CHAR(36) PRIMARY KEY,
    universe_size INT NOT NULL,
    eligible_size INT NOT NULL,
    refreshed_size INT NOT NULL DEFAULT 0,
    candidate_size INT NOT NULL DEFAULT 0,
    selected_symbol VARCHAR(24) NULL,
    duration_ms INT NULL,
    config JSON NULL,
    started_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,
    INDEX idx_market_scan_cycles_started (started_at)
  )`);
  await shared.db.execute(`CREATE TABLE IF NOT EXISTS market_symbol_state (
    symbol VARCHAR(24) PRIMARY KEY,
    first_seen_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    last_deep_scan_at DATETIME NULL,
    next_scan_at DATETIME NULL,
    last_score DECIMAL(8,3) NULL,
    last_direction VARCHAR(12) NULL,
    last_rank INT NULL,
    heat_score DECIMAL(8,3) NULL,
    consecutive_skips INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_market_symbol_next_scan (next_scan_at),
    INDEX idx_market_symbol_last_scan (last_deep_scan_at)
  )`);
  await shared.db.execute(`CREATE TABLE IF NOT EXISTS market_opportunities (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cycle_id CHAR(36) NOT NULL,
    symbol VARCHAR(24) NOT NULL,
    direction VARCHAR(12) NOT NULL,
    coarse_score DECIMAL(8,3) NULL,
    technical_score DECIMAL(8,3) NULL,
    learning_delta DECIMAL(8,3) NULL,
    final_score DECIMAL(8,3) NULL,
    threshold DECIMAL(8,3) NULL,
    rank_position INT NULL,
    selected TINYINT(1) NOT NULL DEFAULT 0,
    primary_reason VARCHAR(255) NULL,
    contributions JSON NULL,
    blockers JSON NULL,
    metrics JSON NULL,
    evaluated_at DATETIME(3) NOT NULL,
    INDEX idx_market_opportunity_cycle (cycle_id, rank_position),
    INDEX idx_market_opportunity_symbol (symbol, evaluated_at),
    INDEX idx_market_opportunity_selected (selected, evaluated_at)
  )`);
}

async function loadStates() {
  const [rows] = await shared.db.execute('SELECT * FROM market_symbol_state');
  return new Map((rows || []).map(row => [row.symbol, row]));
}

async function loadLearningContext(candidates, config = {}) {
  if (!candidates.length) return candidates;
  const symbols = [...new Set(candidates.map(candidate => candidate.symbol))];
  const placeholders = symbols.map(() => '?').join(',');
  const [rules] = await shared.db.execute(`SELECT * FROM learning_rules
    WHERE status='active' AND expires_at>NOW() AND (
      rule_type NOT IN ('symbol','combination') OR
      (rule_type='symbol' AND rule_key IN (${placeholders})) OR
      (rule_type='combination' AND ${symbols.map(() => 'rule_key LIKE ?').join(' OR ')})
    )`, [...symbols, ...symbols.map(symbol => `${symbol} ::%`)]);
  const learningConfig = {
    ...config,
    soft_min_sample: config.softMinSample || 8,
    hard_min_sample: config.hardMinSample || 20,
    learning_component_delta_cap: config.learningComponentDeltaCap || 3,
    learning_delta_cap: config.learningDeltaCap || 8,
    block_expectancy_max: config.blockExpectancyMax || -0.75
  };
  return candidates.map(candidate => {
    const setup = `${candidate.regime || 'N/A'} / ${candidate.tf4h?.status || 'N/A'} / ${candidate.marketBias || 'NEUTRAL'}`.toUpperCase();
    const session = candidate.session || hourBucket();
    const band = candidate.technicalScore >= 100 ? '100' : `${Math.floor(candidate.technicalScore / 10) * 10}-${Math.floor(candidate.technicalScore / 10) * 10 + 9}`;
    const combination = `${candidate.symbol} :: ${setup} :: ${session}`;
    const matched = (rules || []).filter(rule =>
      (rule.rule_type === 'symbol' && rule.rule_key === candidate.symbol)
      || (rule.rule_type === 'setup' && rule.rule_key === setup)
      || (rule.rule_type === 'session' && rule.rule_key === session)
      || (rule.rule_type === 'regime' && rule.rule_key === candidate.regime)
      || (rule.rule_type === 'score_band' && rule.rule_key === band)
      || (rule.rule_type === 'combination' && rule.rule_key === combination)
    );
    const learning = computeLearningBias(matched, { symbol: candidate.symbol, setup, session, regime: candidate.regime, band }, learningConfig);
    return {
      ...candidate,
      setupLabel: setup,
      learning,
      learningDelta: learning.totalDelta,
      finalScore: round(clamp(candidate.technicalScore + learning.totalDelta, 0, 100), 2),
      hardBlockers: [...candidate.hardBlockers, ...learning.blockers]
    };
  });
}

function hourBucket(date = new Date()) {
  const hour = date.getUTCHours();
  const start = Math.floor(hour / 4) * 4;
  return `${String(start).padStart(2, '0')}-${String(start + 4).padStart(2, '0')}`;
}

async function fetchSnapshot(item, marketContext, config) {
  const symbol = encodeURIComponent(item.symbol);
  try {
    const [klines1h, klines4h, funding, openInterest] = await Promise.all([
      fetchJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=100`),
      fetchJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=60`),
      fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
      fetchJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`)
    ]);
    const scored = scoreSnapshot({ klines1h, klines4h, funding, openInterest, ticker: item.ticker, marketContext }, config);
    const openInterestNotional = number(openInterest.openInterest) * number(item.ticker.lastPrice);
    const liquidityBlock = openInterestNotional < number(config.minOpenInterest, DEFAULTS.minOpenInterest)
      ? [{ code: 'OPEN_INTEREST_TOO_LOW', current: round(openInterestNotional, 0), minimum: number(config.minOpenInterest, DEFAULTS.minOpenInterest), margin: round(openInterestNotional - number(config.minOpenInterest, DEFAULTS.minOpenInterest), 0) }]
      : [];
    return {
      symbol: item.symbol,
      scanScore: item.coarseScore,
      volume24h: item.quoteVolume,
      priceChangePct: item.priceChangePct,
      openInterest: openInterestNotional,
      score: scored.score,
      technicalScore: scored.score,
      direction: scored.direction,
      longScore: scored.longScore,
      shortScore: scored.shortScore,
      contributions: scored.contributions,
      indicators: scored.indicators,
      tf4h: scored.tf4h,
      returns: scored.returns,
      candles: scored.candles,
      regime: scored.indicators.atrPct > 3
        ? 'HIGH_VOLATILITY'
        : number(scored.contributions.find(item => item.component === 'trend_1h')?.value) <= 10 ? 'RANGING' : 'TRENDING',
      marketBias: marketContext?.market_bias || 'NEUTRAL',
      session: hourBucket(),
      revisitMinutes: item.revisitMinutes,
      hardBlockers: [...scored.technicalBlockers, ...liquidityBlock],
      error: null
    };
  } catch (error) {
    return {
      symbol: item.symbol,
      scanScore: item.coarseScore,
      direction: 'NEUTRAL',
      technicalScore: 0,
      finalScore: 0,
      contributions: [],
      hardBlockers: [{ code: 'MARKET_DATA_UNAVAILABLE', reason: error.message }],
      error: error.message,
      revisitMinutes: item.revisitMinutes
    };
  }
}

async function fetchOpenPositionReturns(symbols) {
  const unique = [...new Set((symbols || []).map(String).map(value => value.toUpperCase()))];
  const rows = await mapConcurrent(unique, 5, async symbol => {
    try {
      const klines = await fetchJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=50`);
      return [symbol, returns(parseKlines(klines).closes)];
    } catch (_) {
      return [symbol, null];
    }
  });
  return new Map(rows);
}

async function loadCooldowns() {
  const now = Date.now();
  return new Map(Object.entries(shared.symbolCooldowns || {}).flatMap(([symbol, raw]) => {
    const expiresAt = typeof raw === 'number' ? raw : number(raw?.expiresAt);
    if (!expiresAt || expiresAt <= now) return [];
    return [[symbol, { expires_at: new Date(expiresAt).toISOString(), reason: raw?.reason || null }]];
  }));
}

async function scanAndSelect(input = {}) {
  const started = Date.now();
  const cycleId = crypto.randomUUID();
  const config = { ...DEFAULTS, ...(input.config || {}) };
  const openSymbols = new Set((input.openSymbols || []).map(String).map(value => value.toUpperCase()));
  const openDirections = new Map((input.openPositions || []).map(position => [
    String(position.symbol || '').toUpperCase(),
    String(position.direction || position.side || '').toUpperCase()
  ]));
  const openCount = number(input.openCount, openSymbols.size);
  const portfolioCapacity = input.portfolioCapacity || { allowed: true, capacity: { dynamicAdditionalPositions: null } };
  await ensureTables();
  const [exchangeInfo, tickers, states, cooldowns] = await Promise.all([
    fetchJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),
    fetchJson('https://fapi.binance.com/fapi/v1/ticker/24hr'),
    loadStates(),
    loadCooldowns()
  ]);
  const universe = buildUniverse(exchangeInfo, tickers, states, Date.now(), config);
  const eligible = universe.filter(item => item.eligible);
  const refreshBatch = selectRefreshBatch(universe, config);
  await shared.db.execute(`INSERT INTO market_scan_cycles
    (id,universe_size,eligible_size,refreshed_size,candidate_size,config,started_at)
    VALUES (?,?,?,?,?,?,NOW(3))`, [cycleId, universe.length, eligible.length, refreshBatch.length, 0, JSON.stringify(config)]);

  if (universe.length) {
    await shared.db.query(`INSERT INTO market_symbol_state
      (symbol,first_seen_at,last_seen_at,heat_score,consecutive_skips)
      VALUES ?
      ON DUPLICATE KEY UPDATE last_seen_at=NOW(),heat_score=VALUES(heat_score),
        consecutive_skips=IF(last_deep_scan_at IS NULL OR last_deep_scan_at<NOW()-INTERVAL 15 MINUTE,consecutive_skips+1,consecutive_skips)`,
    [universe.map(item => [item.symbol, new Date(), new Date(), item.coarseScore, item.due ? 1 : 0])]);
  }

  const deep = (await mapConcurrent(refreshBatch, number(config.deepConcurrency, DEFAULTS.deepConcurrency),
    item => fetchSnapshot(item, input.marketContext || {}, config))).filter(Boolean);
  const enriched = await loadLearningContext(deep, config);
  const capacityAvailable = portfolioCapacity.allowed !== false;
  const openReturns = await fetchOpenPositionReturns([...openSymbols]);
  const candidates = enriched.map(candidate => {
    const blockers = [...candidate.hardBlockers];
    if (openSymbols.has(candidate.symbol)) blockers.push({ code: 'POSITION_ALREADY_OPEN', current: candidate.symbol });
    if (cooldowns.has(candidate.symbol)) {
      const cooldown = cooldowns.get(candidate.symbol);
      blockers.push({ code: 'SYMBOL_COOLDOWN', current: cooldown.expires_at, reason: cooldown.reason || null });
    }
    for (const [openSymbol, positionReturns] of openReturns) {
      if (!positionReturns) continue;
      const currentCorrelation = correlation(candidate.returns, positionReturns);
      const openDirection = openDirections.get(openSymbol);
      const currentExposureCorrelation = exposureCorrelation(currentCorrelation, candidate.direction, openDirection);
      if (currentExposureCorrelation != null && currentExposureCorrelation > number(config.maxCorrelation, DEFAULTS.maxCorrelation)) {
        blockers.push({
          code: 'PORTFOLIO_CORRELATION',
          symbol: openSymbol,
          current: round(currentExposureCorrelation, 3),
          marketCorrelation: round(currentCorrelation, 3),
          candidateDirection: candidate.direction,
          openDirection: openDirection || null,
          maximum: number(config.maxCorrelation, DEFAULTS.maxCorrelation),
          exceeded: round(currentExposureCorrelation - number(config.maxCorrelation, DEFAULTS.maxCorrelation), 3)
        });
      }
    }
    if (!capacityAvailable) blockers.push({ code: 'PORTFOLIO_CAPACITY_FULL',
      current: { openCount, riskPct: portfolioCapacity.risk?.openRiskPct,
        marginUsagePct: portfolioCapacity.account?.marginUsagePct },
      maximum: { riskPct: portfolioCapacity.risk?.maximumRiskPct,
        marginUsagePct: portfolioCapacity.limits?.maxMarginUsagePct },
      reason: portfolioCapacity.primaryReason?.code || 'No capital/risk capacity remains' });
    return { ...candidate, hardBlockers: blockers };
  });

  const ranked = [...candidates].sort((a, b) => b.finalScore - a.finalScore || b.scanScore - a.scanScore);
  ranked.forEach((candidate, index) => { candidate.rank = index + 1; });
  let selected = null;
  if (capacityAvailable) {
    selected = ranked.find(candidate => candidate.finalScore >= number(config.entryThreshold, DEFAULTS.entryThreshold)
      && candidate.direction !== 'NEUTRAL' && candidate.hardBlockers.length === 0) || null;
  }

  for (const candidate of ranked) {
    const primary = candidate === selected
      ? 'SELECTED_TOP_RANKED'
      : candidate.hardBlockers[0]?.code || (candidate.finalScore < config.entryThreshold ? 'SCORE_BELOW_THRESHOLD' : 'LOWER_PORTFOLIO_RANK');
    await shared.db.execute(`INSERT INTO market_opportunities
      (cycle_id,symbol,direction,coarse_score,technical_score,learning_delta,final_score,threshold,rank_position,selected,primary_reason,contributions,blockers,metrics,evaluated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3))`, [
      cycleId, candidate.symbol, candidate.direction, candidate.scanScore, candidate.technicalScore,
      candidate.learningDelta, candidate.finalScore, config.entryThreshold, candidate.rank, candidate === selected ? 1 : 0,
      primary, JSON.stringify([...candidate.contributions, ...candidate.learning.contributions]),
      JSON.stringify(candidate.hardBlockers), JSON.stringify({ indicators: candidate.indicators, tf4h: candidate.tf4h, setup: candidate.setupLabel })
    ]);
    await shared.db.execute(`UPDATE market_symbol_state SET
      last_deep_scan_at=NOW(),next_scan_at=DATE_ADD(NOW(),INTERVAL ? MINUTE),last_score=?,last_direction=?,last_rank=?,consecutive_skips=0
      WHERE symbol=?`, [candidate.revisitMinutes, candidate.finalScore, candidate.direction, candidate.rank, candidate.symbol]);
  }

  const durationMs = Date.now() - started;
  await shared.db.execute(`UPDATE market_scan_cycles SET candidate_size=?,selected_symbol=?,duration_ms=?,completed_at=NOW(3) WHERE id=?`,
    [ranked.length, selected?.symbol || null, durationMs, cycleId]);

  const publicCandidate = candidate => candidate ? {
    ...candidate,
    threshold: config.entryThreshold,
    decisionMargin: round(candidate.finalScore - config.entryThreshold),
    contributionTable: [...candidate.contributions, ...candidate.learning.contributions],
    primaryReason: candidate === selected ? 'Highest ranked eligible opportunity' : candidate.hardBlockers[0]?.code || 'Lower rank'
  } : null;
  return {
    cycleId,
    universe: { total: universe.length, eligible: eligible.length, refreshed: refreshBatch.length, candidates: ranked.length },
    scheduler: {
      neverScannedRemaining: eligible.filter(item => item.firstScan && !refreshBatch.some(row => row.symbol === item.symbol)).length,
      batchSymbols: refreshBatch.map(item => item.symbol),
      coveragePct: eligible.length ? round((eligible.filter(item =>
        states.get(item.symbol)?.last_deep_scan_at || refreshBatch.some(row => row.symbol === item.symbol)
      ).length / eligible.length) * 100, 1) : 0
    },
    selected: publicCandidate(selected),
    ranking: ranked.slice(0, 10).map(publicCandidate),
    durationMs,
    portfolioCapacity: { allowed: capacityAvailable,
      dynamicAdditionalPositions: portfolioCapacity.capacity?.dynamicAdditionalPositions ?? null,
      remainingRiskPct: portfolioCapacity.risk?.remainingRiskPct ?? null,
      remainingMargin: portfolioCapacity.capacity?.remainingMargin ?? null },
    config: { entryThreshold: config.entryThreshold, maxCorrelation: config.maxCorrelation }
  };
}

module.exports = {
  DEFAULTS,
  emaSeries,
  rsi,
  atr,
  vwap,
  returns,
  correlation,
  exposureCorrelation,
  directionalScore,
  scoreSnapshot,
  buildUniverse,
  selectRefreshBatch,
  revisitMinutes,
  ensureTables,
  scanAndSelect
};
