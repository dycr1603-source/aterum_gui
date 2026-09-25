const payload = $input.first().json;
const text = String(payload.telegramText ?? payload.text ?? '').trim();
if (!text) return [{ json: { ...payload, notificationStatus: 'SKIPPED_NO_TEXT' } }];
const crypto = require('crypto');
// `$node.name` is interpreted by n8n as a lookup for a node named "name".
// Keep a stable sender identity instead of resolving the current node at runtime.
const kind = 'telegram-delivery';
const runId = typeof $execution !== 'undefined' ? $execution.id : 'unknown';
const identity = payload.executionId || payload.jev?.id || payload.opportunityCycleId || runId;
const digest = crypto.createHash('sha256').update(text).digest('hex');
const eventKey = payload.notificationEventKey || `${kind}:${identity}:${digest}`;
try {
  const response = await this.helpers.httpRequest({
    method: 'POST', url: `${process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001'}/internal/notifications/telegram`,
    json: true, timeout: 15000, headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` },
    body: { eventKey, text }
  });
  return [{ json: { ...payload, notificationStatus: response.status,
    telegramMessageId: response.messageId ?? null, notificationError: response.errorCode || null } }];
} catch (_) {
  console.error('[TelegramDelivery] NOTIFICATION_SERVICE_UNAVAILABLE', identity);
  return [{ json: { ...payload, notificationStatus: 'UNKNOWN', notificationError: 'NOTIFICATION_SERVICE_UNAVAILABLE' } }];
}
