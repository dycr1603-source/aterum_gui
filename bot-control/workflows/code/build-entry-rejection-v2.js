const d = $input.first().json;
const decision = d.decisionExplanation || {};
const learning = d.learningDecision || {};
const indicators = d.indicators || {};
const threshold = Number(decision.threshold ?? d.dynamicThreshold ?? 65);
const score = Number(decision.score ?? d.finalScore ?? 0);
const margin = Number(decision.margin ?? score - threshold);
const reason = d.skipReason || learning.reason || 'Rechazo sin motivo';
const contributions = Array.isArray(decision.contributions) ? decision.contributions : [];

function clean(value, max = 220) {
  return String(value || 'N/D').replace(/[<>_*[\]()~`#+|{}.!\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function signed(value) {
  const current = Number(value || 0);
  return `${current >= 0 ? '+' : ''}${current.toFixed(1)}`;
}

const primary = decision.primaryReason || learning.primaryReason || 'ENTRY_REJECTED';
const visibleContributions = contributions
  .filter(item => Number(item.value ?? item.delta ?? 0) !== 0)
  .slice(0, 10)
  .map(item => `- ${clean(item.component, 40)}: ${signed(item.value ?? item.delta)} (${clean(item.evidence || item.key, 70)})`);

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:3001/db/rejection',
    json: true,
    body: {
      ...d,
      symbol: d.symbol,
      skipReason: `${primary}: ${reason}`,
      finalScore: score,
      tf4hStatus: d.tf4h?.status || null,
      macroBias: d.marketContext?.market_bias || null,
      fearGreed: d.marketContext?.fearGreed?.value || null,
      entryReason: reason,
      setupLabel: d.setupLabel || null
    }
  });
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:3001/db/scan',
    json: true,
    body: {
      symbol: d.symbol,
      scanScore: d.scanScore,
      direction: d.direction,
      finalScore: score,
      longScore: d.longScore,
      shortScore: d.shortScore,
      passAI: false,
      skipReason: `${primary}: ${reason}`,
      indicators,
      volume24h: d.volume24h,
      priceChangePct: d.priceChangePct,
      openInterest: d.openInterest
    }
  });
} catch (error) {
  console.log('[EntryRejectionV2] telemetry:', error.message);
}

const text = [
  'ENTRY REJECTED',
  '',
  `${d.symbol || 'N/D'} ${d.direction || 'NEUTRAL'}`,
  `Primary reason: ${clean(primary, 100)}`,
  `Detail: ${clean(reason)}`,
  `Score: ${score.toFixed(1)}`,
  `Threshold: ${threshold.toFixed(1)}`,
  `Margin: ${signed(margin)}`,
  '',
  'Contributions:',
  ...(visibleContributions.length ? visibleContributions : ['- No persisted contributions']),
  '',
  `Cycle: ${d.opportunityCycleId || 'N/D'}`,
  'No cooldown was created by this rejection.'
].join('\n');

return [{ json: { text } }];
