'use strict';

// Explicit migration repair. Binance is queried via GET only; no executor is used.
async function reconcileStaleOpen({ db, binance, executionId, apply = false, now = Date.now() }) {
  if (!/^[a-f0-9-]{36}$/.test(executionId || '')) throw new Error('INVALID_EXECUTION_ID');
  const [rows] = await db.execute('SELECT * FROM trade_executions WHERE execution_id=?', [executionId]);
  const row = rows[0];
  if (!row || row.request_type !== 'OPEN_POSITION' || !['REQUESTED', 'EXECUTING'].includes(row.final_status)
      || row.exchange_order_id || row.exchange_response || row.verification_result)
    throw new Error('NOT_AN_UNCONFIRMED_STALE_OPEN');
  const requestedAt = new Date(row.requested_at).getTime();
  const age = now - requestedAt;
  if (!Number.isFinite(age) || age < 24 * 3600000 || age > 6 * 24 * 3600000) throw new Error('OUTSIDE_SAFE_HISTORY_WINDOW');
  const clientId = `aterum_entry_${executionId.replace(/-/g, '')}`.slice(0, 36);
  try {
    await binance.queryOrder(row.symbol, clientId);
    throw new Error('BINANCE_ORDER_EXISTS');
  } catch (error) { if (error.code !== -2013) throw error; }
  const orders = await binance.allOrders(row.symbol, requestedAt - 60000);
  if (!Array.isArray(orders) || orders.length >= 1000) throw new Error('HISTORY_INCOMPLETE');
  if (orders.some(order => order.clientOrderId === clientId)) throw new Error('BINANCE_HISTORY_MATCH');
  const [linked] = await db.execute('SELECT COUNT(*) AS n FROM trades WHERE execution_id=?', [executionId]);
  if (Number(linked[0].n) !== 0) throw new Error('LOCAL_TRADE_EXISTS');
  const evidence = { executionId, symbol: row.symbol, clientId, queryCode: -2013, ordersInWindow: orders.length,
    historyComplete: true, linkedTrades: 0, checkedAt: new Date(now).toISOString(), binanceReadOnly: true };
  if (!apply) return { ...evidence, status: 'AUDIT_ONLY' };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const verification = { verified: false, exchangeVerified: false, pipelineVerified: false,
      persistenceStatus: 'NOT_STARTED', readOnlyEvidence: evidence };
    const [result] = await conn.execute(`UPDATE trade_executions SET final_status='FAILED',completed_at=NOW(3),
      error='MIGRATION_STALE_OPEN_NO_CONFIRMED_ORDER',verification_result=?
      WHERE execution_id=? AND final_status=? AND exchange_order_id IS NULL AND exchange_response IS NULL
      AND verification_result IS NULL`, [JSON.stringify(verification), executionId, row.final_status]);
    if (result.affectedRows !== 1) throw new Error('RECEIPT_CHANGED');
    await conn.execute(`INSERT INTO trade_execution_events (execution_id,event_type,event_payload)
      VALUES (?,'MIGRATION_STALE_OPEN_RECONCILED',?)`, [executionId,
      JSON.stringify({ previousStatus: row.final_status, previousRequestedAt: row.requested_at,
        finalStatus: 'FAILED', reason: 'NO_CONFIRMED_BINANCE_ORDER', evidence })]);
    await conn.commit();
    return { ...evidence, status: 'RECONCILED_FAILED' };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

async function main() {
  const { db } = require('../shared');
  const { BinanceFutures } = require('../position-guard/binance');
  const config = require('../position-guard/config');
  const binance = new BinanceFutures({ ...config, fetchImpl: (url, options) => {
    if ((options?.method || 'GET') !== 'GET') throw new Error('BINANCE_WRITE_BLOCKED');
    return fetch(url, options);
  } });
  try {
    console.log(JSON.stringify(await reconcileStaleOpen({ db, binance, executionId: process.argv[2],
      apply: process.argv[3] === '--apply' })));
  } catch (_) { console.error('STALE_OPEN_RECONCILIATION_REFUSED'); process.exitCode = 1; }
  finally { await db.end(); }
}
if (require.main === module) main();
module.exports = { reconcileStaleOpen };
