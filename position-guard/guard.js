'use strict';

const { normalizePosition, isStop, isTakeProfit, triggerPrice } = require('./binance');

function json(value) { return JSON.stringify(value ?? null); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function exchangeOrderId(order) { return order?.algoId ?? order?.orderId ?? null; }
function orderType(order) {
  return String(order?.orderType || order?.origType || order?.type || '').toUpperCase();
}
function matchesClosingFill(order, fillOrderId) {
  return [order?.actualOrderId, order?.orderId, order?.algoId]
    .filter(value => value != null).some(value => String(value) === String(fillOrderId));
}
function classifyClosingOrder(orders, algos, fillOrderId) {
  const matchingAlgos = (algos || []).filter(order => matchesClosingFill(order, fillOrderId));
  const stop = matchingAlgos.find(order => orderType(order).includes('STOP'));
  const takeProfit = matchingAlgos.find(order => orderType(order).includes('TAKE_PROFIT'));
  const regular = (orders || []).find(order => matchesClosingFill(order, fillOrderId));
  const order = stop || takeProfit || regular || null;
  const type = orderType(order);
  return { order, type, closeReason: stop ? 'SL' : takeProfit ? 'TP'
    : type.includes('STOP') ? 'SL' : type.includes('TAKE_PROFIT') || type === 'LIMIT' ? 'TP' : 'MANUAL' };
}
function near(left, right) {
  if (left == null && right == null) return true;
  const a = Number(left); const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-7);
}
function protectivePrice(order) { return triggerPrice(order) || Number(order.price || 0) || null; }
function selectedPrice(orders, side, kind) {
  const prices = orders.map(protectivePrice).filter(value => Number.isFinite(value) && value > 0);
  if (!prices.length) return null;
  if (kind === 'STOP') return side === 'LONG' ? Math.max(...prices) : Math.min(...prices);
  return side === 'LONG' ? Math.min(...prices) : Math.max(...prices);
}

class PositionGuard {
  constructor(deps) {
    Object.assign(this, deps);
    this.running = false;
    this.alerted = new Map();
    this.unprotectedSince = new Map();
    this.emergencyClosing = new Map();
    this.projectionSyncedAt = new Map();
    this.lastScan = null;
  }

