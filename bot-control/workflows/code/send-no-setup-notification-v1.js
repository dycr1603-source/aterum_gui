const payload = $input.first().json;
const cycle = payload.opportunityCycle || {};
const capacity = cycle.portfolioCapacity || payload.portfolioCapacity || {};
const dynamicSlots = Number(capacity.dynamicAdditionalPositions);
const remainingRisk = Number(capacity.remainingRiskPct ?? capacity.risk?.remainingRiskPct);
const reason = String(payload.reason || 'No hubo un candidato elegible en este ciclo.').replace(/\s+/g, ' ').slice(0, 500);
const sideEmoji = 'ℹ️';
const lines = [
  'ℹ️ SIN PROPUESTA PARA JEV',
  '',
  reason,
  Number.isFinite(dynamicSlots) ? `Nuevas posiciones permitidas: ${dynamicSlots}` : null,
  Number.isFinite(remainingRisk) ? `Riesgo de cartera restante: ${remainingRisk.toFixed(2)}%` : null,
  '',
  'Jev no fue consultado y no se envió ninguna orden a Binance.'
].filter(Boolean);
const telegramText = buildClosingBox(lines).join('\n').replace(/^┃/gm, '┃');
const notificationEventKey = `no-setup:${cycle.cycleId || 'unknown'}`;
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
