const d = $input.first().json;
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
const { symbol, direction, indicators, aiResult, balance, availableBalance, openCount, openSymbols, candles, intelAdjFinal, portfolioCapacity } = d;

// ── Parámetros base ───────────────────────────────────────────────────────────
const BASE_RISK_PCT  = 0.02;
const MAX_MARGIN_PCT = 0.30;
const MIN_RISK_PCT   = 0.005;

function sizeCandidate(candidate, allocation) {
  const finalScore = candidate.finalScore;
  const cIndicators = candidate.indicators || indicators;
  const currentPrice = cIndicators.currentPrice;
  const atrVal       = cIndicators.atr;
  const cDirection   = candidate.direction || direction;
  const cSymbol      = candidate.symbol || symbol;

  let scoreMultiplier = 1.0;
  if      (finalScore >= 80) scoreMultiplier = 1.5;
  else if (finalScore >= 70) scoreMultiplier = 1.25;
  else if (finalScore >= 60) scoreMultiplier = 1.0;
  else if (finalScore >= 55) scoreMultiplier = 0.7;
  else                       scoreMultiplier = 0.5;

  const marketState = d.aiVision?.market_state || 'UNKNOWN';
  let visionMultiplier = 1.0;
  if      (marketState === 'EARLY_TREND') visionMultiplier = 1.3;
  else if (marketState === 'MID_TREND')   visionMultiplier = 1.1;
  else if (marketState === 'LATE_TREND')  visionMultiplier = 0.6;
  else if (marketState === 'PARABOLIC')   visionMultiplier = 0.3;

  const regime = candidate.regime || aiResult?.regime || 'TRENDING';
  let regimeMultiplier = 1.0;
  if      (regime === 'TRENDING')        regimeMultiplier = 1.1;
  else if (regime === 'RANGING')         regimeMultiplier = 0.8;
  else if (regime === 'HIGH_VOLATILITY') regimeMultiplier = 0.7;

  const tf4h = candidate.tf4h || d.tf4h || {};
  let tf4hMultiplier = 1.0;
  if      (tf4h.status === 'CONFIRMS')    tf4hMultiplier = 1.1;
  else if (tf4h.status === 'NEUTRAL')     tf4hMultiplier = 0.95;
  else if (tf4h.status === 'CONTRADICTS') tf4hMultiplier = 0.6;

  const macroSizeMultiplier = d.marketContext?.size_multiplier || 1.0;
  const aiRiskReduction = d.riskReduction || 0;

  const rawRisk = BASE_RISK_PCT
    * scoreMultiplier
    * visionMultiplier
    * regimeMultiplier
    * tf4hMultiplier
    * macroSizeMultiplier
    * (1 - aiRiskReduction);

  const effectiveRisk = Math.min(0.05, Math.max(MIN_RISK_PCT, rawRisk));

  const maxLeverage = tf4h.status === 'CONTRADICTS' ? 4 : 15;
  const leverage = Math.min(Math.max(d.leverageOverride || aiResult?.recommended_leverage || 5, 2), maxLeverage);

  const slMultiplier = d.slMultiplier || 1.5;
  const tpMultiplier = d.tpMultiplier || 2.0;

  const slDistance = atrVal * slMultiplier;
  const requestedRiskAmount = balance * effectiveRisk;
  let   qty        = requestedRiskAmount / slDistance;
  const requestedMargin = (qty * currentPrice) / leverage;

  const margin = (qty * currentPrice) / leverage;
  if(margin > balance * MAX_MARGIN_PCT){
    qty = (balance * MAX_MARGIN_PCT * leverage) / currentPrice;
  }

  const equity = Number(allocation.account?.equity || balance || 0);
  const remainingRiskAmount = Number(allocation.risk?.remainingRiskAmount);
  const remainingMargin = Number(allocation.capacity?.remainingMargin);
  const remainingExposure = Number(allocation.exposure?.remaining);
  const maxSymbolExposure = equity * Number(allocation.limits?.maxSymbolExposurePct || 0) / 100;
  const maxDirectionExposure = equity * Number(allocation.limits?.maxDirectionExposurePct || 0) / 100;
  const currentSymbolExposure = Number(allocation.exposure?.bySymbol?.[cSymbol] || 0);
  const currentDirectionExposure = Number(allocation.exposure?.direction?.[cDirection] || 0);
  const qtyCaps = [qty];
  if(Number.isFinite(remainingRiskAmount) && remainingRiskAmount >= 0) qtyCaps.push(remainingRiskAmount / slDistance);
  if(Number.isFinite(remainingMargin) && remainingMargin >= 0) qtyCaps.push(remainingMargin * leverage / currentPrice);
  if(Number.isFinite(remainingExposure) && remainingExposure >= 0) qtyCaps.push(remainingExposure / currentPrice);
  if(maxSymbolExposure > 0) qtyCaps.push(Math.max(0, maxSymbolExposure - currentSymbolExposure) / currentPrice);
  if(maxDirectionExposure > 0) qtyCaps.push(Math.max(0, maxDirectionExposure - currentDirectionExposure) / currentPrice);
  qty = Math.max(0, Math.min(...qtyCaps));

  const pricePrecision = currentPrice >= 1000 ? 1 : currentPrice >= 10 ? 2 : currentPrice >= 1 ? 3 : 4;
  const qtyPrecision   = currentPrice >= 1000 ? 3 : currentPrice >= 10 ? 2 : 1;
  qty = Math.floor(qty * Math.pow(10, qtyPrecision)) / Math.pow(10, qtyPrecision);

  let sl, tp, side;
  if(cDirection === 'LONG'){
    side = 'BUY';
    sl   = +(currentPrice - slDistance).toFixed(pricePrecision);
    tp   = +(currentPrice + slDistance * tpMultiplier).toFixed(pricePrecision);
  } else {
    side = 'SELL';
    sl   = +(currentPrice + slDistance).toFixed(pricePrecision);
    tp   = +(currentPrice - slDistance * tpMultiplier).toFixed(pricePrecision);
  }

  const maxLoss        = +(Math.abs(currentPrice - sl) * qty).toFixed(2);
  const maxGain         = +(maxLoss * tpMultiplier).toFixed(2);
  const marginRequired  = +((qty * currentPrice) / leverage).toFixed(2);

  const actualRiskAmount = maxLoss;
  const actualRiskPct    = +(actualRiskAmount / balance * 100).toFixed(2);
  const allocationAllowed = allocation.allowed !== false && qty > 0
    && (!Number.isFinite(remainingRiskAmount) || actualRiskAmount <= remainingRiskAmount + 1e-8)
    && (!Number.isFinite(remainingMargin) || marginRequired <= remainingMargin + 1e-8);

  // ── Efficiency Gate ──────────────────────────────────────────────────────────
  // requestedRiskAmount es lo que el score/multiplicadores se ganaron ANTES de
  // los clamps de portfolio (Position_Sizer.js linea 70, sin cambios). El ratio
  // mide cuánto de ese tamaño sobrevivió a los clamps de riesgo/margen/exposición.
  const sizeRealizationRatio = requestedRiskAmount > 0 ? qty * slDistance / requestedRiskAmount : 1;
  const requestedRiskPct = +(requestedRiskAmount / balance * 100).toFixed(2);

  // Umbral adaptativo: setups excepcionales (mayor decisionMargin sobre el
  // threshold de entrada) toleran más compresión antes de considerarse
  // irrelevantes; no es un número fijo por símbolo, se deriva del propio score.
  const threshold = Number(candidate.threshold ?? d.dynamicThreshold ?? 65);
  const decisionMargin = Math.max(0, finalScore - threshold);
  const scoreRelief = Math.min(0.10, decisionMargin / 350);
  const minRealizationRatio = Math.max(0.05, 0.20 - scoreRelief);

  const efficiencyPass = qty <= 0 ? false : sizeRealizationRatio >= minRealizationRatio;

  return {
    candidate, qty, side, sl, tp, leverage, currentPrice, atrVal, slDistance,
    maxLoss, maxGain, marginRequired, actualRiskAmount, actualRiskPct,
    allocationAllowed, efficiencyPass, sizeRealizationRatio, minRealizationRatio,
    requestedRiskAmount, requestedRiskPct, requestedMargin: +requestedMargin.toFixed(2),
    scoreMultiplier, visionMultiplier, regimeMultiplier, tf4hMultiplier, macroSizeMultiplier,
    aiRiskReduction, effectiveRisk, marketState, regime, tf4h, slMultiplier, tpMultiplier,
    allocation, remainingRiskAmount, remainingMargin, decisionMargin, threshold
  };
}

