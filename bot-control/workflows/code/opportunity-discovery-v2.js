const d = $input.first().json;
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';

let result;
try {
  result = await this.helpers.httpRequest({
    method: 'POST',
    url: `${DASHBOARD}/api/opportunities/scan`,
    json: true,
    body: {
      openCount: Number(d.openCount || 0),
      openSymbols: d.openSymbols || [],
      openPositions: d.openPositions || [],
      balance: Number(d.balance || 0),
      portfolioCapacity: d.portfolioCapacity || null,
      marketContext: d.marketContext || {}
    },
    timeout: 120000
  });
} catch (error) {
  return [{ json: {
    ...d,
    noSetup: true,
    reason: `OPPORTUNITY_SCAN_FAILED: ${error.message}`,
    opportunityDecision: { primaryReason: { code: 'MARKET_DISCOVERY_UNAVAILABLE', reason: error.message } }
  } }];
}

if (!result.selected) {
  const best = result.ranking?.[0];
  return [{ json: {
    ...d,
    noSetup: true,
    reason: best
      ? `Sin oportunidad elegible: ${best.symbol} score=${best.finalScore}/${best.threshold} motivo=${best.primaryReason}`
      : `Sin candidatos profundos en ciclo ${result.cycleId}`,
    opportunityCycle: result,
    opportunityDecision: best || null
  } }];
}

const selected = result.selected;
console.log(`[OpportunityV2] cycle=${result.cycleId} selected=${selected.symbol} rank=${selected.rank} score=${selected.finalScore}/${selected.threshold}`);
return [{ json: {
  ...d,
  ...selected,
  score: selected.technicalScore,
  finalScore: selected.finalScore,
  direction: selected.direction,
  noSetup: false,
  dynamicThreshold: selected.threshold,
  setupLabel: selected.setupLabel,
  aiResult: {
    regime: selected.regime,
    direction_bias: selected.direction,
    recommended_leverage: 5,
    confidence_adjustment: 0,
    key_risk: selected.hardBlockers?.[0]?.code || 'none',
    reasoning: 'Selección determinista por ranking de portfolio'
  },
  slMultiplier: 1.5,
  tpMultiplier: 2,
  riskReduction: 0,
  leverageOverride: null,
  opportunityCycleId: result.cycleId,
  opportunityUniverse: result.universe,
  opportunityRanking: result.ranking,
  opportunityDecision: selected,
  contributionTable: selected.contributionTable
} }];
