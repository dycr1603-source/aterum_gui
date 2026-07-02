'use strict';

const POLICY_VERSION = 'aterum-decision-v2-additive-2026-07-01';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(number(value) * factor) / factor;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, number(value)));
}

function technicalContribution(row = {}) {
  return {
    stage: 'technical',
    component: String(row.component || 'technical.unknown'),
    delta: round(row.value),
    evidence: row.evidence || null,
    current: row.current ?? null,
    minimum: row.minimum ?? null,
    maximum: row.maximum ?? null
  };
}

function learningContribution(row = {}) {
  return {
    stage: 'learning',
    component: String(row.component || 'learning.unknown'),
    delta: round(row.delta),
    ruleId: row.ruleId ?? null,
    key: row.key || null,
    sample: row.sample ?? null,
    evidence: row.evidence || null,
    expectancy: row.expectancy ?? null,
    profitFactor: row.profitFactor ?? null,
    researchFactor: row.researchFactor ?? 1,
    reviewFactor: row.reviewFactor ?? 1,
    shadowDelta: row.shadowDelta ?? null,
    externalMarginalDelta: row.externalMarginalDelta ?? null
  };
}

function buildDecisionTrace(input = {}) {
  const technicalRows = (input.technicalContributions || [])
    .filter(row => !String(row.component || '').startsWith('learning.'))
    .map(technicalContribution);
  const technicalScore = clamp(input.technicalScore);
  if (!technicalRows.length) {
    technicalRows.push({ stage: 'technical', component: 'technical.composite', delta: round(technicalScore),
      evidence: 'Persisted composite score', current: null, minimum: null, maximum: 100 });
  }
  const technicalRawScore = round(technicalRows.reduce((sum, row) => sum + row.delta, 0));
  const technicalClampAdjustment = round(technicalScore - technicalRawScore);
  const learningRows = (input.learningContributions || []).map(learningContribution);
  const calculatedLearningDelta = round(learningRows.reduce((sum, row) => sum + row.delta, 0));
  const learningDelta = round(input.learningDelta ?? calculatedLearningDelta);
  const preClampScore = round(technicalScore + learningDelta);
  const finalScore = clamp(input.finalScore ?? preClampScore);
  const finalClampAdjustment = round(finalScore - preClampScore);
  const reconstructedFinal = round(clamp(technicalRawScore + technicalClampAdjustment
    + learningDelta + finalClampAdjustment));
  const tolerance = number(input.tolerance, 0.05);
  return {
    schemaVersion: 1,
    policyVersion: input.policyVersion || POLICY_VERSION,
    opportunityCycleId: input.opportunityCycleId || null,
    symbol: input.symbol || null,
    direction: input.direction || null,
    technicalRawScore,
    technicalClampAdjustment,
    technicalScore: round(technicalScore),
    learningDelta,
    preClampScore,
    finalClampAdjustment,
    finalScore: round(finalScore),
    threshold: round(input.threshold ?? 65),
    decisionMargin: round(finalScore - number(input.threshold, 65)),
    contributions: [...technicalRows, ...learningRows],
    reconstruction: {
      reconstructedFinal,
      difference: round(reconstructedFinal - finalScore),
      valid: Math.abs(reconstructedFinal - finalScore) <= tolerance,
      tolerance
    },
    generatedAt: input.generatedAt || new Date().toISOString()
  };
}

function percent(value) {
  if (typeof value === 'string' && value.endsWith('%')) return number(value.slice(0, -1));
  return number(value);
}

function buildSizingTrace(input = {}) {
  const sizing = input.sizingInfo || {};
  const portfolio = input.portfolioCapacity || {};
  return {
    schemaVersion: 1,
    policyVersion: input.policyVersion || input.scoreTrace?.policyVersion || POLICY_VERSION,
    score: round(input.finalScore),
    requestedRiskPct: percent(sizing.effectiveRisk),
    actualRiskPct: number(input.riskPct, percent(sizing.actualRisk)),
    actualRiskAmount: round(input.maxLoss ?? input.riskAmount),
    quantity: round(input.qty, 10),
    leverage: number(input.leverage),
    marginRequired: round(input.marginRequired),
    multipliers: {
      score: number(sizing.scoreMultiplier, 1),
      vision: number(sizing.visionMultiplier, 1),
      regime: number(sizing.regimeMultiplier, 1),
      higherTimeframe: number(sizing.tf4hMultiplier, 1),
      macro: number(sizing.macroSizeMultiplier, 1),
      riskReduction: number(input.riskReduction)
    },
    portfolioPreflight: {
      allowed: portfolio.allowed ?? null,
      equity: portfolio.account?.equity ?? input.balance ?? null,
      openRiskPct: portfolio.risk?.openRiskPct ?? null,
      remainingRiskPct: portfolio.risk?.remainingRiskPct ?? null,
      remainingRiskAmount: portfolio.risk?.remainingRiskAmount ?? sizing.allocationRemainingRisk ?? null,
      marginUsagePct: portfolio.account?.marginUsagePct ?? null,
      remainingMargin: portfolio.capacity?.remainingMargin ?? sizing.allocationRemainingMargin ?? null,
      exposurePct: portfolio.exposure?.totalPct ?? null,
      primaryReason: portfolio.primaryReason?.code || null
    },
    generatedAt: input.generatedAt || new Date().toISOString()
  };
}

module.exports = { POLICY_VERSION, buildDecisionTrace, buildSizingTrace, clamp, number, round };
