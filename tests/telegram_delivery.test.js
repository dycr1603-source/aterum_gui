'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve(__dirname,
  '../bot-control/workflows/code/send-telegram-notification-v1.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

async function run(input) {
  const calls = [];
  const fn = new AsyncFunction('$input', 'process', code);
  const output = await fn.call({ helpers: { httpRequest: async options => {
    calls.push(options);
    return { ok: true, result: { message_id: 42 } };
  } } }, { first: () => ({ json: input }) }, { env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: 'chat' } });
  return { result: output[0].json, calls };
}

(async () => {
  const sent = await run({ text: '✅ Trade opened' });
  assert.equal(sent.result.notificationStatus, 'SENT');
  assert.equal(sent.result.telegramMessageId, 42);
  assert.equal(sent.calls[0].body.text, '✅ Trade opened');
  assert.equal(sent.calls[0].body.parse_mode, 'HTML');

  const skipped = await run({ telegramText: null });
  assert.equal(skipped.result.notificationStatus, 'SKIPPED_NO_TEXT');
  assert.equal(skipped.calls.length, 0);
  console.log('telegram delivery tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
