const d = $input.first().json;
const summary = d.universeSummary || {};
const labels = {
  LOW_DEPTH: 'Profundidad insuficiente',
  ABNORMAL_VOLATILITY: 'Volatilidad excesiva',
  NO_TWO_INDICATOR_SIGNAL: 'Sin señal conjunta',
  NO_NEW_OPPORTUNITY_SIGNAL: 'Sin señal del modelo nuevo',
  INSUFFICIENT_VOTES: 'Sin cinco votos direccionales',
  TECHNICAL_CANDIDATE: 'Candidatos técnicos',
  DIRECTION_DISABLED: 'Dirección deshabilitada',
  ALREADY_OPEN: 'Posición existente',
  REENTRY_COOLDOWN: 'Reentrada en espera',
  MIN_LOT_RISK: 'Lote mínimo supera el riesgo',
  JEV_NO_TRADE: 'Rechazadas por JEV'
};
const counts = Object.entries(summary.reasons || {})
  .filter(([key]) => key !== 'APPROVED')
  .sort((a, b) => b[1] - a[1])
  .map(([key, count]) => `${labels[key] || key}: ${count}`);
const finalists = (summary.checked || [])
  .filter(item => item.reasons?.includes('JEV_NO_TRADE'))
  .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
  .slice(0, 3)
  .map(item => `${item.symbol}: JEV ${item.jevExplanationCode || item.jevReason || 'NO_TRADE'}`
    + (Number.isFinite(item.jevConfidence) ? `, confianza ${item.jevConfidence}` : '')
    + `, score ${Number(item.score || 0).toFixed(3)}`);
const additionalSlot = Number(d.strategySlot) > 1;
const text = [
  additionalSlot ? 'ℹ️ ATERUM · SIN ENTRADA ADICIONAL' : 'ℹ️ ATERUM · SIN ENTRADA',
  ...(additionalSlot ? [`Cupo evaluado: ${Number(d.strategySlot)} de 3; una entrada anterior de este recorrido ya fue confirmada.`] : []),
  `Motor: ${d.entryMode === 'new_opportunistic' ? 'modelo oportunista' :
    d.entryMode === 'consensus10' ? 'consenso de diez indicadores' :
    'estrategia técnica'} · ${d.skipReason || 'NO_TRADE'}`,
  ...(d.universeSummary ? [`Analizados: ${Number(summary.scanned || 0)} de ${Number(summary.eligible || 0)} elegibles.`]
    : ['Escaneo omitido por control de estrategia.']),
  ...(d.universeSummary ? [`Aptos para JEV: ${Number(summary.marketQualified || 0)}.`] : []),
  ...counts.slice(0, 6),
  ...(finalists.length ? ['Mejores candidatos descartados:', ...finalists] : []),
  additionalSlot ? 'No se envió otra orden a Binance en este cupo.' : 'Sin orden enviada a Binance.'
].join('\n');
// One report per actual strategy cycle. Replays of the same cycle stay idempotent.
const reasonKey = String(d.skipReason || 'NO_TRADE').replace(/[^A-Z0-9_]/gi, '_').slice(0, 32);
const cycleId = String(d.opportunityCycleId || (typeof $execution !== 'undefined' ? $execution.id : null)
  || `${reasonKey}:${Math.floor(Date.now() / 60000)}`)
  .replace(/[^A-Z0-9:_-]/gi, '_').slice(0, 100);
const notificationEventKey = `strategy-summary:${cycleId}`;
try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001'}/internal/notifications/telegram`,
    json: true,
    timeout: 15000,
    headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` },
    body: { eventKey: notificationEventKey, text }
  });
  return [{ json: { ...d, notificationEventKey, notificationStatus: response.status } }];
} catch (_) {
  return [{ json: { ...d, notificationEventKey, notificationStatus: 'UNKNOWN',
    notificationError: 'NOTIFICATION_SERVICE_UNAVAILABLE' } }];
}
