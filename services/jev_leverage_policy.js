'use strict';

const fs = require('fs');
const path = require('path');
const { filtersFor, requestedRisk, projectPair } = require('./jev_capacity');

function loadPolicy(file = process.env.JEV_LEVERAGE_POLICY_PATH || path.join(__dirname, '../config/jev-leverage-policy.json')) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!policy.version || !Array.isArray(policy.qualityBands) || !policy.qualityBands.length ||
      !policy.qualityBands.every(b => Number.isInteger(b.min) && Number.isInteger(b.max) && b.min >= 1 && b.max <= 10 && b.min <= b.max &&
        [b.probability, b.confidence, b.margin].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) ||
      !['atrPctCaps', 'stopPctCaps', 'netRrCaps', 'portfolioUtilizationCaps', 'technicalScoreCaps'].every(key =>
        Array.isArray(policy[key]) && policy[key].every(b => Number.isInteger(b.max) && b.max >= 1 && b.max <= 10 &&
          Number.isFinite(b.above ?? b.below))) ||
      !['neutral4hCap', 'contradicting4hCap', 'rangingRegimeCap', 'highVolatilityRegimeCap', 'opposingTrendCap',
        'opposingMacroCap', 'thinVolumeCap', 'extremeRsiCap', 'manyPositionsCap'].every(key =>
        Number.isInteger(policy[key]) && policy[key] >= 1 && policy[key] <= 10) ||
      !Number.isFinite(policy.feeRatePerSideFloor) || policy.feeRatePerSideFloor < 0 ||
      !Number.isFinite(policy.liquidationBufferMarginFraction) || policy.liquidationBufferMarginFraction < 0)
    throw new Error('JEV_LEVERAGE_POLICY_INVALID');
  return policy;
}

