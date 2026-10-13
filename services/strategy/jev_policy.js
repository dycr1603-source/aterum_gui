"use strict";
const { levels, size } = require("./risk"),
  { filtersFor } = require("../jev_capacity");
function levelOptions(d, entry, filter, maxDriftPct = 0) {
  const out = {};
  for (const direction of d.strategy.directions) {
    try {
      const sl = {}, tp = {};
      const volatile = d.strategy.regime === 'HIGH_VOLATILITY';
      const relative = d.strategy.version === 'relative-reversal-v1';
      const scalp = d.strategy.version === 'scalp-research-v1';
      const useShortTerm = !relative && d.strategy.shortTerm?.recentCandles?.length >= 6 &&
        Number(d.strategy.shortTerm.atr) > 0;
      const structure = relative
        ? d.strategy.recentCandles.slice(-12)
        : useShortTerm
        ? d.strategy.shortTerm.recentCandles.slice(-6)
        : d.strategy.recentCandles.slice(-(volatile ? 6 : 4));
      const levelAtr = useShortTerm ? d.strategy.shortTerm.atr : d.indicators.atr;
      for (const [i, scale] of [0.8, 1, 1.2].entries()) {
        const x = levels({
          bars: structure,
          entry,
          side: direction,
          atr: levelAtr,
          stopAtr: (relative || scalp) ? d.strategy.opportunity.params.stopAtr * scale
            : (volatile ? 1.8 : 1.5) * scale,
          targetAtr: 1.5 * scale,
          tick: Number(filter.tickSize),
        });
        sl[`sl${i + 1}`] = Number(x.stop.toFixed(12));
        tp[`tp${i + 1}`] = Number(x.target.toFixed(12));
      }
      const sign = direction === "LONG" ? 1 : -1;
      const widestStop = Math.max(...Object.values(sl).map((stop) => Math.abs(entry - stop)));
      const tick = Number(filter.tickSize);
      let previousDistance = 0;
      const riskPolicy = d.strategy.riskPolicy;
      const costRate = riskPolicy.feeRate +
        (riskPolicy.slippageBps + (riskPolicy.spreadBps ?? 0) / 2) / 10000;
      const costPerUnit = entry * (2 * costRate + riskPolicy.fundingReserve);
      // A target barely above minExpectedR at the proposal quote is likely to
      // fail the live writer after even one price tick. Reserve one adverse
      // tick (or 0.05%) without extending the configured drift allowance.
      const driftFraction = Math.min(Math.max(0, maxDriftPct) / 100,
        Math.max(tick / entry, 0.0005));
      const adverseEntry = entry * (1 + sign * driftFraction);
      const widestStopPrice = sign === 1 ? Math.min(...Object.values(sl)) : Math.max(...Object.values(sl));
      const adverseRiskPerUnit = Math.abs(adverseEntry - widestStopPrice) +
        (adverseEntry + widestStopPrice) * costRate + adverseEntry * riskPolicy.fundingReserve;
      const robustTarget = sign === 1
        ? (riskPolicy.minExpectedR * adverseRiskPerUnit +
          adverseEntry * (1 + costRate + riskPolicy.fundingReserve)) / (1 - costRate)
        : (adverseEntry * (1 - costRate - riskPolicy.fundingReserve) -
          riskPolicy.minExpectedR * adverseRiskPerUnit) / (1 + costRate);
      const robustDistance = sign * (robustTarget - entry);
      const targetMultipliers = relative
        ? [0.75, 1, 1.25].map(n => n * d.strategy.opportunity.params.targetR)
        : scalp
        ? [0.8, 1, 1.2].map(n => n * d.strategy.opportunity.params.targetR)
        : [1.3, 1.55, 1.8];
      for (const [i, multiplier] of targetMultipliers.entries()) {
        const key = `tp${i + 1}`;
        // A closer target still has to pay both trading legs and clear the
        // configured net reward/risk floor for the widest offered stop.
        const distance = Math.max(widestStop * multiplier,
          widestStop * riskPolicy.minExpectedR + costPerUnit * (1 + riskPolicy.minExpectedR),
          robustDistance,
          previousDistance + tick);
        const raw = entry + sign * distance;
        const rounded = (sign === 1 ? Math.ceil(raw / tick) : Math.floor(raw / tick)) * tick;
        tp[key] = Number(rounded.toFixed(12));
        previousDistance = Math.abs(tp[key] - entry);
      }
      const prices = [...Object.values(sl), ...Object.values(tp)];
      if (prices.some((price) => !Number.isFinite(price) || price <= 0 ||
          (Number(filter.minPrice) > 0 && price < Number(filter.minPrice)) ||
          (Number(filter.maxPrice) > 0 && price > Number(filter.maxPrice)))) continue;
      out[direction] = { sl, tp };
    } catch (error) {
      if (!['INVALID_STRUCTURE', 'INVALID_LEVELS'].includes(error.message)) throw error;
    }
  }
  return out;
}
function marginAllocation(p, capacity, d) {
  const equity = Number(capacity.account.equity);
  const used = Number(capacity.account.marginUsed ?? 0);
  const openCount = (capacity.positions || []).length;
  const slots = Math.max(1, p.maxPositions - openCount);
  const remainingBudget = Math.max(0, equity * (p.maxTotalMarginFraction ?? 0.9) - used);
  const strongLead = openCount === 0 && d.strategy.candidateRank === 1 &&
    Number(d.strategy.voteSummary?.supporting ?? 0) >= 6;
  const qualityWeight = strongLead ? 1.15 : 1;
  return Math.max(0, Math.min(equity * (p.maxMarginFractionPerPosition ?? 0.9),
    remainingBudget, remainingBudget / slots * qualityWeight,
    Number(capacity.capacity.remainingMargin)));
}
function projections({
  d,
  side,
  entry,
  stop,
  target,
  capacity,
  symbol,
  brackets,
  feeRate,
  maxLeverage = 10,
}) {
  const p = d.strategy.riskPolicy,
    rules = filtersFor(symbol),
    equity = Number(capacity.account.equity);
  const risk = Math.min(
    equity * p.riskFraction,
    Number(capacity.risk.remainingRiskAmount),
    equity * p.maxPortfolioRisk - Number(capacity.risk.openRiskAmount),
  );
  const maxNotional = Math.min(
    Number(capacity.exposure.remaining),
    (equity * Number(capacity.limits.maxSymbolExposurePct)) / 100 -
      Number(capacity.exposure.bySymbol[d.symbol] || 0),
    (equity * Number(capacity.limits.maxDirectionExposurePct)) / 100 -
      Number(capacity.exposure.direction[side] || 0),
  );
  const marginCap = marginAllocation(p, capacity, d);
  const minimumMargin = d.strategy.version === 'consensus-10-v1'
    ? marginCap * (p.minMarginFillFraction ?? 0)
    : 0;
  const result = {};
  for (let leverage = p.minLeverage ?? 1; leverage <= Math.min(maxLeverage, p.maxLeverage ?? 10); leverage++) {
    try {
      let s = size({
        entry,
        stop,
        target,
        side,
        allowedRisk: risk,
        availableMargin: Number(capacity.capacity.remainingMargin),
        leverage,
        feeRate: Math.max(feeRate, p.feeRate),
        slippageBps: p.slippageBps + (p.spreadBps ?? 0) / 2,
        fundingReserve: p.fundingReserve,
        ...rules,
        maxQty: Math.min(rules.maxQty, maxNotional / entry, marginCap * leverage / entry),
      });
      const bracket = brackets?.find(
        (b) =>
          Number(b.notionalFloor) <= s.notional &&
          s.notional < Number(b.notionalCap),
      );
      if (!bracket || leverage > Number(bracket.initialLeverage)) continue;
      s = size({
        entry,
        stop,
        target,
        side,
        allowedRisk: risk,
        availableMargin: Number(capacity.capacity.remainingMargin),
        leverage,
        feeRate: Math.max(feeRate, p.feeRate),
        slippageBps: p.slippageBps + (p.spreadBps ?? 0) / 2,
        fundingReserve: p.fundingReserve,
        ...rules,
        maxQty: Math.min(rules.maxQty, maxNotional / entry, marginCap * leverage / entry),
        maintenanceRate: Number(bracket.maintMarginRatio),
      });
      if (s.expectedR < (p.minExpectedR ?? 0)) continue;
      if (s.margin + 1e-8 < minimumMargin) continue;
      if (
        rules.lotStep &&
        Math.abs(
          s.quantity / rules.lotStep - Math.round(s.quantity / rules.lotStep),
        ) > 1e-6
      )
        continue;
      result[leverage] = s;
    } catch {
      /* An infeasible leverage is simply not offered. */
    }
  }
  return {
    policyVersion: d.strategy.version,
    allowedChoices: Object.keys(result).map(Number),
    projections: result,
    caps: [],
    metrics: {
      riskBudgetUsd: risk,
      confidenceCalibration:
        "UNPROVEN; confidence does not increase monetary risk",
    },
  };
}
function preflight(d, entry, symbol, candidates, capacity) {
  if (
    !Object.keys(candidates).length ||
    capacity?.allowed !== true ||
    !Array.isArray(capacity.positions) ||
    capacity.positions.length >= d.strategy.riskPolicy.maxPositions ||
    capacity.positions.some((p) => p.symbol === d.symbol)
  )
    return {
      allowed: false,
      reason: "JEV_RISK_REJECTED",
      sides: {},
      blockedSides: ["LONG", "SHORT"],
    };
  return {
    allowed: true,
    sides: Object.fromEntries(
      Object.entries(candidates).map(([side, options]) => [
        side,
        { ...options, leverage: Array.from({ length: (d.strategy.riskPolicy.maxLeverage ?? 10) - (d.strategy.riskPolicy.minLeverage ?? 1) + 1 }, (_, i) => i + (d.strategy.riskPolicy.minLeverage ?? 1)) },
      ]),
    ),
    blockedSides: ["LONG", "SHORT"].filter((s) => !candidates[s]),
  };
}
function state(d, market, candidates, capacity) {
  const [a, b] = d.strategy.indicators;
  return {
    schemaVersion: d.strategy.version === "new-opportunistic-v1"
      ? "aterum-new-opportunistic-v1" :
      ["consensus-10-v1", "opportunistic-v1", "relative-reversal-v1",
      "scalp-research-v1", "new-opportunistic-v1"].includes(d.strategy.version)
      ? "aterum-consensus-10-v1" : "aterum-two-indicator-v1",
    symbol: d.symbol,
    price: market.entry,
    timeframe: d.timeframe,
    timestamp: d.marketDataAt,
    market,
    candidates,
    indicator_1: a.name,
    indicator_1_value: a.value,
    indicator_1_signal: a.signal,
    indicator_2: b.name,
    indicator_2_value: b.value,
    indicator_2_signal: b.signal,
    indicators: d.strategy.indicators,
    voteSummary: d.strategy.voteSummary || null,
    opportunity: d.strategy.opportunity || null,
    candidateRank: d.strategy.candidateRank || null,
    candidateCount: d.strategy.candidateCount || null,
    contextualVolatility: d.indicators.atr,
    recentCandles: d.strategy.recentCandles,
    volume: d.strategy.volume,
    shortTerm: d.strategy.shortTerm || null,
    higherTimeframeTrend: d.strategy.higherTimeframeTrend,
    currentPositions: capacity.positions,
    portfolioExposure: capacity.exposure,
    correlationExposure: d.strategy.correlationExposure,
    availableMargin: capacity.capacity.remainingMargin,
    feesEstimate: d.strategy.riskPolicy.feeRate,
    funding: d.strategy.funding,
    recentSystemPerformance: d.strategy.recentSystemPerformance,
    marketRegime: d.strategy.regime,
  };
}
module.exports = { levelOptions, projections, preflight, state, marginAllocation };
