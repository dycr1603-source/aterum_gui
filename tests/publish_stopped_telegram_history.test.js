'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishStopped } = require('../scripts/publish-stopped-telegram-history');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-stopped-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const inhibitFile = path.join(dir, 'inhibited'); fs.writeFileSync(inhibitFile, 'retired');
  const calls = [];
  const controller = { inhibitFile, state: () => ({ mode: 'RETIRED' }), containers: async () => [],
    compose: async args => { calls.push(args); return ''; }, healthy: async services => { calls.push(['healthy', ...services]); } };
  const sync = { register: async () => calls.push(['register']),
    registeredRecipients: async () => ({ a: 'public-a', b: 'public-b' }),
    stage: async () => { calls.push(['stage']); return { audit: 2, deliveries: 1 }; },
    publish: async () => calls.push(['publish']) };
  return { controller, sync, calls };
}

test('retired-host recovery starts only MariaDB, publishes and stops it', async t => {
  const { controller, sync, calls } = fixture(t);
  const result = await publishStopped({ controller, sync,
    exporter: async () => { calls.push(['export']); return {}; } });
  assert.deepEqual(result, { audit: 2, deliveries: 1 });
  assert.deepEqual(calls.filter(args => args[0] === 'up'), [['up', '-d', 'mysql']]);
  assert(calls.findIndex(args => args[0] === 'export') < calls.findIndex(args => args[0] === 'publish'));
  assert.deepEqual(calls.at(-1), ['stop', '--timeout', '-1', 'mysql']);
  assert(calls.every(args => !args.includes('n8n') && !args.includes('telegram_control') && !args.includes('position_guard')));
});

test('active host is rejected; export failure still stops MariaDB', async t => {
  const { controller, sync, calls } = fixture(t);
  controller.containers = async () => [{ service: 'n8n', running: true }];
  await assert.rejects(publishStopped({ controller, sync }), /ALL_SERVICES_STOPPED/);
  assert.equal(calls.length, 0);
  controller.containers = async () => [];
  await assert.rejects(publishStopped({ controller, sync, exporter: async () => { throw new Error('db failed'); } }), /db failed/);
  assert.deepEqual(calls.at(-1), ['stop', '--timeout', '-1', 'mysql']);
});