  async initialize() {
    await this.db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS initial_sl_price DECIMAL(24,10) NULL`);
    await this.db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS execution_id CHAR(36) NULL`);
    await this.db.execute(`ALTER TABLE trades ADD UNIQUE INDEX IF NOT EXISTS uq_trades_execution_id (execution_id)`);
    await this.db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl_order_id VARCHAR(64) NULL`);
    await this.db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS trailing_stage
      ENUM('INITIAL','BREAKEVEN','TIME_LOCK','LOCK','TRAILING') NOT NULL DEFAULT 'INITIAL'`);
    await this.db.execute(`ALTER TABLE trade_closes ADD UNIQUE INDEX IF NOT EXISTS uq_trade_closes_trade_id (trade_id)`);
    await this.db.execute(`UPDATE trades SET initial_sl_price=sl_price
      WHERE initial_sl_price IS NULL AND sl_price IS NOT NULL`);
    await this.db.execute(`CREATE TABLE IF NOT EXISTS position_guard_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      severity ENUM('INFO','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
      symbol VARCHAR(24) NULL,
      position_side VARCHAR(12) NULL,
      expected JSON NULL,
      actual JSON NULL,
      action VARCHAR(80) NULL,
      action_status VARCHAR(32) NULL,
      error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_position_guard_created (created_at),
      INDEX idx_position_guard_symbol_created (symbol,created_at),
      INDEX idx_position_guard_severity_created (severity,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async event(entry) {
    await this.db.execute(`INSERT INTO position_guard_events
      (event_type,severity,symbol,position_side,expected,actual,action,action_status,error)
      VALUES (?,?,?,?,?,?,?,?,?)`, [
      entry.eventType, entry.severity || 'INFO', entry.symbol || null, entry.positionSide || null,
      json(entry.expected), json(entry.actual), entry.action || null, entry.actionStatus || null,
      entry.error ? String(entry.error).slice(0, 10000) : null
    ]);
  }

  async alert(key, message, force = false) {
    const last = this.alerted.get(key) || 0;
    if (!force && Date.now() - last < this.config.alertCooldownMs) return false;
    this.alerted.set(key, Date.now());
    if (!this.config.telegramToken || !this.config.telegramChatId) return false;
    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.config.telegramChatId, text: message, disable_notification: false }),
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.description || `Telegram HTTP ${response.status}`);
    return true;
  }

  async expectedTrades() {
    const [rows] = await this.db.query(`SELECT id,symbol,direction,status,entry_price,initial_sl_price,sl_price,tp_price,qty,leverage,trailing_stage,
      opened_at,updated_at FROM trades WHERE status='OPEN' ORDER BY opened_at`);
    return rows || [];
  }

  async pendingLocalOpen(position) {
    const [rows] = await this.db.execute(`SELECT execution_id FROM trade_executions
      WHERE request_type='OPEN_POSITION' AND symbol=? AND position_side=? AND final_status='VERIFIED'
        AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
      ORDER BY completed_at DESC LIMIT 1`, [position.symbol, position.side]);
    return rows[0]?.execution_id || null;
  }

  async activeExecution(position) {
    const [rows] = await this.db.execute(`SELECT execution_id FROM trade_executions
      WHERE symbol=? AND position_side=? AND final_status IN ('REQUESTED','EXECUTING')
        AND requested_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
      ORDER BY requested_at DESC LIMIT 1`, [position.symbol, position.side]);
    return rows[0]?.execution_id || null;
  }

  async inspectProtection(position, expected, stops) {
    const key = `${position.symbol}:${position.side}`;
    if (stops.length) {
      this.unprotectedSince.delete(key);
      this.emergencyClosing.delete(key);
      return { status: 'protected' };
    }

    const firstSeen = this.unprotectedSince.get(key) || Date.now();
    const elapsedMs = Date.now() - firstSeen;
    if (!this.unprotectedSince.has(key)) {
      this.unprotectedSince.set(key, firstSeen);
      await this.event({ eventType: 'UNPROTECTED_POSITION', severity: 'CRITICAL', symbol: position.symbol,
        positionSide: position.side, expected: { sl: expected.sl_price }, actual: { stops: [] },
        action: 'ALERT_AND_WAIT', actionStatus: 'PENDING' });
      await this.alert(`unprotected:${key}`,
        `🚨 ATERUM CRITICAL\n${position.symbol} ${position.side} has no native STOP. Emergency close in ${Math.round(this.config.unprotectedGraceMs / 1000)}s if protection is not restored.`, true);
    }
    if (!this.config.enforce || elapsedMs < this.config.unprotectedGraceMs) {
      return { status: 'unprotected_grace', elapsedMs };
    }
    if (this.emergencyClosing.has(key)) return { status: 'emergency_pending' };

    this.emergencyClosing.set(key, Date.now());
    try {
      const closed = await this.executionEngine.execute({
        type: 'CLOSE_POSITION', symbol: position.symbol, positionSide: position.side, maxAttempts: 3,
        reason: 'UNPROTECTED_POSITION'
      });
      if (!closed.ok || closed.finalStatus !== 'VERIFIED') {
        throw new Error(closed.error || `Emergency close ${closed.finalStatus || 'failed'}`);
      }
      await this.event({ eventType: 'EMERGENCY_CLOSE', severity: 'CRITICAL', symbol: position.symbol,
        positionSide: position.side, expected: { nativeStop: true, graceMs: this.config.unprotectedGraceMs },
        actual: { nativeStop: false, unprotectedMs: elapsedMs, executionId: closed.executionId,
          exchangeOrderId: closed.exchangeOrderId, verification: closed.verificationResult },
        action: 'MARKET_CLOSE', actionStatus: 'VERIFIED' });
      await this.alert(`emergency:${key}`,
        `🚨 ATERUM EMERGENCY\n${position.symbol} ${position.side} remained without native STOP for ${Math.round(elapsedMs / 1000)}s. Binance confirmed the emergency close. Execution ${closed.executionId}.`, true);
      return { status: 'emergency_closed', order: closed };
    } catch (error) {
      this.emergencyClosing.delete(key);
      throw error;
    }
  }

  async adoptPosition(position, stops, takeProfits) {
    const sl = selectedPrice(stops, position.side, 'STOP');
    const tp = selectedPrice(takeProfits, position.side, 'TP');
    const [result] = await this.db.execute(`INSERT INTO trades
      (symbol,direction,status,entry_price,initial_sl_price,sl_price,tp_price,qty,leverage,trailing_stage,opened_at)
      VALUES (?,?, 'OPEN',?,?,?,?,?,?,'INITIAL',NOW())`, [position.symbol, position.side, position.entryPrice, sl, sl, tp,
      position.qty, position.leverage]);
    const expected = { id: result.insertId, symbol: position.symbol, direction: position.side, status: 'OPEN',
      entry_price: position.entryPrice, initial_sl_price: sl, sl_price: sl, tp_price: tp, qty: position.qty,
      leverage: position.leverage, trailing_stage: 'INITIAL', opened_at: new Date(), updated_at: new Date() };
    await this.event({ eventType: 'POSITION_ADOPTED_FROM_BINANCE', severity: 'CRITICAL', symbol: position.symbol,
      positionSide: position.side, expected: { dbPosition: null }, actual: { position, sl, tp },
      action: 'CREATE_LOCAL_POSITION', actionStatus: 'SUCCESS' });
    await this.alert(`adopted:${position.symbol}:${position.side}`,
      `🚨 ATERUM SYNC\n${position.symbol} ${position.side} existed on Binance without local state. Local state was created from Binance (qty ${position.qty}, SL ${sl ?? 'missing'}, TP ${tp ?? 'missing'}).`, true);
    await this.publishPosition(position, expected).catch(() => null);
    return expected;
  }

  async publishPosition(position, expected) {
    if (expected.sl_price != null) {
      await fetch(`${this.config.n8nBase}/webhook/sl-monitor-set`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: position.symbol, positionSide: position.side,
          slPrice: Number(expected.sl_price), qty: position.qty, side: position.side === 'LONG' ? 'SELL' : 'BUY',
          entryPrice: position.entryPrice, initialSL: Number(expected.initial_sl_price ?? expected.sl_price),
          stage: expected.trailing_stage || 'INITIAL', tp: expected.tp_price,
          leverage: position.leverage, openedAt: new Date(expected.opened_at).getTime(), source: 'BINANCE_SYNC' }),
        signal: AbortSignal.timeout(5000)
      }).then(response => { if (!response.ok) throw new Error(`n8n HTTP ${response.status}`); });
    }
    await fetch(`${this.config.dashboardBase}/trade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: position.symbol, side: position.side, entryPrice: position.entryPrice,
        sl: expected.sl_price, tp: expected.tp_price, qty: position.qty, leverage: position.leverage,
        openedAt: new Date(expected.opened_at).getTime(), stage: expected.trailing_stage || 'INITIAL',
        initialSL: expected.initial_sl_price ?? expected.sl_price }), signal: AbortSignal.timeout(5000)
    }).then(response => { if (!response.ok) throw new Error(`dashboard HTTP ${response.status}`); });
  }

  async synchronizePosition(position, expected, stops, takeProfits) {
    const actual = { entryPrice: position.entryPrice, qty: position.qty, leverage: position.leverage,
      sl: selectedPrice(stops, position.side, 'STOP'), tp: selectedPrice(takeProfits, position.side, 'TP') };
    const wanted = { entryPrice: Number(expected.entry_price), qty: Number(expected.qty),
      leverage: Number(expected.leverage), sl: expected.sl_price == null ? null : Number(expected.sl_price),
      tp: expected.tp_price == null ? null : Number(expected.tp_price) };
    const fields = [];
    for (const field of ['entryPrice', 'qty', 'leverage', 'sl', 'tp']) if (!near(wanted[field], actual[field])) fields.push(field);
    if (!fields.length) return { drift: false, actual };
    await this.db.execute(`UPDATE trades SET entry_price=?,qty=?,leverage=?,sl_price=?,tp_price=?,updated_at=NOW()
      WHERE id=?`, [actual.entryPrice, actual.qty, actual.leverage, actual.sl, actual.tp, expected.id]);
    Object.assign(expected, { entry_price: actual.entryPrice, qty: actual.qty, leverage: actual.leverage,
      sl_price: actual.sl, tp_price: actual.tp, updated_at: new Date() });
    await this.event({ eventType: 'POSITION_DRIFT_RECONCILED', severity: 'WARNING', symbol: position.symbol,
      positionSide: position.side, expected: wanted, actual, action: `SYNC_${fields.join('_').toUpperCase()}`,
      actionStatus: 'SUCCESS' });
    await this.publishPosition(position, expected).catch(async error => {
      await this.event({ eventType: 'POSITION_SYNC_PUBLISH_FAILED', severity: 'WARNING', symbol: position.symbol,
        positionSide: position.side, expected: actual, action: 'PUBLISH_LOCAL_STATE', actionStatus: 'FAILED', error: error.message });
    });
    await this.alert(`drift:${position.symbol}:${position.side}`,
      `⚠️ ATERUM DRIFT\n${position.symbol} ${position.side}: ${fields.join(', ')} differed locally. Local state was synchronized from Binance.`, false);
    return { drift: true, fields, actual };
  }

  async refreshProjection(position, expected, force = false) {
    const key = `${position.symbol}:${position.side}`;
    const last = this.projectionSyncedAt.get(key) || 0;
    if (!force && Date.now() - last < 60000) return false;
    await this.publishPosition(position, expected);
    this.projectionSyncedAt.set(key, Date.now());
    return true;
  }

  async cleanupOrphanProtection(expected) {
    const context = { symbol: expected.symbol, side: expected.direction, positionSide: expected.direction };
    const cancellations = [];
    let remaining = [];
    try {
      for (let attempt = 1; attempt <= 8; attempt++) {
        const [regular, algos] = await Promise.all([
          this.binance.openOrders(expected.symbol), this.binance.openAlgoOrders(expected.symbol)
        ]);
        remaining = [...regular, ...algos].filter(order => isStop(order, context) || isTakeProfit(order, context));
        if (!remaining.length) {
          const result = { verified: true, cancelled: cancellations, remaining: [], checkedAt: new Date().toISOString() };
          await this.event({ eventType: 'ORPHAN_PROTECTION_CLEANUP', severity: 'INFO', symbol: expected.symbol,
            positionSide: expected.direction, expected: { positionClosed: true, protectiveOrders: 0 },
            actual: result, action: 'CANCEL_ORPHAN_PROTECTION', actionStatus: 'VERIFIED' });
          return result;
        }
        for (const order of remaining) {
          try {
            const response = order.algoId != null
              ? await this.binance.cancelAlgoOrder(order.algoId)
              : await this.binance.cancelOrder(order.symbol, order.orderId);
            cancellations.push({ orderId: exchangeOrderId(order), response });
          } catch (error) {
            if (![-2011, -2013].includes(Number(error.code))) throw error;
            cancellations.push({ orderId: exchangeOrderId(order), alreadyAbsent: true });
          }
        }
        await sleep(Math.min(1000, 150 * attempt));
      }
      throw new Error(`Protective orders remain after verified close: ${remaining.map(exchangeOrderId).join(',')}`);
    } catch (error) {
      await this.event({ eventType: 'ORPHAN_PROTECTION_CLEANUP_FAILED', severity: 'CRITICAL', symbol: expected.symbol,
        positionSide: expected.direction, expected: { positionClosed: true, protectiveOrders: 0 },
        actual: { cancelled: cancellations, remaining: remaining.map(exchangeOrderId) },
        action: 'CANCEL_ORPHAN_PROTECTION', actionStatus: 'FAILED', error: error.stack || error.message });
      throw error;
    }
  }

  async reconcileClosed(expected) {
    const startTime = Math.max(0, new Date(expected.opened_at).getTime() - 60000);
    const [orders, algos, trades] = await Promise.all([
      this.binance.allOrders(expected.symbol, startTime),
      this.binance.allAlgoOrders(expected.symbol, startTime).catch(() => []),
      this.binance.userTrades(expected.symbol, startTime)
    ]);
    const closeSide = expected.direction === 'LONG' ? 'SELL' : 'BUY';
    const fills = trades.filter(trade => trade.side === closeSide && Number(trade.qty || 0) > 0);
    if (!fills.length) {
      const ticker = await this.binance.tickerPrice(expected.symbol);
      const exitPrice = Number(ticker.price || expected.entry_price);
      const qty = Number(expected.qty || 0);
      const pnl = expected.direction === 'SHORT'
        ? (Number(expected.entry_price) - exitPrice) * qty
        : (exitPrice - Number(expected.entry_price)) * qty;
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();
        const [exists] = await connection.execute('SELECT id FROM trade_closes WHERE trade_id=? LIMIT 1 FOR UPDATE', [expected.id]);
        if (!exists.length) {
          await connection.execute(`INSERT INTO trade_closes
            (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at)
            VALUES (?,?,?,?,?,0,'SYNC',?,?,NOW())`, [expected.id, expected.symbol, exitPrice, pnl,
            Number(expected.entry_price) * qty > 0 ? pnl / (Number(expected.entry_price) * qty) * 100 : 0,
            expected.trailing_stage || 'INITIAL', Math.max(0, Math.round((Date.now() - new Date(expected.opened_at).getTime()) / 60000))]);
        }
        await connection.execute("UPDATE trades SET status='CLOSED',updated_at=NOW() WHERE id=?", [expected.id]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      const cleanup = await this.cleanupOrphanProtection(expected);
      await fetch(`${this.config.dashboardBase}/trade/${expected.symbol}?reason=sync&exitPrice=${exitPrice}`, {
        method: 'DELETE', signal: AbortSignal.timeout(5000)
      }).catch(() => null);
      await this.event({ eventType: 'DB_RECONCILED_CLOSED_NO_FILL', severity: 'CRITICAL', symbol: expected.symbol,
        positionSide: expected.direction, expected: { dbStatus: 'OPEN' },
        actual: { binanceStatus: 'CLOSED', fillEvidence: false, estimatedExitPrice: exitPrice, cleanup },
        action: 'CLOSE_DB_TRADE_SYNC', actionStatus: 'SUCCESS' });
      await this.alert(`db-close-sync:${expected.id}`,
        `🚨 ATERUM SYNC\n${expected.symbol} is closed on Binance but no closing fill was available. Local state was closed as SYNC; exit/PnL are estimates.`, true);
      return { status: 'reconciled', closeReason: 'SYNC', exitPrice, pnl, estimated: true };
    }
    const latestTime = Math.max(...fills.map(row => Number(row.time || 0)));
    const latest = fills.filter(row => Number(row.time) === latestTime || Math.abs(Number(row.time) - latestTime) < 2000);
    const qty = latest.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const exitPrice = qty > 0 ? latest.reduce((sum, row) => sum + Number(row.price || 0) * Number(row.qty || 0), 0) / qty : Number(expected.entry_price);
    const pnl = latest.reduce((sum, row) => sum + Number(row.realizedPnl || 0), 0);
    const classification = classifyClosingOrder(orders, algos, latest[0].orderId);
    const filledOrder = classification.order;
    const clientId = String(filledOrder?.clientOrderId || filledOrder?.clientAlgoId || '');
    const closeReason = classification.closeReason;
    const initialRisk = Math.abs(Number(expected.entry_price) - Number(expected.initial_sl_price ?? expected.sl_price));
    const rFinal = initialRisk > 0 ? (Math.abs(exitPrice - Number(expected.entry_price)) / initialRisk) * (pnl >= 0 ? 1 : -1) : 0;
    const duration = Math.max(0, Math.round((latestTime - new Date(expected.opened_at).getTime()) / 60000));
    if (!this.executionEngine?.finalizeExternalClose) {
      throw new Error('Verified close finalizer is unavailable');
    }
    const finalized = await this.executionEngine.finalizeExternalClose({ symbol: expected.symbol,
      positionSide: expected.direction, exchangeOrderId: latest[0].orderId,
      protectiveOrderId: filledOrder?.algoId || null, exchangeResponse: { fills: latest, order: filledOrder },
      verificationResult: { verified: true, position: null, fillVerified: true }, closeReason, exitPrice, pnl,
      rFinal, durationMinutes: duration, closedAt: latestTime, trailingStage: expected.trailing_stage || 'INITIAL' });
    await this.event({ eventType: 'VERIFIED_CLOSE_FINALIZED', severity: 'INFO', symbol: expected.symbol,
      positionSide: expected.direction, expected: { dbStatus: 'OPEN' },
      actual: { binanceStatus: 'CLOSED', exitPrice, pnl, closeReason, trailingStage: expected.trailing_stage || 'INITIAL',
        executionId: finalized.executionId, correlationId: finalized.correlationId,
        cleanup: finalized.cleanup, notification: finalized.notification,
        clientId: clientId ? `${clientId.slice(0, 4)}…` : null },
      action: 'FINALIZE_VERIFIED_CLOSE', actionStatus: 'SUCCESS' });
    return { status: 'reconciled', closeReason, exitPrice, pnl, cleanup: finalized.cleanup,
      executionId: finalized.executionId, correlationId: finalized.correlationId,
      notification: finalized.notification };
  }

  async scan() {
    if (this.running) return this.lastScan;
    this.running = true;
    const started = Date.now();
    const summary = { positions: 0, protected: 0, unprotected: 0, emergencyClosed: 0,
      reconciled: 0, driftDetected: 0, adopted: 0, pendingPersistence: 0, pendingExecutions: 0,
      projectionsRefreshed: 0, errors: [] };
    try {
      const [positionRows, regularOrders, algoOrders, expectedRows] = await Promise.all([
        this.binance.positions(), this.binance.openOrders(), this.binance.openAlgoOrders(), this.expectedTrades()
      ]);
      const allOrders = [...regularOrders, ...algoOrders];
      const positions = positionRows.map(normalizePosition).filter(Boolean);
      summary.positions = positions.length;
      for (const position of positions) {
        const activeExecutionId = await this.activeExecution(position);
        if (activeExecutionId) { summary.pendingExecutions++; continue; }
        let expected = expectedRows.find(row => row.symbol === position.symbol && row.direction === position.side);
        const stops = allOrders.filter(order => isStop(order, position));
        const takeProfits = allOrders.filter(order => isTakeProfit(order, position));
        if (!expected) {
          const pendingExecutionId = await this.pendingLocalOpen(position);
          if (pendingExecutionId) {
            summary.pendingPersistence++;
            await this.event({ eventType: 'POSITION_LOCAL_PERSISTENCE_PENDING', severity: 'INFO',
              symbol: position.symbol, positionSide: position.side,
              actual: { position, executionId: pendingExecutionId }, action: 'WAIT_FOR_VERIFIED_PIPELINE',
              actionStatus: 'PENDING' });
            continue;
          }
          try { expected = await this.adoptPosition(position, stops, takeProfits); expectedRows.push(expected); summary.adopted++; }
          catch (error) { summary.errors.push(`adopt ${position.symbol}: ${error.message}`); continue; }
        }
        try {
          const sync = await this.synchronizePosition(position, expected, stops, takeProfits);
          if (sync.drift) summary.driftDetected++;
          try { if (await this.refreshProjection(position, expected, sync.drift)) summary.projectionsRefreshed++; }
          catch (error) {
            summary.errors.push(`projection ${position.symbol}: ${error.message}`);
            await this.event({ eventType: 'POSITION_PROJECTION_REFRESH_FAILED', severity: 'WARNING',
              symbol: position.symbol, positionSide: position.side, expected,
              action: 'REFRESH_LOCAL_PROJECTIONS', actionStatus: 'FAILED', error: error.message });
          }
          const protection = await this.inspectProtection(position, expected, stops);
          if (protection.status === 'protected') summary.protected++;
          if (protection.status === 'unprotected_grace') summary.unprotected++;
          if (protection.status === 'emergency_closed') summary.emergencyClosed++;
        } catch (error) {
          summary.errors.push(`${position.symbol}: ${error.message}`);
          await this.event({ eventType: 'PROTECTION_FAILED', severity: 'CRITICAL', symbol: position.symbol,
            positionSide: position.side, expected: { sl: expected.sl_price, tp: expected.tp_price },
            actual: { stops }, action: 'EMERGENCY_CLOSE', actionStatus: 'FAILED', error: error.message });
          await this.alert(`failed:${position.symbol}:${position.side}`,
            `🚨 URGENT ATERUM\nFailed to protect ${position.symbol} ${position.side}: ${error.message}`, true).catch(() => null);
        }
      }
      for (const expected of expectedRows) {
        const exists = positions.some(position => position.symbol === expected.symbol && position.side === expected.direction);
        if (!exists) {
          const activeExecutionId = await this.activeExecution({ symbol: expected.symbol, side: expected.direction });
          if (activeExecutionId) { summary.pendingExecutions++; continue; }
          try { const result = await this.reconcileClosed(expected); if (result.status === 'reconciled') summary.reconciled++; }
          catch (error) { summary.errors.push(`reconcile ${expected.symbol}: ${error.message}`); }
        }
      }
      summary.ok = summary.errors.length === 0;
      summary.durationMs = Date.now() - started;
      summary.at = new Date().toISOString();
      this.lastScan = summary;
      return summary;
    } finally { this.running = false; }
  }
}

module.exports = { PositionGuard, classifyClosingOrder };