// ── Candidatos: el seleccionado primero, luego el resto del ranking por score ──
const primary = {
  symbol, direction, finalScore: d.finalScore, indicators, tf4h: d.tf4h, regime: d.aiResult?.regime,
  threshold: d.dynamicThreshold, contributionTable: d.contributionTable, opportunityDecision: d.opportunityDecision
};
const alternates = (d.opportunityRanking || [])
  .filter(item => item && item.symbol && item.symbol !== symbol && item.direction && item.direction !== 'NEUTRAL'
    && (!item.hardBlockers || item.hardBlockers.length === 0) && Number(item.finalScore) >= Number(d.dynamicThreshold ?? 65))
  .sort((a, b) => b.finalScore - a.finalScore);

const attempts = [];
let winner = null;
for (const candidate of [primary, ...alternates]) {
  if (!candidate.indicators?.currentPrice || !candidate.indicators?.atr) continue;
  const result = sizeCandidate(candidate, portfolioCapacity || {});
  attempts.push({ symbol: candidate.symbol, finalScore: candidate.finalScore,
    sizeRealizationRatio: +result.sizeRealizationRatio.toFixed(4),
    minRealizationRatio: +result.minRealizationRatio.toFixed(4),
    actualRiskPct: result.actualRiskPct, marginRequired: result.marginRequired,
    allocationAllowed: result.allocationAllowed, efficiencyPass: result.efficiencyPass });
  if (result.allocationAllowed && result.efficiencyPass) { winner = result; break; }
}

