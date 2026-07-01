'use strict';

const assert = require('assert');
const { ExecutionEngine } = require('./execution-engine');

(async () => {
  const state = { closeId: null, lifecycleId: null, notificationStatus: null, inserts: 0, sends: 0, publishes: 0 };
  const trade = { id: 59, symbol: 'ICPUSDT', direction: 'SHORT', status: 'OPEN', entry_price: 2.11,
    initial_sl_price: 2.146, sl_price: 2.076, qty: 102, trailing_stage: 'TIME_LOCK',
    opened_at: new Date('2026-06-30T14:00:20.814Z') };
  let transactionTail = Promise.resolve();
  const makeConnection = () => {
    let releaseTransaction;
    return { beginTransaction: async () => {
      const previous = transactionTail;
      transactionTail = new Promise(resolve => { releaseTransaction = resolve; });
      await previous;
    }, commit: async () => releaseTransaction(), rollback: async () => releaseTransaction(), release() {},
      execute: async (sql, params) => {
        if (/SELECT id FROM trades WHERE id=/.test(sql)) return [[{ id: trade.id }]];
        if (/SELECT id FROM trade_closes/.test(sql)) return [state.closeId ? [{ id: state.closeId }] : []];
        if (/INSERT INTO trade_closes/.test(sql)) { state.closeId = 77; state.inserts++; return [{ insertId: 77 }]; }
        if (/UPDATE trade_closes|UPDATE trades SET status/.test(sql)) return [{ affectedRows: 1 }];
        if (/INSERT IGNORE INTO trade_lifecycle_events/.test(sql)) {
          if (!state.lifecycleId) { state.lifecycleId = 88; state.notificationStatus = 'PENDING'; }
          return [{ affectedRows: 1 }];
        }
        if (/SELECT id FROM trade_lifecycle_events/.test(sql)) return [[{ id: state.lifecycleId }]];
        throw new Error(`Unexpected transaction SQL: ${sql}`);
      } };
  };
  const db = {
    getConnection: async () => makeConnection(),
    execute: async (sql, params) => {
      if (/SELECT \* FROM trades/.test(sql)) return [[trade]];
      if (/SET event_payload=/.test(sql)) return [{ affectedRows: 1 }];
      if (/SET notification_status='SENDING'/.test(sql)) {
        if (state.notificationStatus !== 'PENDING') return [{ affectedRows: 0 }];
        state.notificationStatus = 'SENDING'; return [{ affectedRows: 1 }];
      }
      if (/SET notification_status='SENT'/.test(sql)) { state.notificationStatus = 'SENT'; return [{ affectedRows: 1 }]; }
      if (/SET notification_status='FAILED'/.test(sql)) { state.notificationStatus = 'FAILED'; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected DB SQL: ${sql}`);
    }
  };
  const engine = new ExecutionEngine({ config: { telegramToken: 'token', telegramChatId: 'chat' }, db, binance: {} });
  engine.recordExternalClose = async input => ({ executionId: 'b14a71e7-1776-4e78-b811-9dc68c8b190d',
    correlationId: '4974d498-7e6e-4c10-9de3-f28aeed14a09',
    verificationResult: { verified: true, persistenceStatus: input.persistenceStatus } });
  engine.cleanupVerifiedClose = async () => ({ verified: true, cancellations: [], remaining: [] });
  engine.publishFinalizedClose = async () => { state.publishes++; };
  engine.removeFinalizedMonitorState = async () => {};
  engine.sendCanonicalClose = async close => { state.sends++; assert.equal(close.trailingStage, 'TIME_LOCK'); return { messageId: 123 }; };
  const evidence = { symbol: 'ICPUSDT', positionSide: 'SHORT', exchangeOrderId: '7105080109',
    protectiveOrderId: '3000001999639611', exchangeResponse: {}, verificationResult: { verified: true },
    closeReason: 'SL', exitPrice: 2.076, pnl: 3.468, rFinal: 0.9444, durationMinutes: 679,
    closedAt: Date.parse('2026-07-01T01:19:52.160Z'), trailingStage: 'TIME_LOCK' };
  const results = await Promise.all([
    engine.finalizeExternalClose(evidence),
    engine.finalizeExternalClose(evidence)
  ]);
  assert(results.every(result => result.status === 'FINISHED'));
  assert.equal(results.filter(result => result.notification.owner).length, 1);
  assert.equal(results.filter(result => result.notification.sent).length, 1);
  assert.equal(state.inserts, 1, 'duplicate close inserted duplicate analytics row');
  assert.equal(state.sends, 1, 'duplicate detector emitted a second final close notification');
  assert.equal(state.notificationStatus, 'SENT');
  assert.equal(engine.closeReasonLabel('SL', 'TIME_LOCK'), 'Time Lock Stop');
  console.log('close lifecycle tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
