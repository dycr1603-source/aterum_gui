'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { transfer } = require('../scripts/telegram-sync-db');
const { TelegramHistorySync, seal, open } = require('../services/telegram_history_sync');

const audit = { update_id: '427', user_id: '1254740120', chat_id: '1254740120',
  command: 'ask', request_text: 'Soy Saitama', response: 'Hola', duration_ms: 1,
  result: 'ok', created_at: '2026-10-01 00:00:00' };
const delivery = { event_key: 'a'.repeat(64), status: 'SENT', message_id: '321',
  chat_id: '-1003222176229', message_text: 'Orden confirmada',
  created_at: '2026-10-01 00:00:00.000', updated_at: '2026-10-01 00:00:00.000' };
const snapshot = { schema: 'aterum-telegram-history-v1', sourceHost: 'a'.repeat(64),
  audit: [audit], deliveries: [delivery] };

function fakeDb() {
  const audits = new Map(), deliveries = new Map(), syncedDeliveries = new Map();
  return {
    audits, deliveries, syncedDeliveries,
    async query(sql) {
      if (sql.includes('SELECT') && sql.includes('FROM telegram_audit')) return [[...audits.values()]];
      if (sql.includes('SELECT') && sql.includes('FROM notification_deliveries')) return [[...deliveries.values()]];
      return [[]];
    },
    async execute(sql, values) {
      if (sql.startsWith('INSERT IGNORE INTO telegram_audit')) {
        const key = String(values[0]); if (audits.has(key)) return [{ affectedRows: 0 }];
        audits.set(key, { ...audit, update_id: key }); return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT IGNORE INTO telegram_synced_deliveries')) {
        const key = String(values[0]) + ':' + String(values[1]); if (syncedDeliveries.has(key)) return [{ affectedRows: 0 }];
        syncedDeliveries.set(key, { ...delivery, event_key: key }); return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}
  };
}

test('import merges audit and delivery IDs idempotently without re-sending Telegram', async () => {
  const db = fakeDb();
  assert.deepEqual(await transfer(db, 'import', snapshot), { auditAdded: 1, deliveriesAdded: 1 });
  assert.deepEqual(await transfer(db, 'import', snapshot), { auditAdded: 0, deliveriesAdded: 0 });
  const exported = await transfer(db, 'export');
  assert.equal(exported.audit[0].request_text, 'Soy Saitama');
  assert.equal(exported.deliveries.length, 0); // Imported history does not alter the active sender ledger.
  assert.equal(db.syncedDeliveries.size, 1);
});

test('Git handoff contains only authenticated ciphertext and a second host imports it once', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-telegram-history-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bare = path.join(dir, 'remote.git'), root = path.join(dir, 'root');
  execFileSync('git', ['init', '--bare', '--quiet', bare]);
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', bare]);
  const make = (hostId, transferFn) => new TelegramHistorySync({ root,
    directory: path.join(dir, hostId), hostId,
    compose: async () => 'dashboard-id', transfer: transferFn });
  const source = make('a'.repeat(64), async (_, mode) => {
    assert.equal(mode, 'export'); return { ...snapshot, sourceHost: undefined };
  });
  let imports = 0;
  const target = make('b'.repeat(64), async (_, mode, body) => {
    assert.equal(mode, 'import'); assert.deepEqual(JSON.parse(body), snapshot);
    imports++; return { auditAdded: imports === 1 ? 1 : 0, deliveriesAdded: imports === 1 ? 1 : 0 };
  });
  await source.register();
  await target.register();
  await source.capture();
  await source.publish();
  const ciphertext = execFileSync('git', ['--git-dir', bare, 'show',
    `refs/heads/aterum-telegram-history:snapshots/${'a'.repeat(64)}.enc`], { encoding: 'utf8' });
  assert.doesNotMatch(ciphertext, /Soy Saitama|Orden confirmada/);
  assert.deepEqual(open(ciphertext, target.privateKey(), target.hostId), snapshot);
  assert.throws(() => open(ciphertext, source.privateKey(), target.hostId));
  assert.deepEqual(await target.pull(), { snapshots: 1, auditAdded: 1, deliveriesAdded: 1 });
  assert.deepEqual(await target.pull(), { snapshots: 1, auditAdded: 0, deliveriesAdded: 0 });
  assert.equal(imports, 2);
  assert.equal(fs.existsSync(source.pendingFile), false);
  assert.doesNotMatch(seal(snapshot, { [source.hostId]: source.publicKey(),
    [target.hostId]: target.publicKey() }), /Soy Saitama/);
  assert.equal(fs.statSync(source.privateKeyFile).mode & 0o777, 0o600);
});
