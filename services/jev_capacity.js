'use strict';

// Mirrors the active Position Sizer's monetary and efficiency limits. The
// executor remains authoritative and rechecks Binance/account state before an order.
const number = value => Number(value);
const finite = value => Number.isFinite(number(value));
function filtersFor(symbol) {
  const filters = symbol?.filters || [];
  const lot = filters.find(f => f.filterType === 'LOT_SIZE');
  const market = filters.find(f => f.filterType === 'MARKET_LOT_SIZE');
  const notional = filters.find(f => ['MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType));
  const maxima = [number(lot?.maxQty), number(market?.maxQty)].filter(v => Number.isFinite(v) && v > 0);
  return { minQty: Math.max(number(lot?.minQty || 0), number(market?.minQty || 0)),
    maxQty: maxima.length ? Math.min(...maxima) : Infinity,
    step: number(market?.stepSize || 0) || number(lot?.stepSize || 0),
    lotStep: number(lot?.stepSize || 0),
    minNotional: number(notional?.notional || notional?.minNotional || 0) };
}
function requestedRisk(d, side) {
  const score = number(d.directionalEvidence?.[side]?.score);
  if (!Number.isFinite(score)) return null;
  const scoreMultiplier = score >= 80 ? 1.5 : score >= 70 ? 1.25 : score >= 60 ? 1 : score >= 55 ? .7 : .5;
  const marketState = d.aiVision?.market_state || 'UNKNOWN';
  const visionMultiplier = marketState === 'EARLY_TREND' ? 1.3 : marketState === 'MID_TREND' ? 1.1
    : marketState === 'LATE_TREND' ? .6 : marketState === 'PARABOLIC' ? .3 : 1;
  const regime = d.regime || d.aiResult?.regime || 'TRENDING';
  const regimeMultiplier = regime === 'TRENDING' ? 1.1 : regime === 'RANGING' ? .8 : regime === 'HIGH_VOLATILITY' ? .7 : 1;
  const tf4h = d.directionalEvidence?.[side]?.tf4h?.status || d.tf4h?.status;
  const tf4hMultiplier = tf4h === 'CONFIRMS' ? 1.1 : tf4h === 'NEUTRAL' ? .95 : tf4h === 'CONTRADICTS' ? .6 : 1;
  const macro = number(d.marketContext?.size_multiplier || 1);
  const reduction = number(d.riskReduction || 0);
  if (!Number.isFinite(macro) || !Number.isFinite(reduction)) return null;
  const effective = Math.min(.05, Math.max(.005, .02 * scoreMultiplier * visionMultiplier * regimeMultiplier
    * tf4hMultiplier * macro * (1 - reduction)));
  const balance = number(d.balance);
  if (!(balance > 0)) return null;
  const threshold = number(d.dynamicThreshold ?? 65);
  const margin = Math.max(0, score - threshold);
  const minimumRealization = Math.max(.05, .2 - Math.min(.1, margin / 350));
  return { amount: balance * effective, minimumRealization, balance };
}
function projectPair(d, side, entry, stop, leverage, capacity, filters, budget) {
  const distance = Math.abs(entry - stop);
  if (!(distance > 0) || !Number.isInteger(leverage) || leverage < 1 || leverage > 10) return null;
  const perUnitRisk = distance + (entry + stop) * .001;
  const equity = number(capacity.account.equity);
  const remainingRisk = number(capacity.risk.remainingRiskAmount);
  const remainingMargin = number(capacity.capacity.remainingMargin);
  const remainingExposure = number(capacity.exposure.remaining);
  const symbolLimit = equity * number(capacity.limits.maxSymbolExposurePct) / 100
    - number(capacity.exposure.bySymbol?.[d.symbol] || 0);
  const directionLimit = equity * number(capacity.limits.maxDirectionExposurePct) / 100
    - number(capacity.exposure.direction?.[side] || 0);
  const capNotional = Math.min(remainingExposure, symbolLimit, directionLimit);
  if (!(capNotional > 0) || !(remainingRisk > 0) || !(remainingMargin > 0)) return null;
  const caps = [budget.amount / perUnitRisk, budget.balance * .30 * leverage / entry,
    remainingRisk / perUnitRisk, remainingMargin * leverage / entry, capNotional / entry, filters.maxQty];
  let quantity = Math.min(...caps);
  const qtyPrecision = entry >= 1000 ? 3 : entry >= 10 ? 2 : 1;
  quantity = Math.floor(quantity * 10 ** qtyPrecision + 1e-9) / 10 ** qtyPrecision;
  if (filters.step > 0) quantity = Math.floor(quantity / filters.step + 1e-9) * filters.step;
  if (filters.lotStep > 0 && Math.abs(quantity / filters.lotStep - Math.round(quantity / filters.lotStep)) > 1e-6) return null;
  if (!(quantity >= filters.minQty) || quantity > filters.maxQty || quantity * entry < filters.minNotional * 1.01) return null;
  const actualRisk = quantity * perUnitRisk;
  const margin = quantity * entry / leverage;
  const realization = quantity * distance / budget.amount;
  if (!(actualRisk <= remainingRisk + 1e-8 && margin <= remainingMargin + 1e-8
    && realization + 1e-8 >= budget.minimumRealization)) return null;
  return { quantity, notional: quantity * entry, margin, riskAtStop: actualRisk,
    riskBudgetUsd: budget.amount, riskPerUnit: perUnitRisk };
}
function feasiblePair(...args) { return projectPair(...args) !== null; }
function bestRectangle(matrix) {
  const stops = Object.keys(matrix);
  let best = null;
  for (let mask = 1; mask < 2 ** stops.length; mask++) {
    const selectedStops = stops.filter((_, index) => mask & (1 << index));
    const leverage = Array.from({ length: 10 }, (_, i) => i + 1)
      .filter(n => selectedStops.every(stop => matrix[stop].includes(n)));
    if (!leverage.length) continue;
    const score = selectedStops.length * leverage.length;
    if (!best || score > best.score || (score === best.score && selectedStops.length > best.stops.length))
      best = { stops: selectedStops, leverage, score };
  }
  return best;
}
function assessCapacity(d, entry, symbol, candidates, capacity) {
  const required = [capacity?.account?.equity, capacity?.capacity?.remainingMargin,
    capacity?.risk?.remainingRiskAmount, capacity?.exposure?.remaining,
    capacity?.limits?.maxSymbolExposurePct, capacity?.limits?.maxDirectionExposurePct];
  if (!capacity || !required.every(finite) || !capacity.exposure?.bySymbol || !capacity.exposure?.direction
      || !Array.isArray(capacity.positions)) throw new Error('JEV_CAPACITY_UNAVAILABLE');
  if (capacity.allowed !== true || d.passRisk === false || d.riskDecision?.allowed === false)
    return { allowed: false, reason: 'JEV_RISK_REJECTED', sides: {}, blockedSides: ['LONG', 'SHORT'] };
  const rules = filtersFor(symbol);
  if (!(rules.step > 0) || !(rules.minQty > 0) || !(rules.minNotional > 0)) throw new Error('JEV_CAPACITY_UNAVAILABLE');
  const sides = {}, blockedSides = [];
  for (const side of ['LONG', 'SHORT']) {
    if (!Array.isArray(d.directionalRisk?.[side]) || d.directionalRisk[side].length ||
        !d.directionalEvidence?.[side] || d.openSymbols?.includes(d.symbol)) {
      blockedSides.push(side); continue;
    }
    const budget = requestedRisk(d, side);
    if (!budget) { blockedSides.push(side); continue; }
    const matrix = Object.fromEntries(Object.entries(candidates[side].sl).map(([key, stop]) =>
      [key, Array.from({ length: 10 }, (_, i) => i + 1)
        .filter(leverage => feasiblePair(d, side, entry, stop, leverage, capacity, rules, budget))]));
    const viable = bestRectangle(matrix);
    if (!viable) { blockedSides.push(side); continue; }
    sides[side] = { leverage: viable.leverage,
      sl: Object.fromEntries(viable.stops.map(key => [key, candidates[side].sl[key]])),
      tp: candidates[side].tp };
  }
  return { allowed: Object.keys(sides).length > 0, reason: Object.keys(sides).length ? null : 'JEV_NO_FEASIBLE_POSITION',
    sides, blockedSides, metrics: { remainingMargin: number(capacity.capacity.remainingMargin),
      remainingRisk: number(capacity.risk.remainingRiskAmount),
      remainingExposure: number(capacity.exposure.remaining),
      equity: number(capacity.account.equity) } };
}
module.exports = { assessCapacity, feasiblePair, projectPair, filtersFor, requestedRisk };