console.log(`[${symbol}] efficiency gate attempts: ${JSON.stringify(attempts)}`);

if (!winner) {
  const rejected = attempts[0] || null;
  const reason = rejected
    ? `Requested risk: ${rejected.actualRiskPct != null ? '' : ''}Realization ratio ${(rejected.sizeRealizationRatio * 100).toFixed(1)}% below minimum ${(rejected.minRealizationRatio * 100).toFixed(1)}% for ${attempts.length} candidate(s) evaluated`
    : 'No candidate produced a valid size';
  const primaryAttempt = attempts.find(a => a.symbol === symbol) || attempts[0];
  const requestedForLog = primaryAttempt ? primaryAttempt : null;

  try {
    await this.helpers.httpRequest({
      method: 'POST', url: `${DASHBOARD}/db/rejection`, json: true,
      body: {
        ...d,
        symbol, direction,
        skipReason: `SIZE_REALIZATION_TOO_LOW: ${reason}`,
        finalScore: d.finalScore,
        tf4hStatus: d.tf4h?.status || null,
        macroBias: d.marketContext?.market_bias || null,
        fearGreed: d.marketContext?.fearGreed?.value || null,
        entryReason: reason,
        setupLabel: d.setupLabel || null
      }
    });
    await this.helpers.httpRequest({
      method: 'POST', url: `${DASHBOARD}/db/scan`, json: true,
      body: {
        symbol, scanScore: d.scanScore, direction, finalScore: d.finalScore,
        longScore: d.longScore, shortScore: d.shortScore, passAI: false,
        skipReason: `SIZE_REALIZATION_TOO_LOW: ${reason}`,
        indicators, volume24h: d.volume24h, priceChangePct: d.priceChangePct, openInterest: d.openInterest
      }
    });
  } catch (error) {
    console.log('[EfficiencyGate] telemetry:', error.message);
  }

  return [{
    json: {
      ...d,
      qty: 0, allocationAllowed: false,
      skipReason: `SIZE_REALIZATION_TOO_LOW: ${reason}`,
      rejectionReason: { code: 'SIZE_REALIZATION_TOO_LOW',
        detail: reason, attempts, current: requestedForLog?.sizeRealizationRatio ?? null,
        maximum: requestedForLog?.minRealizationRatio ?? null },
      efficiencyGate: { pass: false, attempts },
      portfolioCapacity: portfolioCapacity || null
    }
  }];
}

const r = winner;
console.log(`[${r.candidate.symbol}] sizing: score=${r.candidate.finalScore} 4h=${r.tf4h.status||'N/A'} macro=${r.macroSizeMultiplier}x vision=${r.marketState} regime=${r.regime} open=${openCount}`);
console.log(`[${r.candidate.symbol}] multipliers: score=${r.scoreMultiplier} 4h=${r.tf4hMultiplier} macro=${r.macroSizeMultiplier} vision=${r.visionMultiplier} regime=${r.regimeMultiplier} aiRed=${r.aiRiskReduction}`);
console.log(`[${r.candidate.symbol}] result: risk=${r.actualRiskPct}% ($${r.actualRiskAmount}) qty=${r.qty} lev=${r.leverage}x sl=${r.sl} tp=${r.tp} margin=$${r.marginRequired} realization=${(r.sizeRealizationRatio*100).toFixed(1)}%`);

