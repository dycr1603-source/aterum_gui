const d = $input.first().json;
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
// Dashboard owns feature flags. Failure to consult it always blocks this entry.
const { opportunityRanking, opportunityUniverse, opportunityCycle, ...context } = d;
let jev;
try {
  jev = await this.helpers.httpRequest({ method: 'POST', url: `${DASHBOARD}/internal/jev/evaluate`,
    json: true, timeout: 30000, headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` }, body: context });
} catch (_) {
  jev = { enabled: true, mode: 'enforce', decision: 'NO_TRADE', reason: 'JEV_SERVICE_UNAVAILABLE' };
}
if (jev.enabled === false) return [{ json: d }];
if (jev.mode === 'observe') return [{ json: { ...d, jev } }];
if (!['LONG', 'SHORT'].includes(jev.decision) || !jev.proposal || !jev.context || jev.symbol !== d.symbol) {
  return [{ json: { ...d, jev, passAI: false, skipReason: jev.reason || 'JEV_INVALID_RESPONSE', jevBlocked: true } }];
}
return [{ json: { ...d, ...jev.context, jev, direction: jev.decision,
  decisionAuthority: 'JEV',
  indicators: { ...jev.context.indicators, currentPrice: jev.proposal.entry } } }];
