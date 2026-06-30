'use strict';

const assert = require('assert');
const { persistTradeClose } = require('../routes/analytics');

function database({ status = 'OPEN', closeExists = false, exists = true } = {}) {
  const calls = [];
  let currentStatus = status;
  let hasClose = closeExists;
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT id,status FROM trades/.test(sql)) return [exists ? [{ id: 58, status: currentStatus }] : []];
      if (/SELECT id FROM trade_closes/.test(sql)) return [hasClose ? [{ id: 91 }] : []];
      if (/UPDATE trades SET status='CLOSED'/.test(sql)) { currentStatus = 'CLOSED'; return [{ affectedRows: 1 }]; }
      if (/UPDATE trade_closes SET close_reason/.test(sql)) return [{ affectedRows: 1 }];
      if (/INSERT INTO trade_closes/.test(sql)) { hasClose = true; return [{ insertId: 91 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return { db: { getConnection: async () => connection }, calls,
    state: () => ({ status: currentStatus, hasClose }) };
}

(async () => {
  const closed = database({ status: 'CLOSED', closeExists: true });
  const duplicate = await persistTradeClose(closed.db, { symbol: 'TAOUSDT' });
  assert.deepStrictEqual(duplicate, { found: true, ok: true, status: 'ok', tradeId: 58, alreadyPersisted: true });
  assert.equal(closed.calls.some(call => call.sql && /INSERT INTO trade_closes/.test(call.sql)), false);

  const repaired = database({ status: 'CLOSED', closeExists: true });
  const repairedResult = await persistTradeClose(repaired.db, { symbol: 'TAOUSDT', exchangeVerified: true,
    closeReason: 'SL', trailingStage: 'TIME_LOCK', exitPrice: 199.92 });
  assert.equal(repairedResult.alreadyPersisted, true);
  const repairWrite = repaired.calls.find(call => call.sql && /UPDATE trade_closes SET close_reason/.test(call.sql));
  assert(repairWrite, 'verified duplicate did not reconcile persisted close metadata');
  assert.deepStrictEqual(repairWrite.params.slice(0, 3), ['SL', 'TIME_LOCK', 199.92]);

  const open = database();
  const payload = { symbol: 'TAOUSDT', exitPrice: 199.92, pnlUsdt: 4.1148, pnlPct: 1.59,
    rFinal: 1.2, closeReason: 'SL', trailingStage: 'TIME_LOCK', durationMinutes: 536 };
  const first = await persistTradeClose(open.db, payload);
  assert.equal(first.alreadyPersisted, false);
  assert.deepStrictEqual(open.state(), { status: 'CLOSED', hasClose: true });
  const second = await persistTradeClose(open.db, payload);
  assert.equal(second.alreadyPersisted, true);
  const inserts = open.calls.filter(call => call.sql && /INSERT INTO trade_closes/.test(call.sql));
  assert.equal(inserts.length, 1, 'duplicate persistence inserted a second close row');
  assert.equal(inserts[0].params[7], 'TIME_LOCK');

  const absent = database({ exists: false });
  assert.deepStrictEqual(await persistTradeClose(absent.db, { symbol: 'NEVERUSDT' }), { found: false });
  console.log('trade close idempotency tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
