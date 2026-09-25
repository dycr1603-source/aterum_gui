'use strict';
const { createHash } = require('crypto');

// Reserve before sending: Telegram has no idempotency key. Ambiguous deliveries
// remain UNKNOWN and are never automatically resent.
async function ensureTable(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS notification_deliveries (
    event_key VARCHAR(64) PRIMARY KEY, status VARCHAR(24) NOT NULL,
    message_id BIGINT NULL, error_code VARCHAR(80) NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
}
async function deliver({ db, eventKey, text, token, chatId, fetchImpl = fetch, parseMode }) {
  await ensureTable(db);
  const key = createHash('sha256').update(String(eventKey)).digest('hex');
  try { await db.execute('INSERT INTO notification_deliveries (event_key,status) VALUES (?,?)', [key, 'UNKNOWN']); }
  catch (error) { if (error.code === 'ER_DUP_ENTRY') return { status: 'DUPLICATE', sent: false }; throw error; }
  let status = 'FAILED', errorCode = null, messageId = null;
  try {
    if (!token || !chatId) throw new Error('NOT_CONFIGURED');
    if (typeof text !== 'string' || !text.trim() || text.length > 4096) throw new Error('INVALID_TEXT');
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}), disable_web_page_preview: true })
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true || !Number.isInteger(body.result?.message_id)) {
      errorCode = `TELEGRAM_REJECTED_${Number(body?.error_code || response.status) || 0}`;
    } else { status = 'SENT'; messageId = body.result.message_id; }
  } catch (error) {
    // Never persist raw fetch errors: they can contain the token-bearing URL.
    errorCode = ['NOT_CONFIGURED', 'INVALID_TEXT'].includes(error.message) ? error.message : 'DELIVERY_UNKNOWN';
    if (errorCode === 'DELIVERY_UNKNOWN') status = 'UNKNOWN';
  }
  await db.execute('UPDATE notification_deliveries SET status=?,message_id=?,error_code=?,updated_at=NOW(3) WHERE event_key=?',
    [status, messageId, errorCode, key]);
  if (errorCode) console.error('[TelegramDelivery]', key, errorCode);
  return { status, sent: status === 'SENT', messageId, errorCode };
}
module.exports = { deliver, ensureTable };
