const payload = $input.first().json;
const reason = payload.riskDecision?.primaryReason || {};
const capacity = payload.portfolioCapacity || {};
const code = String(reason.code || 'RISK_REJECTED');
const detail = String(reason.reason || payload.haltReason || 'El control de riesgo rechazó la evaluación.').replace(/\s+/g, ' ').slice(0, 500);
const available = Number(payload.availableBalance ?? capacity.account?.availableMargin);
const minimum = Number(capacity.limits?.minimumTradeMargin);
const sideEmoji = '⚠️';
const lines = [
  '⚠️ OPERACIÓN NO EVALUADA',
  '',
  `Motivo: control de riesgo`,
  `Código: ${code}`,
  `Detalle: ${detail}`,
  Number.isFinite(available) ? `Margen disponible: ${available.toFixed(4)} USDT` : null,
  Number.isFinite(minimum) ? `Mínimo configurado: ${minimum.toFixed(2)} USDT` : null,
  '',
  'Jev no fue consultado y no se envió ninguna orden a Binance.'
].filter(Boolean);
const telegramText = buildClosingBox(lines).join('\n').replace(/^┃/gm, '┃');
const notificationEventKey = `risk-halt:${code}:${Math.floor(Date.now() / 300000)}`;
try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001'}/internal/notifications/telegram`,
    json: true,
    timeout: 15000,
    headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` },
    body: { eventKey: notificationEventKey, text: telegramText }
  });
  return [{ json: { ...payload, telegramText, notificationEventKey, notificationStatus: response.status, telegramMessageId: response.messageId ?? null } }];
} catch (_) {
  return [{ json: { ...payload, telegramText, notificationEventKey, notificationStatus: 'UNKNOWN', notificationError: 'NOTIFICATION_SERVICE_UNAVAILABLE' } }];
}
