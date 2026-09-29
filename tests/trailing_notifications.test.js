'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { deliver } = require('../services/telegram_delivery');
const workflow = require('../bot-control/workflows/current/trailing-manager.workflow.json');
const code = fs.readFileSync(require.resolve('../bot-control/workflows/code/send-trailing-notification.js'), 'utf8').trimEnd();
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const fn = new AsyncFunction('$input', '$execution', 'process', 'console', code);
const verified = id => ({ status: 'SL_UPDATED', symbol: 'ZETAUSDT', executionId: id,
  telegramText: '🛡 Confirmado &amp; detallado', finalStatus: 'VERIFIED',
  verificationResult: { verified: true, exchangeVerified: true,
    pipelineVerified: true, persistenceStatus: 'VERIFIED' } });
async function run(items, handler) {
  return fn.call({ helpers: { httpRequest: handler } },
    { all: () => items.map(json => ({ json })) }, { id: 1 },
    { env: { EXECUTION_ENGINE_TOKEN: 'test-internal' } }, { error() {} });
}
test('workflow uses the shared ledger sender without old Telegram credentials or a fixed chat', () => {
  const node = workflow.nodes.find(n => n.name === 'Telegram: SL Updated');
  assert.equal(node.type, 'n8n-nodes-base.code');
  assert.equal(node.parameters.jsCode, code);
  assert.equal(node.credentials, undefined);
  assert.equal(node.parameters.chatId, undefined);
});
test('all positions are delivered, response is recorded and duplicate executions send only once', async () => {
  const ledger = new Map(); let messages = 0;
  const db = { execute: async (sql, p = []) => {
    if (sql.startsWith('INSERT INTO notification_deliveries')) {
      if (ledger.has(p[0])) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      ledger.set(p[0], p[1]);
    }
    if (sql.startsWith('UPDATE notification_deliveries')) ledger.set(p[3], p[0]);
    return [{}];
  } };
  const handler = async o => {
    assert.equal(o.headers.Authorization, 'Bearer test-internal');
    assert(o.url.endsWith('/internal/notifications/telegram'));
    assert.equal(o.body.parseMode, 'HTML');
    return deliver({ db, eventKey: o.body.eventKey, text: o.body.text, parseMode: o.body.parseMode,
      token: 'test', chatId: 'current-chat', fetchImpl: async (_u, a) => {
        assert.equal(JSON.parse(a.body).chat_id, 'current-chat');
        messages++;
        return { ok: true, json: async () => ({ ok: true, result: { message_id: messages } }) };
      } });
  };
  const items = [verified('event-1'), { ...verified('event-2'), symbol: 'SIRENUSDT' }];
  const first = await run(items, handler);
  assert(first.every(x => x.json.notificationStatus === 'SENT'));
  assert(first.every(x => x.json.telegramMessageId));
  assert(first[0].json.notificationEventKey === 'stop-update:event-1');
  const replay = await run(items, handler);
  assert(replay.every(x => x.json.notificationStatus === 'DUPLICATE'));
  assert.equal(messages, 2);
});
test('unverified updates and monitoring never announce success', async () => {
  let calls = 0;
  const handler = async () => { calls++; };
  const items = [{ ...verified('x'), finalStatus: 'FAILED' },
    { ...verified('y'), verificationResult: { verified: true } },
    { ...verified(null) }, { status: 'monitoring', telegramText: null }];
  const r = await run(items, handler);
  assert.equal(calls, 0);
  assert(r.slice(0, 3).every(x => x.json.notificationStatus === 'BLOCKED_UNVERIFIED'));
  assert.equal(r[3].json.notificationStatus, 'SKIPPED_NO_TEXT');
});
test('delivery rejection or uncertainty is returned without changing the verified SL result', async () => {
  for (const handler of [async () => ({ status: 'FAILED', errorCode: 'TELEGRAM_REJECTED_400' }),
    async () => { throw new Error('secret-containing transport error'); }]) {
    const [r] = await run([verified('x')], handler);
    assert(['FAILED', 'UNKNOWN'].includes(r.json.notificationStatus));
    assert.equal(r.json.finalStatus, 'VERIFIED');
    assert.equal(r.json.verificationResult.pipelineVerified, true);
    assert(!JSON.stringify(r).includes('secret-containing'));
  }
});
