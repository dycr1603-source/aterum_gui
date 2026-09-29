// Reuse Dashboard's configured Telegram destination and persistent delivery ledger.
// An execution-based key lets recovery resend a missing notice without repeating the SL move.
const outputs = [];
for (const item of $input.all()) {
  const p = item.json;
  if (!p.telegramText) {
    outputs.push({ json: { ...p, notificationStatus: 'SKIPPED_NO_TEXT' } });
    continue;
  }
  const verified = p.finalStatus === 'VERIFIED' && p.verificationResult?.verified === true
    && p.verificationResult?.exchangeVerified === true
    && p.verificationResult?.pipelineVerified === true
    && p.verificationResult?.persistenceStatus === 'VERIFIED';
  if (p.status === 'SL_UPDATED' && (!verified || !p.executionId)) {
    outputs.push({ json: { ...p, notificationStatus: 'BLOCKED_UNVERIFIED' } });
    continue;
  }
  const identity = p.executionId || `${$execution.id}:${p.symbol}`;
  const eventKey = `${p.status === 'SL_UPDATED' ? 'stop-update' : 'stop-management-failure'}:${identity}`;
  try {
    const r = await this.helpers.httpRequest({
      method: 'POST',
      url: `${process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001'}/internal/notifications/telegram`,
      headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` },
      json: true, timeout: 15000,
      body: { eventKey, text: p.telegramText, parseMode: 'HTML' }
    });
    outputs.push({ json: { ...p, notificationEventKey: eventKey,
      notificationStatus: r.status, telegramMessageId: r.messageId ?? null,
      notificationError: r.errorCode || null } });
  } catch (_) {
    console.error('[TrailingNotification] NOTIFICATION_SERVICE_UNAVAILABLE', identity);
    outputs.push({ json: { ...p, notificationEventKey: eventKey,
      notificationStatus: 'UNKNOWN', notificationError: 'NOTIFICATION_SERVICE_UNAVAILABLE' } });
  }
}
return outputs;