const chosen = r.candidate;
const usedFallback = chosen.symbol !== symbol;

return [{
  json: {
    symbol: chosen.symbol, side: r.side, direction: chosen.direction || direction, qty: r.qty, leverage: r.leverage,
    entryPrice:      +r.currentPrice.toFixed(r.currentPrice >= 1000 ? 1 : r.currentPrice >= 10 ? 2 : r.currentPrice >= 1 ? 3 : 4),
    sl: r.sl, tp: r.tp,
    riskAmount:      r.actualRiskAmount,
    riskPct:         r.actualRiskPct,
    maxLoss:         r.maxLoss,
    maxGain:         r.maxGain,
    rrRatio:         r.tpMultiplier,
    marginRequired:  r.marginRequired,
    finalScore:      chosen.finalScore,
    technicalScore:  chosen.symbol === symbol ? d.technicalScore : chosen.technicalScore,
    contributionTable: chosen.contributionTable || [],
    opportunityDecision: chosen.opportunityDecision || d.opportunityDecision || null,
    opportunityUniverse: d.opportunityUniverse || null,
    opportunityRanking: d.opportunityRanking || [],
    learningDecision:  d.learningDecision || null,
    policyVersion: d.policyVersion || d.scoreTrace?.policyVersion || null,
    scoreTrace: chosen.symbol === symbol ? (d.scoreTrace || d.learningDecision?.scoreTrace || null) : null,
    decisionExplanation: d.decisionExplanation || null,
    riskDecision:      d.riskDecision || null,
    volume24h:         chosen.symbol === symbol ? d.volume24h : null,
    priceChangePct:    chosen.symbol === symbol ? d.priceChangePct : null,
    openInterest:      chosen.symbol === symbol ? d.openInterest : null,
    indicators:        chosen.indicators || indicators,
    candles:           chosen.symbol === symbol ? candles : null,
    balance, availableBalance, openCount, openSymbols,
    portfolioCapacity: r.allocation,
    allocationAllowed: r.allocationAllowed,
    aiResult:          d.aiResult,
    aiVision:          d.aiVision || null,
    slMultiplier:      r.slMultiplier,
    tpMultiplier:      r.tpMultiplier,
    riskReduction:     r.aiRiskReduction,
    leverageOverride:  r.leverage,
    scanScore:         chosen.symbol === symbol ? d.scanScore : chosen.scanScore,
    marketContext:     d.marketContext || null,
    tf4h:              r.tf4h,
    dynamicThreshold:  r.threshold,
    intelAdjFinal:     intelAdjFinal || 0,
    usedFallback,
    originalSymbol:    usedFallback ? symbol : (d.originalSymbol || null),
    efficiencyGate: { pass: true, attempts, chosenSymbol: chosen.symbol,
      sizeRealizationRatio: +r.sizeRealizationRatio.toFixed(4), minRealizationRatio: +r.minRealizationRatio.toFixed(4) },
    sizingInfo: {
      baseRisk:           (BASE_RISK_PCT*100).toFixed(1)+'%',
      effectiveRisk:      (r.effectiveRisk*100).toFixed(2)+'%',
      actualRisk:         r.actualRiskPct+'%',
      requestedRiskPct:   r.requestedRiskPct+'%',
      requestedMargin:    r.requestedMargin,
      sizeRealizationRatio: +r.sizeRealizationRatio.toFixed(4),
      scoreMultiplier:    r.scoreMultiplier,
      visionMultiplier:   r.visionMultiplier,
      regimeMultiplier:   r.regimeMultiplier,
      tf4hMultiplier:     r.tf4hMultiplier,
      tf4hStatus:         r.tf4h.status || 'N/A',
      macroSizeMultiplier: r.macroSizeMultiplier,
      allocationRemainingRisk: Number.isFinite(r.remainingRiskAmount) ? +r.remainingRiskAmount.toFixed(4) : null,
      allocationRemainingMargin: Number.isFinite(r.remainingMargin) ? +r.remainingMargin.toFixed(4) : null,
      marketState:        r.marketState,
      regime:             r.regime
    }
  }
}];
