'use strict';
// Strategy opinions remain evidence for Jev; operational/risk constraints still apply.
const STRATEGY_CODES = new Set(['TECHNICAL_SCORE', 'DIRECTION_AMBIGUOUS', 'LEARNING_HARD_BLOCK']);
function operationalBlockers(candidate) {
  return (candidate.hardBlockers || []).filter(b => !STRATEGY_CODES.has(b.code) && b.code !== 'PORTFOLIO_CORRELATION');
}
function eligibleForJev(candidate) {
  return operationalBlockers(candidate).length === 0 && ['LONG', 'SHORT'].some(side => {
    const evidence = candidate.directionalEvidence?.[side];
    return evidence && Array.isArray(evidence.contributions) &&
      Array.isArray(candidate.directionalRisk?.[side]) && candidate.directionalRisk[side].length === 0;
  });
}
function chosenContext(d, direction) {
  const side = d.directionalEvidence?.[direction];
  if (!side || !Number.isFinite(side.score) || !Array.isArray(side.contributions) || !side.tf4h ||
      !Array.isArray(d.directionalRisk?.[direction])) throw new Error('JEV_DIRECTIONAL_DATA_MISSING');
  if (operationalBlockers(d).length || d.directionalRisk[direction].length) throw new Error('JEV_RISK_REJECTED');
  return { technicalScore: side.score, finalScore: side.score, tf4h: side.tf4h,
    contributionTable: side.contributions, indicators: side.indicators,
    setupLabel: [d.aiResult?.regime || d.regime || 'N/A', side.tf4h.status, d.marketContext?.market_bias || 'N/A'].join(' / '),
    hardBlockers: [], scoreTrace: null, learningDecision: null,
    aiResult: { ...d.aiResult, direction_bias: direction, reasoning: 'Dirección elegida por Jev; indicadores como evidencia' },
    opportunityDecision: { ...d.opportunityDecision, direction, baselineDirection: d.direction,
      technicalScore: side.score, finalScore: side.score, tf4h: side.tf4h, contributionTable: side.contributions,
      hardBlockers: [], primaryReason: 'JEV_DIRECTION_SELECTED' } };
}
module.exports = { STRATEGY_CODES, operationalBlockers, eligibleForJev, chosenContext };
