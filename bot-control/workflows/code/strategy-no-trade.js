const d = $input.first().json;
const summary = d.universeSummary || {};
const labels = {
  LOW_DEPTH: 'Profundidad insuficiente',
  ABNORMAL_VOLATILITY: 'Volatilidad excesiva',
  NO_TWO_INDICATOR_SIGNAL: 'Sin señal conjunta',
  INSUFFICIENT_VOTES: 'Sin cinco votos direccionales',
  TECHNICAL_CANDIDATE: 'Candidatos técnicos',
  DIRECTION_DISABLED: 'Dirección deshabilitada',
  ALREADY_OPEN: 'Posición existente',
  MIN_LOT_RISK: 'Lote mínimo supera el riesgo',
  JEV_NO_TRADE: 'Rechazadas por JEV'
};
const counts = Object.entries(summary.reasons || {})
  .filter(([key]) => key !== 'APPROVED')
  .sort((a, b) => b[1] - a[1])
  .map(([key, count]) => `${labels[key] || key}: ${count}`);
const text = [
  'ℹ️ ATERUM · SIN ENTRADA',
  `Motor: consenso de diez indicadores · ${d.skipReason || 'NO_TRADE'}`,
  ...(d.universeSummary ? [`Analizados: ${Number(summary.scanned || 0)} de ${Number(summary.eligible || 0)} elegibles.`]
    : ['Escaneo omitido por control de estrategia.']),
  ...counts.slice(0, 6),
  'Sin orden enviada a Binance.'
].join('\n');
// A single status per hour avoids one message on every scheduled scan.
const reasonKey = String(d.skipReason || 'NO_TRADE').replace(/[^A-Z0-9_]/gi, '_').slice(0, 32);
const notificationEventKey = `strategy-summary:${reasonKey}:${Math.floor(Date.now() / 3600000)}`;
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
