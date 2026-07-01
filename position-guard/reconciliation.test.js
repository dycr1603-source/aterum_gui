'use strict';

const assert = require('assert');
const { PositionGuard, classifyClosingOrder } = require('./guard');
const { ExecutionEngine, externalCloseExecutionId } = require('./execution-engine');

(async () => {
  const regular = [{ orderId: '9001', type: 'MARKET', side: 'BUY' }];
  const stop = [{ algoId: '7001', actualOrderId: '9001', orderType: 'STOP_MARKET' }];
  const tp = [{ algoId: '7002', actualOrderId: '9001', orderType: 'TAKE_PROFIT_MARKET' }];
  assert.equal(classifyClosingOrder(regular, stop, '9001').closeReason, 'SL');
  assert.equal(classifyClosingOrder(regular, tp, '9001').closeReason, 'TP');
  assert.equal(classifyClosingOrder(regular, [], '9001').closeReason, 'MANUAL');

  const events = [];
  let openAlgos = [{ symbol: 'TAOUSDT', side: 'BUY', positionSide: 'SHORT', algoId: '3002',
    orderType: 'TAKE_PROFIT_MARKET', algoStatus: 'NEW', triggerPrice: '197.28' }];
  const guard = new PositionGuard({ config: {}, db: {}, executionEngine: {}, binance: {
    openOrders: async () => [], openAlgoOrders: async () => openAlgos,
    cancelAlgoOrder: async algoId => { openAlgos = openAlgos.filter(order => order.algoId !== algoId); return { algoId, status: 'CANCELED' }; }
  } });
  guard.event = async event => events.push(event);
  const cleanup = await guard.cleanupOrphanProtection({ symbol: 'TAOUSDT', direction: 'SHORT' });
  assert.equal(cleanup.verified, true);
  assert.equal(cleanup.cancelled[0].orderId, '3002');
  assert.deepStrictEqual(cleanup.remaining, []);
  assert.equal(events.at(-1).actionStatus, 'VERIFIED');

  const id1 = externalCloseExecutionId('TAOUSDT', 'SHORT', '11775207017');
  const id2 = externalCloseExecutionId('TAOUSDT', 'SHORT', '11775207017');
  assert.equal(id1, id2, 'duplicate reconciliation did not produce an idempotent execution ID');
  assert.match(id1, /^[0-9a-f-]{36}$/);

  const auditWrites = [];
  const auditDb = { execute: async (sql, params) => {
    auditWrites.push({ sql, params });
    if (/SELECT execution_id FROM trade_executions/.test(sql)) {
      return [[{ execution_id: '16446462-ebc2-473a-ba74-f44d980744b4' }]];
    }
    return [{ affectedRows: 1 }];
  } };
  const audit = new ExecutionEngine({ config: {}, db: auditDb, binance: {} });
  const auditInput = { symbol: 'TAOUSDT', positionSide: 'SHORT', exchangeOrderId: '11775207017',
    protectiveOrderId: '3000001998111891', exchangeResponse: { order: stop[0] },
    verificationResult: { verified: true }, persistenceStatus: 'VERIFIED',
    cleanup: { verified: true, remaining: [] } };
  const auditFirst = await audit.recordExternalClose(auditInput);
  const auditDuplicate = await audit.recordExternalClose(auditInput);
  assert.equal(auditFirst.executionId, auditDuplicate.executionId);
  assert.equal(auditFirst.correlationId, '16446462-ebc2-473a-ba74-f44d980744b4');
  assert(auditWrites.some(write => /ON DUPLICATE KEY UPDATE/.test(write.sql)), 'reconciliation record is not idempotent');

  const inserts = [];
  const reconciliationPhases = [];
  let remainingTp = [{ symbol: 'TAOUSDT', side: 'BUY', positionSide: 'SHORT', algoId: '3003',
    orderType: 'TAKE_PROFIT_MARKET', algoStatus: 'NEW', triggerPrice: '197.28' }];
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    execute: async (sql, params) => {
      if (/SELECT id FROM trade_closes/.test(sql)) return [[]];
      if (/INSERT INTO trade_closes/.test(sql)) { inserts.push(params); return [{ insertId: 92 }]; }
      if (/UPDATE trades SET status='CLOSED'/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL ${sql}`);
    } };
  const fullGuard = new PositionGuard({ config: { dashboardBase: 'http://dashboard:3001' },
    db: { getConnection: async () => connection },
    executionEngine: { finalizeExternalClose: async input => {
      reconciliationPhases.push(input.persistenceStatus);
      return { executionId: id1, correlationId: '16446462-ebc2-473a-ba74-f44d980744b4',
        cleanup: { verified: true }, notification: { owner: true, sent: true } };
    } },
    binance: {
      allOrders: async () => regular,
      allAlgoOrders: async () => stop,
      userTrades: async () => [{ orderId: '9001', side: 'BUY', qty: '1.27', price: '199.92',
        realizedPnl: '4.1148', time: Date.now() - 1000 }],
      openOrders: async () => [], openAlgoOrders: async () => remainingTp,
      cancelAlgoOrder: async algoId => { remainingTp = []; return { algoId, status: 'CANCELED' }; }
    } });
  fullGuard.event = async () => {};
  fullGuard.alert = async () => true;
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true });
  try {
    const result = await fullGuard.reconcileClosed({ id: 58, symbol: 'TAOUSDT', direction: 'SHORT',
      entry_price: 203.16, initial_sl_price: 205.86, sl_price: 199.91, qty: 1.27,
      trailing_stage: 'TIME_LOCK', opened_at: new Date(Date.now() - 9 * 3600000) });
    assert.equal(result.closeReason, 'SL');
    assert.equal(result.cleanup.verified, true);
    assert.equal(reconciliationPhases.length, 1);
    assert.equal(reconciliationPhases[0], undefined);
    assert.equal(result.notification.sent, true);
    assert.equal(inserts.length, 0, 'Position Guard persisted analytics outside the lifecycle owner');
  } finally { global.fetch = originalFetch; }
  console.log('position guard reconciliation tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