function evaluateLeverageChoices({ decision, d, side, entry, stop, target, capacity, symbol, brackets, feeRate,
  maxLeverage = 10, policy = loadPolicy() }) {
  const fail = code => { throw new Error(code); };
  const probability = Number(decision?.probabilities?.[side]);
  const confidence = Number(decision?.confidence);
  const others = Object.entries(decision?.probabilities || {}).filter(([key]) => key !== side).map(([, value]) => Number(value));
  const decisionMargin = probability - Math.max(...others);
  const atrPct = Number(d.indicators?.atrPct ?? Number(d.indicators?.atr) / entry * 100);
  const stopDistancePct = Math.abs(entry - stop) / entry * 100;
  const technicalScore = Number(d.directionalEvidence?.[side]?.score);
  const budget = requestedRisk(d, side);
  const limits = capacity?.limits || {};
  const utilization = Math.max(
    Number(capacity?.account?.marginUsagePct) / Number(limits.maxMarginUsagePct),
    Number(capacity?.exposure?.totalPct) / Number(limits.maxExposurePct),
    Number(capacity?.risk?.openRiskPct) / Number(limits.maxPortfolioRiskPct));
  const fee = Math.max(Number(feeRate), Number(policy.feeRatePerSideFloor));
  const netRiskPerUnit = Math.abs(entry - stop) + (entry + stop) * fee;
  const netRewardPerUnit = Math.abs(target - entry) - (entry + target) * fee;
  const netRr = netRewardPerUnit / netRiskPerUnit;
  if (![probability, confidence, decisionMargin, atrPct, stopDistancePct, technicalScore,
    utilization, fee, netRr].every(Number.isFinite) || !budget || !(netRiskPerUnit > 0) || !(netRewardPerUnit > 0) ||
    !Array.isArray(brackets) || !brackets.length || !Number.isInteger(maxLeverage) || maxLeverage < 1 || maxLeverage > 10)
    fail('JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE');

  const band = [...policy.qualityBands].reverse().find(b => probability >= b.probability &&
    confidence >= b.confidence && decisionMargin >= b.margin);
  if (!band) fail('JEV_LEVERAGE_POLICY_INVALID');
  let cap = Math.min(maxLeverage, band.max);
  const caps = [{ source: 'quality', max: band.max }];
  const limit = (source, value) => {
    if (value < cap) { cap = value; caps.push({ source, max: value }); }
  };
  for (const b of policy.atrPctCaps) if (atrPct > b.above) limit('atr', b.max);
  for (const b of policy.stopPctCaps) if (stopDistancePct > b.above) limit('stop_distance', b.max);
  for (const b of policy.netRrCaps) if (netRr < b.below) limit('net_rr', b.max);
  for (const b of policy.portfolioUtilizationCaps) if (utilization > b.above) limit('portfolio', b.max);
  for (const b of policy.technicalScoreCaps) if (technicalScore < b.below) limit('technical_score', b.max);
  const tf4h = d.directionalEvidence?.[side]?.tf4h?.status || d.tf4h?.status;
  if (tf4h === 'NEUTRAL') limit('tf4h', policy.neutral4hCap);
  if (tf4h === 'CONTRADICTS') limit('tf4h', policy.contradicting4hCap);
  const macro = d.marketContext?.market_bias;
  if ((side === 'LONG' && macro === 'BEARISH') || (side === 'SHORT' && macro === 'BULLISH'))
    limit('macro', policy.opposingMacroCap);
  const regime = d.regime || d.aiResult?.regime;
  if (regime === 'RANGING') limit('regime', policy.rangingRegimeCap);
  if (regime === 'HIGH_VOLATILITY') limit('regime', policy.highVolatilityRegimeCap);
  const ema8 = Number(d.indicators?.ema8), ema21 = Number(d.indicators?.ema21);
  if (Number.isFinite(ema8) && Number.isFinite(ema21) &&
      ((side === 'LONG' && ema8 < ema21) || (side === 'SHORT' && ema8 > ema21)))
    limit('trend_alignment', policy.opposingTrendCap);
  const rsi = Number(d.indicators?.rsi14);
  if (Number.isFinite(rsi) && ((side === 'LONG' && rsi > policy.longRsiExtreme) ||
    (side === 'SHORT' && rsi < policy.shortRsiExtreme))) limit('rsi', policy.extremeRsiCap);
  const volumeRatio = Number(d.indicators?.volRatio);
  if (Number.isFinite(volumeRatio) && volumeRatio < policy.thinVolumeRatio) limit('volume', policy.thinVolumeCap);
  if (capacity.positions.length >= policy.manyPositionsAt) limit('open_positions', policy.manyPositionsCap);

  // When a safety cap falls below the quality band, retain a small choice set
  // without forcing an otherwise strong setup back to 1x by default.
  const min = cap < band.min ? Math.max(1, cap - 1) : band.min;
  const filters = filtersFor(symbol);
  const allowedChoices = [];
  const projections = {};
  for (const leverage of Array.from({ length: cap - min + 1 }, (_, i) => i + min)) {
    const projection = projectPair(d, side, entry, stop, leverage, capacity, filters, budget);
    if (!projection) continue;
    const actualFeeRisk = projection.quantity * (entry + stop) * fee;
    if (projection.quantity * Math.abs(entry - stop) + actualFeeRisk >
        Math.min(budget.amount, Number(capacity.risk.remainingRiskAmount)) + 1e-8) continue;
    const bracket = brackets.find(b => Number(b.notionalFloor) <= projection.notional &&
      projection.notional <= Number(b.notionalCap));
    if (!bracket || leverage > Number(bracket.initialLeverage)) continue;
    const maintenanceRate = Number(bracket.maintMarginRatio);
    if (!Number.isFinite(maintenanceRate) || maintenanceRate < 0) continue;
    // Conservative isolated-margin test at the stop. Ignore Binance's maintenance deduction.
    const collateralAtStop = projection.margin - projection.quantity * Math.abs(entry - stop)
      - projection.quantity * (entry + stop) * fee;
    const maintenanceAtStop = projection.quantity * stop * maintenanceRate;
    if (!(collateralAtStop > maintenanceAtStop + projection.margin * policy.liquidationBufferMarginFraction)) continue;
    allowedChoices.push(leverage);
    projections[leverage] = { ...projection,
      riskAtStop: projection.quantity * Math.abs(entry - stop) + actualFeeRisk, maintenanceRate,
      collateralAtStop, maintenanceAtStop };
  }
  return { policyVersion: policy.version, allowedChoices, policyMaxLeverage: cap,
    qualityBand: { min: band.min, max: band.max }, caps,
    metrics: { probability, confidence, decisionMargin, atrPct, stopDistancePct, netRr,
      technicalScore, portfolioUtilization: utilization, portfolioMarginUsed: capacity.account.marginUsagePct,
      portfolioExposure: capacity.exposure.totalPct, riskUsed: capacity.risk.openRiskPct,
      riskBudgetUsd: budget.amount }, projections };
}

module.exports = { loadPolicy, evaluateLeverageChoices };
