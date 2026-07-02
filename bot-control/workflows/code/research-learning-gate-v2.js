const d = $input.first().json;
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
const setupLabel = d.setupLabel || [d.aiResult?.regime || 'N/A', d.tf4h?.status || 'N/A', d.marketContext?.market_bias || 'N/A'].join(' / ');

let decision;
try {
  decision = await this.helpers.httpRequest({
    method: 'POST',
    url: `${DASHBOARD}/api/learning/decision`,
    json: true,
    body: {
      symbol: d.symbol,
      direction: d.direction,
      setup: setupLabel,
      regime: d.aiResult?.regime || d.regime || 'N/A',
      baseScore: Number(d.technicalScore || d.score || 0),
      requiredScore: Number(d.dynamicThreshold || 65),
      incomingAllowed: true,
      incomingReason: null,
      balance: Number(d.balance || 0),
      entryTime: new Date().toISOString(),
      policyVersion: d.policyVersion,
      opportunityCycleId: d.opportunityCycleId,
      technicalContributions: (d.contributionTable || []).filter(item => !String(item.component || '').startsWith('learning.')),
      capitalAlreadyChecked: true,
      dryRun: false
    }
  });
} catch (error) {
  return [{ json: {
    ...d,
    passAI: false,
    skipReason: `LEARNING_SERVICE_UNAVAILABLE: ${error.message}`,
    learningDecision: { allowed: false, action: 'HALT', primaryReason: 'LEARNING_SERVICE_UNAVAILABLE', reason: error.message }
  } }];
}

const passAI = decision.allowed === true;
console.log(`[EntryGateV2] ${d.symbol} pass=${passAI} base=${decision.baseScore} learning=${decision.scoreDelta} final=${decision.finalScore} threshold=${decision.requiredScore} margin=${decision.decisionMargin}`);
return [{ json: {
  ...d,
  baseAiScore: decision.baseScore,
  finalScore: decision.finalScore,
  passAI,
  skipReason: passAI ? null : `${decision.primaryReason}: ${decision.reason}`,
  setupLabel,
  policyVersion: decision.scoreTrace?.policyVersion || d.policyVersion,
  scoreTrace: decision.scoreTrace,
  learningDecision: decision,
  decisionExplanation: {
    primaryReason: decision.primaryReason,
    secondaryReasons: decision.secondaryReasons,
    threshold: decision.requiredScore,
    score: decision.finalScore,
    margin: decision.decisionMargin,
    contributions: decision.scoreTrace?.contributions || []
  }
} }];
