'use strict';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(number(value) * factor) / factor;
}

function chooseRules(rules = [], context = {}, config = {}) {
  const active = rules.filter(rule => rule.status === 'active');
  const byType = new Map(active.map(rule => [rule.rule_type, rule]));
  const softMin = number(config.soft_min_sample, 8);

  // combination -> setup -> regime are nested descriptions of the same edge.
  // Only the most specific statistically usable rule is allowed to contribute.
  const structural = ['combination', 'setup', 'regime']
    .map(type => byType.get(type))
    .find(rule => rule && number(rule.sample_size) >= softMin);

  const selected = [
    structural,
    byType.get('symbol'),
    byType.get('session'),
    byType.get('score_band')
  ].filter(Boolean);

  const selectedIds = new Set(selected.map(rule => rule.id));
  return {
    selected,
    suppressed: active.filter(rule => !selectedIds.has(rule.id)).map(rule => ({
      id: rule.id,
      type: rule.rule_type,
      key: rule.rule_key,
      reason: ['combination', 'setup', 'regime'].includes(rule.rule_type)
        ? 'evidencia estructural solapada'
        : 'dimensión no seleccionada'
    })),
    context
  };
}

function computeLearningBias(rules = [], context = {}, config = {}) {
  const componentCap = number(config.learning_component_delta_cap, 3);
  const totalCap = number(config.learning_delta_cap, 8);
  const hardMin = number(config.hard_min_sample, 20);
  const { selected, suppressed } = chooseRules(rules, context, config);

  function deltaFor(weight, profitable) {
    const effectiveWeight = profitable && weight < 1 ? 1 : weight;
    return clamp((effectiveWeight - 1) * 25, -componentCap, componentCap);
  }

  const contributions = selected.map(rule => {
    const productionWeight = number(rule.weight, 1);
    const shadowWeight = productionWeight
      * number(rule.research_factor, 1)
      * number(rule.review_factor, 1);
    const profitable = number(rule.expectancy) >= 0 && number(rule.profit_factor) >= 1;
    const delta = deltaFor(productionWeight, profitable);
    const shadowDelta = deltaFor(shadowWeight, profitable);
    return {
      ruleId: rule.id,
      component: `learning.${rule.rule_type}`,
      key: rule.rule_key,
      delta: round(delta),
      shadowDelta: round(shadowDelta),
      externalMarginalDelta: round(shadowDelta - delta),
      weight: round(productionWeight, 6),
      researchFactor: round(number(rule.research_factor, 1), 6),
      reviewFactor: round(number(rule.review_factor, 1), 6),
      profitabilityGuardApplied: profitable && productionWeight < 1,
      shadowProfitabilityGuardApplied: profitable && shadowWeight < 1,
      sample: number(rule.sample_size),
      expectancy: round(number(rule.expectancy)),
      profitFactor: round(number(rule.profit_factor)),
      evidence: rule.evidence_level || 'low',
      rationale: rule.rationale || null
    };
  });

  const rawDelta = contributions.reduce((sum, item) => sum + item.delta, 0);
  const totalDelta = round(clamp(rawDelta, -totalCap, totalCap));
  const shadowRawDelta = contributions.reduce((sum, item) => sum + item.shadowDelta, 0);
  const shadowTotalDelta = round(clamp(shadowRawDelta, -totalCap, totalCap));
  const blockers = selected
    .filter(rule => rule.action === 'block'
      && rule.evidence_level === 'high'
      && number(rule.sample_size) >= hardMin)
    .map(rule => ({
      code: 'LEARNING_HARD_BLOCK',
      ruleId: rule.id,
      component: rule.rule_type,
      key: rule.rule_key,
      current: round(number(rule.expectancy)),
      maximum: number(config.block_expectancy_max, -0.75),
      sample: number(rule.sample_size),
      reason: rule.rationale || 'Regla aprendida con evidencia alta'
    }));

  return {
    totalDelta,
    rawDelta: round(rawDelta),
    capped: round(rawDelta) !== totalDelta,
    shadow: {
      mode: 'research_external_factors',
      totalDelta: shadowTotalDelta,
      rawDelta: round(shadowRawDelta),
      marginalDelta: round(shadowTotalDelta - totalDelta),
      wouldChangeScore: shadowTotalDelta !== totalDelta
    },
    contributions,
    blockers,
    suppressed
  };
}

module.exports = {
  chooseRules,
  computeLearningBias,
  number,
  clamp,
  round
};
