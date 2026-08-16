'use strict';

const { randomUUID, createHash } = require('crypto');
const { normalizePosition, isStop, isTakeProfit, triggerPrice } = require('./binance');

const EXECUTION_TYPES = new Set([
  'OPEN_POSITION', 'MOVE_STOP_LOSS', 'MOVE_TAKE_PROFIT', 'PARTIAL_TAKE_PROFIT', 'TRAILING_STOP', 'CLOSE_POSITION'
]);
const TERMINAL_STATUSES = new Set(['VERIFIED', 'REJECTED', 'FAILED']);
const ACTIVE_ORDER_STATUSES = new Set(['NEW', 'PARTIALLY_FILLED']);

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function json(value) { return JSON.stringify(value ?? null); }
function parsedJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}
function number(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}
function closeSide(positionSide) { return positionSide === 'LONG' ? 'SELL' : 'BUY'; }
function orderId(order) { return order?.algoId ?? order?.orderId ?? null; }
function clientId(order) { return String(order?.clientAlgoId || order?.clientOrderId || ''); }
function active(order) {
  return ACTIVE_ORDER_STATUSES.has(String(order?.algoStatus || order?.status || '').toUpperCase());
}
function near(left, right) {
  const a = Number(left); const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-7);
}
function safeId(prefix, executionId) {
  return `${prefix}_${executionId.replace(/-/g, '')}`.slice(0, 36);
}
function externalCloseExecutionId(symbol, positionSide, exchangeOrderId) {
  const chars = createHash('sha256').update(`${symbol}:${positionSide}:${exchangeOrderId}`).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function retryable(error) {
  if (error?.retryable === false) return false;
  const code = Number(error?.code);
  const message = String(error?.message || error || '');
  return [-1001, -1007, -1008, -1021, 408, 418, 429, 500, 502, 503, 504].includes(code)
    || /timeout|timed out|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|fetch failed/i.test(message);
}
function serializeError(error) {
  return { message: String(error?.message || error), code: error?.code ?? null,
    httpMethod: error?.httpMethod || error?.config?.method || null,
    url: error?.url || error?.config?.url || null,
    statusCode: error?.statusCode || error?.response?.status || error?.code || null,
    responseBody: error?.responseBody || error?.response?.body || error?.response?.data || error?.body || null,
    stackTrace: error?.stack || null };
}

function failureNotificationPolicy(request, error, exchangeWasVerified, failureCategory) {
  if (failureCategory === 'EXECUTION_REJECTED') return { notify: true, reason: 'EXPECTED_RISK_REJECTION' };
  if (exchangeWasVerified || failureCategory === 'PERSISTENCE_FAILURE') {
    return { notify: true, reason: 'VERIFIED_EXCHANGE_ACTION_NEEDS_ATTENTION' };
  }
  const message = String(error?.message || error || '');
  const management = ['MOVE_STOP_LOSS', 'MOVE_TAKE_PROFIT', 'TRAILING_STOP', 'PARTIAL_TAKE_PROFIT', 'CLOSE_POSITION']
    .includes(request.type);
  if (management && /No .* position exists on Binance/i.test(message)) {
    return { notify: false, reason: 'POSITION_ALREADY_CLOSED' };
  }
  if (management && /Order would immediately trigger/i.test(message)) {
    return { notify: false, reason: 'PROTECTIVE_REPLACEMENT_NOT_APPLIED' };
  }
  if (retryable(error) && !error?.exchangeOrderId && !error?.exchangeResponse) {
    return { notify: false, reason: 'TRANSIENT_NO_EXCHANGE_CHANGE' };
  }
  return { notify: true, reason: 'ACTIONABLE_EXECUTION_FAILURE' };
}

class ExecutionEngine {
  constructor({ config, db, binance, portfolioAllocator = null }) {
    this.config = config;
    this.db = db;
    this.binance = binance;
    this.portfolioAllocator = portfolioAllocator;
    this.inFlight = new Map();
    this.openAllocationLock = Promise.resolve();
  }

  async initialize() {
    await this.db.execute(`CREATE TABLE IF NOT EXISTS trade_executions (
      execution_id CHAR(36) PRIMARY KEY,
      request_type VARCHAR(40) NOT NULL,
      symbol VARCHAR(24) NOT NULL,
      position_side VARCHAR(12) NOT NULL,
      request_payload JSON NOT NULL,
      exchange_order_id VARCHAR(64) NULL,
      exchange_response JSON NULL,
      verification_result JSON NULL,
      requested_at DATETIME(3) NOT NULL,
      executed_at DATETIME(3) NULL,
      verified_at DATETIME(3) NULL,
      completed_at DATETIME(3) NULL,
      final_status VARCHAR(24) NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      error TEXT NULL,
      INDEX idx_trade_execution_symbol_time (symbol,requested_at),
      INDEX idx_trade_execution_status_time (final_status,requested_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.db.execute(`CREATE TABLE IF NOT EXISTS trade_execution_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      execution_id CHAR(36) NOT NULL,
      event_type VARCHAR(48) NOT NULL,
      event_payload JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_trade_execution_event (execution_id,created_at),
      CONSTRAINT fk_trade_execution_event FOREIGN KEY (execution_id)
        REFERENCES trade_executions(execution_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.db.execute(`CREATE TABLE IF NOT EXISTS trade_lifecycle_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      trade_id INT NOT NULL,
      execution_id CHAR(36) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      event_payload JSON NULL,
      notification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      notification_error TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      notified_at DATETIME(3) NULL,
      UNIQUE KEY uq_trade_lifecycle_event (trade_id,event_type),
      INDEX idx_trade_lifecycle_execution (execution_id),
      CONSTRAINT fk_trade_lifecycle_trade FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  normalize(input) {
    const request = { ...input };
    request.executionId = String(request.executionId || randomUUID());
    request.type = String(request.type || '').toUpperCase();
    request.symbol = String(request.symbol || '').toUpperCase();
    request.positionSide = String(request.positionSide || request.side || '').toUpperCase();
    if (!/^[0-9a-f-]{36}$/i.test(request.executionId)) throw new Error('executionId must be a UUID');
    if (!EXECUTION_TYPES.has(request.type)) throw new Error(`Unsupported execution type: ${request.type}`);
    if (!/^[A-Z0-9_]{3,24}$/.test(request.symbol)) throw new Error('Invalid symbol');
    if (!['LONG', 'SHORT'].includes(request.positionSide)) throw new Error('positionSide must be LONG or SHORT');
    if (request.type === 'OPEN_POSITION') {
      request.quantity = number(request.quantity, 'quantity');
      request.stopLoss = number(request.stopLoss, 'stopLoss');
      request.takeProfit = number(request.takeProfit, 'takeProfit');
      request.leverage = Math.min(125, Math.max(1, Math.trunc(number(request.leverage, 'leverage'))));
    }
    if (['MOVE_STOP_LOSS', 'MOVE_TAKE_PROFIT'].includes(request.type)) request.targetPrice = number(request.targetPrice, 'targetPrice');
    if (request.type === 'TRAILING_STOP') {
      request.targetPrice = number(request.targetPrice, 'targetPrice');
      if (request.callbackRate != null) request.callbackRate = number(request.callbackRate, 'callbackRate');
    }
    if (request.type === 'PARTIAL_TAKE_PROFIT') request.quantity = number(request.quantity, 'quantity');
    request.maxAttempts = Math.min(4, Math.max(1, Number(request.maxAttempts || 3)));
    return request;
  }

  async event(executionId, eventType, payload) {
    await this.db.execute(`INSERT INTO trade_execution_events (execution_id,event_type,event_payload)
      VALUES (?,?,?)`, [executionId, eventType, json(payload)]);
  }

  async existing(executionId) {
    const [rows] = await this.db.execute('SELECT * FROM trade_executions WHERE execution_id=? LIMIT 1', [executionId]);
    if (!rows.length) return null;
    const row = rows[0];
    return {
      ok: row.final_status === 'VERIFIED', executionId: row.execution_id, type: row.request_type,
      symbol: row.symbol, positionSide: row.position_side, exchangeOrderId: row.exchange_order_id,
      exchangeResponse: parsedJson(row.exchange_response), verificationResult: parsedJson(row.verification_result),
      timestamp: row.completed_at || row.requested_at, finalStatus: row.final_status,
      attemptCount: row.attempt_count, error: row.error
    };
  }

  async recordExternalClose(input) {
    const symbol = String(input.symbol || '').toUpperCase();
    const positionSide = String(input.positionSide || '').toUpperCase();
    const persistenceStatus = String(input.persistenceStatus || 'PENDING').toUpperCase();
    const exchangeVerified = input.verificationResult?.verified === true;
    const exchangeOrderId = String(input.exchangeOrderId || '');
    if (!/^[A-Z0-9_]{3,24}$/.test(symbol)) throw new Error('Invalid reconciliation symbol');
    if (!['LONG', 'SHORT'].includes(positionSide)) throw new Error('Invalid reconciliation positionSide');
    if (!exchangeVerified && persistenceStatus !== 'VERIFICATION_FAILED') {
      throw new Error('External close reconciliation requires Binance verification');
    }
    if (exchangeVerified && !exchangeOrderId) throw new Error('Verified external close requires an exchange order ID');

    let correlationId = input.correlationId || null;
    if (!correlationId) {
      const params = [symbol, positionSide];
      let match = '';
      if (input.protectiveOrderId != null) {
        match = ' AND exchange_order_id=?';
        params.push(String(input.protectiveOrderId));
      }
      const [rows] = await this.db.execute(`SELECT execution_id FROM trade_executions
        WHERE symbol=? AND position_side=? AND request_type IN ('MOVE_STOP_LOSS','TRAILING_STOP')
          AND final_status='VERIFIED'${match} ORDER BY completed_at DESC LIMIT 1`, params);
      correlationId = rows[0]?.execution_id || null;
    }

    const executionId = String(input.executionId || (exchangeOrderId
      ? externalCloseExecutionId(symbol, positionSide, exchangeOrderId) : randomUUID()));
    const finalStatus = persistenceStatus === 'VERIFIED' ? 'VERIFIED'
      : ['FAILED', 'VERIFICATION_FAILED'].includes(persistenceStatus) ? 'FAILED' : 'EXECUTING';
    const verificationResult = { ...input.verificationResult, verified: exchangeVerified, exchangeVerified,
      persistenceStatus: exchangeVerified ? persistenceStatus : 'NOT_STARTED', cleanup: input.cleanup || null,
      checkedAt: input.verificationResult?.checkedAt || new Date().toISOString() };
    const request = { type: 'RECONCILE_EXTERNAL_CLOSE', symbol, positionSide, correlationId,
      protectiveOrderId: input.protectiveOrderId || null };
    const error = input.errorContext ? JSON.stringify(input.errorContext).slice(0, 10000) : null;
    await this.db.execute(`INSERT INTO trade_executions
      (execution_id,request_type,symbol,position_side,request_payload,exchange_order_id,exchange_response,
       verification_result,requested_at,executed_at,verified_at,completed_at,final_status,attempt_count,error)
      VALUES (?,?,?,?,?,?,?,?,NOW(3),NOW(3),NOW(3),IF(?='EXECUTING',NULL,NOW(3)),?,1,?)
      ON DUPLICATE KEY UPDATE
        exchange_response=VALUES(exchange_response),verification_result=VALUES(verification_result),
        completed_at=IF(VALUES(final_status)='EXECUTING',completed_at,NOW(3)),
        final_status=IF(final_status='VERIFIED','VERIFIED',VALUES(final_status)),error=VALUES(error)`,
    [executionId, 'RECONCILE_EXTERNAL_CLOSE', symbol, positionSide, json(request), exchangeOrderId,
      json(input.exchangeResponse), json(verificationResult), finalStatus, finalStatus, error]);
    await this.event(executionId, persistenceStatus === 'VERIFICATION_FAILED' ? 'EXTERNAL_CLOSE_VERIFICATION_FAILED'
      : persistenceStatus === 'FAILED' ? 'RECONCILIATION_PERSISTENCE_FAILED'
      : persistenceStatus === 'VERIFIED' ? 'RECONCILIATION_VERIFIED' : 'EXTERNAL_CLOSE_VERIFIED', {
      correlationId, exchangeOrderId: exchangeOrderId || null,
      verificationStatus: exchangeVerified ? 'VERIFIED' : 'FAILED', persistenceStatus: verificationResult.persistenceStatus,
      cleanup: input.cleanup || null, error: input.errorContext || null
    });
    return { ok: finalStatus !== 'FAILED', executionId, correlationId: correlationId || executionId,
      exchangeOrderId, verificationResult, persistenceStatus, finalStatus };
  }

  closeReasonLabel(closeReason, stage) {
    if (closeReason === 'SL') {
      return stage === 'TIME_LOCK' ? 'Time Lock Stop'
        : stage === 'BREAKEVEN' ? 'Break Even Stop'
          : stage === 'LOCK' ? 'Locked Profit Stop'
            : stage === 'TRAILING' ? 'Trailing Stop' : 'Stop Loss';
    }
    if (closeReason === 'TP') return 'Take Profit';
    if (closeReason === 'TIME_EXIT') return 'Time Exit';
    return closeReason === 'SYNC' ? 'State Recovery' : 'Manual Close';
  }

  async cleanupVerifiedClose(symbol, positionSide) {
    const request = { symbol, positionSide };
    let snapshot = await this.snapshot(request);
    const cancellations = [];
    for (const order of snapshot.protectiveOrders) cancellations.push(await this.cancelProtection(order));
    snapshot = await this.readUntil(request, state => !state.position && state.protectiveOrders.length === 0,
      'verified close protective-order cleanup');
    return { verified: true, cancellations, remaining: snapshot.protectiveOrders,
      checkedAt: new Date().toISOString() };
  }

  async publishFinalizedClose(close) {
    const dashboardResponse = await fetch(
      `${this.config.dashboardBase}/trade/${close.symbol}?reason=${close.closeReason.toLowerCase()}&exitPrice=${close.exitPrice}`,
      { method: 'DELETE', signal: AbortSignal.timeout(5000) }
    );
    if (!dashboardResponse.ok) {
      const error = new Error(`Finalized-close Dashboard publication failed (HTTP ${dashboardResponse.status})`);
      error.httpMethod = 'DELETE';
      error.url = `${this.config.dashboardBase}/trade/${close.symbol}`;
      error.statusCode = dashboardResponse.status;
      throw error;
    }
  }

  async removeFinalizedMonitorState(close) {
    const response = await fetch(`${this.config.n8nBase}/webhook/sl-monitor-delete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: close.symbol, executionId: close.executionId }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Finalized-close SL Monitor cleanup failed (HTTP ${response.status})`);
  }

  async sendCanonicalClose(close) {
    if (!this.config.telegramToken || !this.config.telegramChatId) {
      throw new Error('Telegram close notification is not configured');
    }
    const pnl = Number(close.pnl || 0);
    const rFinal = Number(close.rFinal || 0);
    const message = ['🛑 TRADE CLOSED', `${close.symbol} ${close.positionSide}`,
      `Reason: ${this.closeReasonLabel(close.closeReason, close.trailingStage)}`,
      `Execution ID: ${close.executionId}`, `Final Stage: ${close.trailingStage}`,
      `PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`,
      `Final R: ${rFinal >= 0 ? '+' : ''}${rFinal.toFixed(2)}R`,
      `Duration: ${close.durationMinutes} minutes`].join('\n');
    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.config.telegramChatId, text: message }),
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.description || `Telegram HTTP ${response.status}`);
    return { messageId: body.result?.message_id || null };
  }

  async finalizeExternalClose(input) {
    if (input.verificationResult?.verified !== true) {
      throw new Error('External close finalization requires verified Binance evidence');
    }
    let reconciliation = await this.recordExternalClose({ ...input, persistenceStatus: 'PENDING' });
    const [tradeRows] = await this.db.execute(`SELECT * FROM trades WHERE symbol=? AND direction=?
      ORDER BY opened_at DESC LIMIT 1`, [input.symbol, input.positionSide]);
    const trade = tradeRows[0];
    if (!trade) throw new Error(`No trade lifecycle exists for ${input.symbol} ${input.positionSide}`);
    const exitPrice = Number(input.exitPrice);
    const pnl = Number(input.pnl);
    const closeReason = String(input.closeReason || 'MANUAL').toUpperCase();
    const trailingStage = trade.trailing_stage || input.trailingStage || 'INITIAL';
    const initialRisk = Math.abs(Number(trade.entry_price) - Number(trade.initial_sl_price ?? trade.sl_price));
    const rFinal = input.rFinal != null ? Number(input.rFinal)
      : initialRisk > 0 ? (Math.abs(exitPrice - Number(trade.entry_price)) / initialRisk) * (pnl >= 0 ? 1 : -1) : 0;
    const closedAt = Number(input.closedAt || Date.now());
    const durationMinutes = input.durationMinutes != null ? Number(input.durationMinutes)
      : Math.max(0, Math.round((closedAt - new Date(trade.opened_at).getTime()) / 60000));
    const close = { tradeId: trade.id, executionId: reconciliation.executionId,
      correlationId: reconciliation.correlationId, symbol: input.symbol, positionSide: input.positionSide,
      exchangeOrderId: String(input.exchangeOrderId), exitPrice, pnl, rFinal, closeReason,
      trailingStage, durationMinutes, closedAt };

    const connection = await this.db.getConnection();
    let lifecycleId;
    try {
      await connection.beginTransaction();
      const [lockedTrades] = await connection.execute('SELECT id FROM trades WHERE id=? FOR UPDATE', [trade.id]);
      if (!lockedTrades.length) throw new Error(`Trade ${trade.id} disappeared during close finalization`);
      const [existingClose] = await connection.execute('SELECT id FROM trade_closes WHERE trade_id=? LIMIT 1 FOR UPDATE', [trade.id]);
      const pnlPct = Number(trade.entry_price) * Number(trade.qty) > 0
        ? pnl / (Number(trade.entry_price) * Number(trade.qty)) * 100 : 0;
      if (!existingClose.length) {
        await connection.execute(`INSERT INTO trade_closes
          (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at)
          VALUES (?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?/1000))`, [trade.id, input.symbol, exitPrice, pnl, pnlPct,
          rFinal, closeReason, trailingStage, durationMinutes, closedAt]);
      } else {
        await connection.execute(`UPDATE trade_closes SET exit_price=?,pnl_usdt=?,pnl_pct=?,r_final=?,
          close_reason=?,trailing_stage=?,duration_minutes=?,closed_at=FROM_UNIXTIME(?/1000) WHERE id=?`,
        [exitPrice, pnl, pnlPct, rFinal, closeReason, trailingStage, durationMinutes, closedAt, existingClose[0].id]);
      }
      await connection.execute("UPDATE trades SET status='CLOSED',updated_at=FROM_UNIXTIME(?/1000) WHERE id=?",
        [closedAt, trade.id]);
      await connection.execute(`INSERT IGNORE INTO trade_lifecycle_events
        (trade_id,execution_id,event_type,event_payload,notification_status)
        VALUES (?,?,'CLOSE_FINALIZED',?,'PENDING')`, [trade.id, reconciliation.executionId, json(close)]);
      const [lifecycleRows] = await connection.execute(`SELECT id FROM trade_lifecycle_events
        WHERE trade_id=? AND event_type='CLOSE_FINALIZED' LIMIT 1`, [trade.id]);
      lifecycleId = lifecycleRows[0].id;
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }

    const cleanup = await this.cleanupVerifiedClose(input.symbol, input.positionSide);
    await this.publishFinalizedClose(close);
    reconciliation = await this.recordExternalClose({ ...input, executionId: reconciliation.executionId,
      correlationId: reconciliation.correlationId, persistenceStatus: 'VERIFIED', cleanup });
    await this.db.execute(`UPDATE trade_lifecycle_events SET event_payload=? WHERE id=?`,
      [json({ ...close, cleanup, finalStatus: 'FINISHED' }), lifecycleId]);

    const [claim] = await this.db.execute(`UPDATE trade_lifecycle_events SET notification_status='SENDING'
      WHERE id=? AND notification_status='PENDING'`, [lifecycleId]);
    let notification = { owner: false, sent: false };
    if (claim.affectedRows) {
      notification.owner = true;
      try {
        const telegram = await this.sendCanonicalClose(close);
        await this.db.execute(`UPDATE trade_lifecycle_events SET notification_status='SENT',notified_at=NOW(3),
          notification_error=NULL WHERE id=?`, [lifecycleId]);
        notification = { owner: true, sent: true, ...telegram };
      } catch (error) {
        await this.db.execute(`UPDATE trade_lifecycle_events SET notification_status='FAILED',notification_error=? WHERE id=?`,
          [String(error.stack || error.message).slice(0, 10000), lifecycleId]);
        throw error;
      }
    }
    await this.removeFinalizedMonitorState(close);
    return { ok: true, status: 'FINISHED', finalStatus: 'VERIFIED', executionId: reconciliation.executionId,
      correlationId: reconciliation.correlationId, exchangeOrderId: String(input.exchangeOrderId),
      verificationResult: reconciliation.verificationResult, persistenceStatus: 'VERIFIED', cleanup,
      canonicalClose: close, notification };
  }

  async execute(input) {
    let request;
    try { request = this.normalize(input); }
    catch (error) {
      return { ok: false, executionId: input?.executionId || null, timestamp: new Date().toISOString(),
        finalStatus: 'FAILED', error: error.message };
    }
    if (this.inFlight.has(request.executionId)) return this.inFlight.get(request.executionId);
    const promise = this.run(request).finally(() => this.inFlight.delete(request.executionId));
    this.inFlight.set(request.executionId, promise);
    return promise;
  }

  async run(request) {
    const previous = await this.existing(request.executionId);
    if (previous && TERMINAL_STATUSES.has(previous.finalStatus)) return previous;
    if (!previous) {
      await this.db.execute(`INSERT INTO trade_executions
        (execution_id,request_type,symbol,position_side,request_payload,requested_at,final_status)
        VALUES (?,?,?,?,?,NOW(3),'REQUESTED')`, [request.executionId, request.type, request.symbol,
        request.positionSide, json(request)]);
      await this.event(request.executionId, 'EXECUTION_REQUESTED', request);
    }

    let exchangeResponse = null;
    let verificationResult = null;
    let exchangeOrderId = null;
    let lastError = null;
    let attempts = 0;
    for (attempts = 1; attempts <= request.maxAttempts; attempts++) {
      try {
        await this.db.execute(`UPDATE trade_executions SET final_status='EXECUTING',attempt_count=? WHERE execution_id=?`,
          [attempts, request.executionId]);
        await this.event(request.executionId, 'EXECUTION_ATTEMPTED', { attempt: attempts });
        const result = await this.dispatch(request);
        exchangeResponse = result.exchangeResponse;
        verificationResult = result.verificationResult;
        exchangeOrderId = result.exchangeOrderId;
        if (!verificationResult?.verified) throw Object.assign(new Error('Binance read-back verification failed'), { verificationResult });
        await this.persistVerifiedState(request, verificationResult, exchangeResponse);
        verificationResult = { ...verificationResult, verified: true, exchangeVerified: true,
          pipelineVerified: true, persistenceStatus: 'VERIFIED' };
        await this.db.execute(`UPDATE trade_executions SET exchange_order_id=?,exchange_response=?,
          verification_result=?,executed_at=NOW(3),verified_at=NOW(3),completed_at=NOW(3),final_status='VERIFIED',error=NULL
          WHERE execution_id=?`, [String(exchangeOrderId), json(exchangeResponse), json(verificationResult), request.executionId]);
        await this.event(request.executionId, 'EXECUTION_VERIFIED', verificationResult);
        return { ok: true, executionId: request.executionId, type: request.type, symbol: request.symbol,
          positionSide: request.positionSide, exchangeOrderId: String(exchangeOrderId), exchangeResponse,
          verificationResult, timestamp: new Date().toISOString(), finalStatus: 'VERIFIED', attemptCount: attempts };
      } catch (error) {
        lastError = error;
        verificationResult = error.verificationResult || verificationResult;
        exchangeResponse = error.exchangeResponse || exchangeResponse;
        exchangeOrderId = error.exchangeOrderId || exchangeOrderId;
        await this.event(request.executionId, 'EXECUTION_ATTEMPT_FAILED', { attempt: attempts, error: serializeError(error) });
        if (!retryable(error) || attempts === request.maxAttempts) break;
        await sleep(Math.min(60000, Math.max(300 * attempts, Number(error.retryAfterMs || 0))));
      }
    }
    const exchangeWasVerified = verificationResult?.verified === true;
    const portfolioRejected = request.type === 'OPEN_POSITION'
      && lastError?.code === 'PORTFOLIO_CAPACITY_REJECTED';
    const failureCategory = portfolioRejected ? 'EXECUTION_REJECTED'
      : exchangeWasVerified ? 'PERSISTENCE_FAILURE'
      : (lastError?.verificationResult || /verif|read-back|visible on Binance/i.test(String(lastError?.message || '')))
        ? 'VERIFICATION_FAILURE' : 'EXECUTION_FAILURE';
    const finalStatus = portfolioRejected ? 'REJECTED' : 'FAILED';
    const failureVerification = { ...(verificationResult || {}), verified: false,
      exchangeVerified: exchangeWasVerified, pipelineVerified: false,
      checkedAt: verificationResult?.checkedAt || new Date().toISOString(), error: serializeError(lastError) };
    await this.db.execute(`UPDATE trade_executions SET exchange_order_id=?,exchange_response=?,verification_result=?,
      executed_at=COALESCE(executed_at,NOW(3)),completed_at=NOW(3),final_status=?,attempt_count=?,error=?
      WHERE execution_id=?`, [
      exchangeOrderId == null ? null : String(exchangeOrderId), json(exchangeResponse), json(failureVerification), finalStatus, attempts,
      String(lastError?.message || lastError || 'Execution failed').slice(0, 10000), request.executionId
    ]);
    await this.event(request.executionId, portfolioRejected ? 'EXECUTION_REJECTED' : 'EXECUTION_FAILED', failureVerification);
    const notificationPolicy = failureNotificationPolicy(request, lastError, exchangeWasVerified, failureCategory);
    let failureNotificationSent = false;
    if (notificationPolicy.notify) {
      try { failureNotificationSent = await this.notifyFailure(request, lastError, exchangeWasVerified, failureCategory) === true; }
      catch (_) { failureNotificationSent = false; }
    }
    return { ok: false, executionId: request.executionId, type: request.type, symbol: request.symbol,
      positionSide: request.positionSide, exchangeOrderId: exchangeOrderId == null ? null : String(exchangeOrderId),
      exchangeResponse, verificationResult: failureVerification, timestamp: new Date().toISOString(),
      finalStatus, status: portfolioRejected ? 'PORTFOLIO_CAPACITY_REJECTED' : finalStatus,
      rejectionReason: portfolioRejected ? lastError.body?.primaryReason || null : null,
      portfolioCapacity: portfolioRejected ? lastError.body || null : null,
      attemptCount: attempts, failureCategory, failureNotificationSent,
      failureNotificationSuppressed: !notificationPolicy.notify,
      notificationPolicyReason: notificationPolicy.reason,
      errorContext: { executionId: request.executionId, correlationId: request.correlationId || request.executionId,
        ...serializeError(lastError), verificationStatus: exchangeWasVerified ? 'VERIFIED'
          : failureCategory === 'VERIFICATION_FAILURE' ? 'FAILED' : 'NOT_STARTED',
        persistenceStatus: exchangeWasVerified ? 'FAILED' : 'NOT_STARTED' },
      error: String(lastError?.message || lastError || 'Execution failed') };
  }

  async snapshot(request) {
    const [rows, regular, algo] = await Promise.all([
      this.binance.positions(request.symbol), this.binance.openOrders(request.symbol), this.binance.openAlgoOrders(request.symbol)
    ]);
    const position = rows.map(normalizePosition).filter(Boolean)
      .find(row => row.symbol === request.symbol && row.side === request.positionSide) || null;
    const orders = [...regular, ...algo].filter(order => order.symbol === request.symbol && active(order));
    const contextual = position || { symbol: request.symbol, side: request.positionSide, positionSide: request.positionSide };
    return {
      position,
      protectiveOrders: orders.filter(order => isStop(order, contextual) || isTakeProfit(order, contextual))
    };
  }

  async readUntil(request, predicate, label) {
    let snapshot;
    for (let attempt = 1; attempt <= 8; attempt++) {
      snapshot = await this.snapshot(request);
      if (predicate(snapshot)) return snapshot;
      await sleep(Math.min(1000, 150 * attempt));
    }
    const error = new Error(`${label} was not visible on Binance after read-back`);
    error.verificationResult = { verified: false, label, checkedAt: new Date().toISOString(), actual: snapshot };
    throw error;
  }

  dispatch(request) {
    if (request.type === 'OPEN_POSITION') return this.serializedOpenPosition(request);
    if (['MOVE_STOP_LOSS', 'MOVE_TAKE_PROFIT', 'TRAILING_STOP'].includes(request.type)) {
      return this.replaceProtection(request);
    }
    return this.reducePosition(request);
  }

  async serializedOpenPosition(request) {
    const previous = this.openAllocationLock;
    let release;
    this.openAllocationLock = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await this.openPosition(request); }
    finally { release(); }
  }

  async symbolRules(symbol) {
    const exchange = await this.binance.exchangeInfo();
    const row = exchange.symbols?.find(item => item.symbol === symbol);
    if (!row) throw new Error(`Symbol ${symbol} is not available on Binance Futures`);
    const price = row.filters.find(filter => filter.filterType === 'PRICE_FILTER');
    const lot = row.filters.find(filter => filter.filterType === 'LOT_SIZE');
    const notional = row.filters.find(filter => ['MIN_NOTIONAL', 'NOTIONAL'].includes(filter.filterType));
    return { tick: Number(price?.tickSize || 0), step: Number(lot?.stepSize || 0),
      minQty: Number(lot?.minQty || 0), minNotional: Number(notional?.notional || notional?.minNotional || 0) };
  }

  rounded(value, increment, mode = 'nearest') {
    if (!(increment > 0)) return Number(value);
    const places = Math.max(0, String(increment).split('.')[1]?.replace(/0+$/, '').length || 0);
    const ratio = Number(value) / increment;
    const units = mode === 'floor' ? Math.floor(ratio) : Math.round(ratio);
    return Number((units * increment).toFixed(places));
  }

  async abortOpen(request, position, cause) {
    const id = safeId('aterum_abort', request.executionId);
    let response = await this.recoverMarketOrder(request, id);
    if (!response) {
      try {
        response = await this.binance.createOrder({
          symbol: request.symbol, side: closeSide(request.positionSide), positionSide: request.positionSide,
          type: 'MARKET', quantity: position.qty, newOrderRespType: 'RESULT', newClientOrderId: id
        });
      } catch (error) {
        response = await this.recoverMarketOrder(request, id);
        if (!response) throw error;
      }
    }
    const after = await this.readUntil(request, snapshot => !snapshot.position, 'emergency rollback close');
    for (const order of after.protectiveOrders) await this.cancelProtection(order);
    const verified = await this.readUntil(request, snapshot => !snapshot.position && snapshot.protectiveOrders.length === 0,
      'emergency rollback cleanup');
    const error = new Error(`Open position rolled back because protection failed: ${cause.message}`);
    error.retryable = false;
    error.exchangeOrderId = orderId(response);
    error.exchangeResponse = { emergencyClose: response };
    error.verificationResult = { verified: false, rolledBack: true, after: verified, cause: serializeError(cause),
      checkedAt: new Date().toISOString() };
    throw error;
  }

  async openPosition(request) {
    const before = await this.snapshot(request);
    const marketClientId = safeId('aterum_entry', request.executionId);
    let marketOrder = await this.recoverMarketOrder(request, marketClientId);
    if (before.position && !marketOrder) throw new Error(`${request.symbol} ${request.positionSide} is already open on Binance`);
    const [rules, ticker] = await Promise.all([this.symbolRules(request.symbol), this.binance.tickerPrice(request.symbol)]);
    const livePrice = number(ticker.price, 'livePrice');
    const quantity = this.rounded(request.quantity, rules.step, 'floor');
    const stopLoss = this.rounded(request.stopLoss, rules.tick);
    const takeProfit = this.rounded(request.takeProfit, rules.tick);
    if (!(quantity >= rules.minQty) || quantity * livePrice < rules.minNotional) {
      throw new Error(`Requested quantity violates Binance minimums (qty=${quantity}, notional=${quantity * livePrice})`);
    }
    const long = request.positionSide === 'LONG';
    if ((long && stopLoss >= livePrice) || (!long && stopLoss <= livePrice)) {
      throw new Error(`Stop loss ${stopLoss} would immediately trigger at Binance price ${livePrice}`);
    }
    if ((long && takeProfit <= livePrice) || (!long && takeProfit >= livePrice)) {
      throw new Error(`Take profit ${takeProfit} is on the wrong side of Binance price ${livePrice}`);
    }
    let portfolioAllocation = null;
    if (this.portfolioAllocator) {
      portfolioAllocation = await this.portfolioAllocator.capacity({ symbol: request.symbol,
        positionSide: request.positionSide, quantity, entryPrice: livePrice, stopLoss, leverage: request.leverage });
      if (!portfolioAllocation.allowed) {
        const primary = portfolioAllocation.primaryReason || { code: 'PORTFOLIO_CAPACITY_REJECTED' };
        const error = new Error(`${primary.code}: portfolio capacity rejected the entry`);
        error.code = 'PORTFOLIO_CAPACITY_REJECTED';
        error.body = portfolioAllocation;
        error.retryable = false;
        throw error;
      }
    }
    const positionMode = await this.binance.positionMode();
    if (positionMode?.dualSidePosition !== true) {
      const error = new Error('HEDGE_MODE_REQUIRED: Binance account is in One-way mode; switch to Hedge mode after cancelling open orders');
      error.code = 'HEDGE_MODE_REQUIRED';
      error.retryable = false;
      throw error;
    }
    try { await this.binance.changeMarginType(request.symbol, 'ISOLATED'); }
    catch (error) { if (Number(error.code) !== -4046) throw error; }
    await this.binance.changeLeverage(request.symbol, request.leverage);

    if (!before.position && !marketOrder) {
      try {
        marketOrder = await this.binance.createOrder({ symbol: request.symbol, side: long ? 'BUY' : 'SELL',
          positionSide: request.positionSide, type: 'MARKET', quantity, newOrderRespType: 'RESULT',
          newClientOrderId: marketClientId });
      } catch (error) {
        marketOrder = await this.recoverMarketOrder(request, marketClientId);
        if (!marketOrder) throw error;
      }
    }
    const afterMarket = before.position ? before
      : await this.readUntil(request, snapshot => Boolean(snapshot.position), 'opened position');
    const confirmed = afterMarket.position;
    let stopResult; let takeProfitResult;
    try {
      stopResult = await this.replaceProtection({ ...request, type: 'MOVE_STOP_LOSS', targetPrice: stopLoss });
      takeProfitResult = await this.replaceProtection({ ...request, type: 'MOVE_TAKE_PROFIT', targetPrice: takeProfit });
      const after = await this.readUntil(request, snapshot => {
        const context = snapshot.position;
        return Boolean(context)
          && snapshot.protectiveOrders.some(order => isStop(order, context) && near(triggerPrice(order), stopLoss))
          && snapshot.protectiveOrders.some(order => isTakeProfit(order, context) && near(triggerPrice(order), takeProfit));
      }, 'opened position with stop loss and take profit');
      return {
        exchangeOrderId: orderId(marketOrder),
        exchangeResponse: { marketOrder, stopOrder: stopResult.exchangeResponse,
          takeProfitOrder: takeProfitResult.exchangeResponse },
        verificationResult: { verified: true, requested: { type: request.type, quantity, stopLoss, takeProfit },
          portfolioAllocation, before, after, checkedAt: new Date().toISOString() }
      };
    } catch (error) {
      try { await this.abortOpen(request, confirmed, error); }
      catch (rollbackError) {
        rollbackError.exchangeOrderId = orderId(marketOrder);
        rollbackError.exchangeResponse = { marketOrder, stopOrder: stopResult?.exchangeResponse || null,
          takeProfitOrder: takeProfitResult?.exchangeResponse || null,
          rollback: rollbackError.exchangeResponse || null };
        throw rollbackError;
      }
    }
    throw new Error('Open position rollback did not return a terminal result');
  }

  protectionMatcher(request, order) {
    const context = { symbol: request.symbol, side: request.positionSide, positionSide: request.positionSide };
    if (request.type === 'MOVE_TAKE_PROFIT') return isTakeProfit(order, context);
    return isStop(order, context);
  }

  requestedOrderMatches(request, order, ids) {
    if (!this.protectionMatcher(request, order) || !active(order)) return false;
    if (ids?.length && !ids.includes(clientId(order))) return false;
    if (request.type === 'TRAILING_STOP' && request.callbackRate != null) {
      return String(order.orderType || order.type || '').toUpperCase() === 'TRAILING_STOP_MARKET'
        && near(order.callbackRate, request.callbackRate)
        && near(order.activatePrice, request.activationPrice || request.targetPrice);
    }
    return near(triggerPrice(order), request.targetPrice);
  }

  async createProtection(request, position, ids) {
    const isTp = request.type === 'MOVE_TAKE_PROFIT';
    const trailingNative = request.type === 'TRAILING_STOP' && request.callbackRate != null;
    const params = {
      algoType: 'CONDITIONAL', symbol: request.symbol, side: closeSide(request.positionSide),
      positionSide: request.positionSide,
      type: trailingNative ? 'TRAILING_STOP_MARKET' : isTp ? 'TAKE_PROFIT_MARKET' : 'STOP_MARKET',
      closePosition: 'true', workingType: request.workingType || (isTp ? 'MARK_PRICE' : 'CONTRACT_PRICE'),
      priceProtect: 'false', clientAlgoId: ids[0]
    };
    if (trailingNative) {
      params.callbackRate = request.callbackRate;
      params.activatePrice = request.activationPrice != null
        ? number(request.activationPrice, 'activationPrice') : request.targetPrice;
    } else params.triggerPrice = request.targetPrice;
    try {
      return await this.binance.createAlgoOrder(params);
    } catch (error) {
      const visible = await this.snapshot(request).catch(() => null);
      const recovered = visible?.protectiveOrders.find(order => this.requestedOrderMatches(request, order, ids));
      if (recovered) return recovered;
      if (retryable(error) || trailingNative) throw error;
      const fallback = { ...params, quantity: position.qty, clientAlgoId: ids[1] };
      delete fallback.closePosition;
      return this.binance.createAlgoOrder(fallback);
    }
  }

  async cancelProtection(order) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return order.algoId != null
          ? await this.binance.cancelAlgoOrder(order.algoId)
          : await this.binance.cancelOrder(order.symbol, order.orderId);
      } catch (error) {
        lastError = error;
        if ([-2011, -2013].includes(Number(error.code))) return { alreadyAbsent: true, orderId: orderId(order) };
        if (!retryable(error)) throw error;
        await sleep(200 * attempt);
      }
    }
    throw lastError;
  }

  async replaceProtection(request) {
    const before = await this.snapshot(request);
    if (!before.position) throw new Error(`No ${request.symbol} ${request.positionSide} position exists on Binance`);
    const prefix = request.type === 'MOVE_TAKE_PROFIT' ? 'aterum_tp' : request.type === 'TRAILING_STOP' ? 'aterum_trail' : 'aterum_sl';
    const ids = [safeId(prefix, request.executionId), safeId(`${prefix}q`, request.executionId)];
    let created = before.protectiveOrders.find(order => this.requestedOrderMatches(request, order, ids));
    if (!created) created = await this.createProtection(request, before.position, ids);
    const exchangeOrderId = orderId(created);
    if (exchangeOrderId == null) throw Object.assign(new Error('Binance did not return an exchange order ID'), { exchangeResponse: created });
    const afterCreate = await this.readUntil(request,
      snapshot => snapshot.protectiveOrders.some(order => this.requestedOrderMatches(request, order, ids)), 'new protective order');
    const target = afterCreate.protectiveOrders.find(order => this.requestedOrderMatches(request, order, ids));
    const superseded = afterCreate.protectiveOrders.filter(order =>
      this.protectionMatcher(request, order) && String(orderId(order)) !== String(orderId(target)));
    const cancellations = [];
    for (const order of superseded) cancellations.push(await this.cancelProtection(order));
    const after = await this.readUntil(request, snapshot => {
      const desired = snapshot.protectiveOrders.filter(order => this.requestedOrderMatches(request, order, ids));
      const stale = snapshot.protectiveOrders.filter(order => superseded.some(old => String(orderId(old)) === String(orderId(order))));
      return Boolean(snapshot.position) && desired.length === 1 && stale.length === 0;
    }, 'final protective order state');
    return {
      exchangeOrderId,
      exchangeResponse: { create: created, cancellations },
      verificationResult: {
        verified: true, requested: { type: request.type, targetPrice: request.targetPrice || null,
          callbackRate: request.callbackRate || null }, before, after, checkedAt: new Date().toISOString()
      }
    };
  }

  async recoverMarketOrder(request, id) {
    try { return await this.binance.queryOrder(request.symbol, id); }
    catch (_) { return null; }
  }

  async reducePosition(request) {
    const id = safeId(request.type === 'CLOSE_POSITION' ? 'aterum_close' : 'aterum_partial', request.executionId);
    let response = await this.recoverMarketOrder(request, id);
    const before = await this.snapshot(request);
    if (!before.position && !(request.type === 'CLOSE_POSITION' && response)) {
      throw new Error(`No ${request.symbol} ${request.positionSide} position exists on Binance`);
    }
    if (!before.position && response) {
      let after = before;
      const cancellations = [];
      for (const order of after.protectiveOrders) cancellations.push(await this.cancelProtection(order));
      after = await this.readUntil(request, snapshot => !snapshot.position && snapshot.protectiveOrders.length === 0,
        'closed position without stale protective orders');
      return { exchangeOrderId: orderId(response), exchangeResponse: { order: response, cancellations, recovered: true },
        verificationResult: { verified: true, requested: { type: request.type }, before: null, after,
          checkedAt: new Date().toISOString() } };
    }
    if (request.type === 'PARTIAL_TAKE_PROFIT' && request.quantity >= before.position.qty) {
      throw new Error('Partial take profit quantity must be smaller than the current Binance position; use CLOSE_POSITION');
    }
    const quantity = request.type === 'CLOSE_POSITION'
      ? before.position.qty
      : Math.min(request.quantity, before.position.qty);
    if (response && request.type === 'PARTIAL_TAKE_PROFIT') {
      const status = String(response.status || '').toUpperCase();
      if (!['FILLED', 'PARTIALLY_FILLED'].includes(status)) {
        throw Object.assign(new Error(`Recovered partial order is ${status || 'UNKNOWN'}`), { exchangeResponse: response });
      }
      return { exchangeOrderId: orderId(response), exchangeResponse: { order: response, recovered: true },
        verificationResult: { verified: true, requested: { type: request.type,
          quantity: Number(response.executedQty || response.origQty || request.quantity) }, before: null, after: before,
          checkedAt: new Date().toISOString() } };
    }
    if (!response) {
      const params = { symbol: request.symbol, side: closeSide(request.positionSide), type: 'MARKET', quantity,
        positionSide: request.positionSide, newClientOrderId: id, newOrderRespType: 'RESULT' };
      try { response = await this.binance.createOrder(params); }
      catch (error) {
        response = await this.recoverMarketOrder(request, id);
        if (!response) throw error;
      }
    }
    const exchangeOrderId = orderId(response);
    if (exchangeOrderId == null) throw Object.assign(new Error('Binance did not return an exchange order ID'), { exchangeResponse: response });
    const expectedMax = Math.max(0, before.position.qty - quantity);
    let after = await this.readUntil(request, snapshot => request.type === 'CLOSE_POSITION'
      ? !snapshot.position
      : !snapshot.position || snapshot.position.qty <= expectedMax + Math.max(1e-8, before.position.qty * 1e-7),
    request.type === 'CLOSE_POSITION' ? 'closed position' : 'reduced position');
    const cancellations = [];
    if (!after.position) {
      for (const order of after.protectiveOrders) cancellations.push(await this.cancelProtection(order));
      after = await this.readUntil(request, snapshot => !snapshot.position && snapshot.protectiveOrders.length === 0,
        'closed position without stale protective orders');
    }
    return {
      exchangeOrderId,
      exchangeResponse: { order: response, cancellations },
      verificationResult: { verified: true, requested: { type: request.type, quantity }, before, after,
        checkedAt: new Date().toISOString() }
    };
  }

  async persistVerifiedState(request, verification, exchangeResponse) {
    const after = verification.after;
    if (request.type === 'OPEN_POSITION') {
      await this.persistOpenState(request, verification, exchangeResponse);
    } else if (['MOVE_STOP_LOSS', 'TRAILING_STOP'].includes(request.type)) {
      const stage = ['INITIAL','BREAKEVEN','TIME_LOCK','LOCK','TRAILING'].includes(request.requestedStage)
        ? request.requestedStage : null;
      const [updated] = await this.db.execute(`UPDATE trades SET sl_price=?,trailing_stage=COALESCE(?,trailing_stage),updated_at=NOW()
        WHERE symbol=? AND direction=? AND status='OPEN'`,
        [request.targetPrice || triggerPrice(after.protectiveOrders.find(order => this.protectionMatcher(request, order))),
          stage, request.symbol, request.positionSide]);
      if (!updated.affectedRows) throw new Error('Verified Binance SL could not be matched to an open local trade');
      await this.publishOpenState(request);
    } else if (request.type === 'MOVE_TAKE_PROFIT') {
      const [updated] = await this.db.execute(`UPDATE trades SET tp_price=?,updated_at=NOW() WHERE symbol=? AND direction=? AND status='OPEN'`,
        [request.targetPrice, request.symbol, request.positionSide]);
      if (!updated.affectedRows) throw new Error('Verified Binance TP could not be matched to an open local trade');
      await this.publishOpenState(request);
    } else if (request.type === 'PARTIAL_TAKE_PROFIT') {
      const [updated] = await this.db.execute(`UPDATE trades SET qty=?,updated_at=NOW() WHERE symbol=? AND direction=? AND status='OPEN'`,
        [after.position?.qty || 0, request.symbol, request.positionSide]);
      if (!updated.affectedRows) throw new Error('Verified Binance reduction could not be matched to an open local trade');
      await this.publishOpenState(request);
    } else if (request.type === 'CLOSE_POSITION') {
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(`SELECT * FROM trades WHERE symbol=? AND direction=? AND status='OPEN'
          ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`, [request.symbol, request.positionSide]);
        const trade = rows[0];
        if (trade) {
          const exitPrice = Number(exchangeResponse?.order?.avgPrice || verification.before?.position?.markPrice
            || trade.entry_price);
          const qty = Number(verification.before?.position?.qty || trade.qty || 0);
          const entryPrice = Number(trade.entry_price || verification.before?.position?.entryPrice || 0);
          const pnl = request.positionSide === 'SHORT' ? (entryPrice - exitPrice) * qty : (exitPrice - entryPrice) * qty;
          const initialRisk = Math.abs(entryPrice - Number(trade.initial_sl_price ?? trade.sl_price ?? entryPrice));
          const rFinal = initialRisk > 0 ? (Math.abs(exitPrice - entryPrice) / initialRisk) * (pnl >= 0 ? 1 : -1) : 0;
          const reasonText = String(request.reason || '').toUpperCase();
          const closeReason = reasonText.includes('STOP') ? 'SL' : reasonText.includes('TIME') ? 'TIME_EXIT' : 'MANUAL';
          const [existingClose] = await connection.execute('SELECT id FROM trade_closes WHERE trade_id=? LIMIT 1', [trade.id]);
          if (!existingClose.length) {
            await connection.execute(`INSERT INTO trade_closes
              (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at)
              VALUES (?,?,?,?,?,?,?,?,?,NOW())`, [trade.id, request.symbol, exitPrice, pnl,
              entryPrice * qty > 0 ? pnl / (entryPrice * qty) * 100 : 0, rFinal, closeReason,
              trade.trailing_stage || 'INITIAL', Math.max(0, Math.round((Date.now() - new Date(trade.opened_at).getTime()) / 60000))]);
          }
          await connection.execute("UPDATE trades SET status='CLOSED',updated_at=NOW() WHERE id=?", [trade.id]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
      await this.removeLocalState(request, exchangeResponse);
    }
  }

  async persistOpenState(request, verification, exchangeResponse) {
    const context = request.tradeContext || {};
    const position = verification.after.position;
    const confirmed = verification.requested;
    const stopCreate = exchangeResponse?.stopOrder?.create || {};
    const tpCreate = exchangeResponse?.takeProfitOrder?.create || {};
    const response = await fetch(`${this.config.dashboardBase}/db/trade/open`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ ...context, executionId: request.executionId, symbol: request.symbol,
        direction: request.positionSide, entryPrice: position.entryPrice, initialSL: confirmed.stopLoss,
        sl: confirmed.stopLoss, tp: confirmed.takeProfit, qty: position.qty, leverage: request.leverage,
        marketOrderId: orderId(exchangeResponse?.marketOrder), slOrderId: orderId(stopCreate),
        tpOrderId: orderId(tpCreate), slMonitorRequired: true, trailingStage: 'INITIAL' })
    });
    if (!response.ok) throw new Error(`Verified entry persistence failed with Dashboard HTTP ${response.status}`);
    await this.publishOpenState(request);
  }

  async publishOpenState(request) {
    const [rows] = await this.db.execute(`SELECT * FROM trades
      WHERE symbol=? AND direction=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`,
    [request.symbol, request.positionSide]);
    const trade = rows[0];
    if (!trade) throw new Error('Open local trade disappeared before state publication');
    const payload = { symbol: request.symbol, executionId: request.executionId, positionSide: request.positionSide,
      slPrice: trade.sl_price == null ? null : Number(trade.sl_price), qty: Number(trade.qty),
      side: closeSide(request.positionSide), entryPrice: Number(trade.entry_price),
      initialSL: Number(trade.initial_sl_price ?? trade.sl_price), stage: trade.trailing_stage || 'INITIAL',
      tp: trade.tp_price == null ? null : Number(trade.tp_price), leverage: Number(trade.leverage),
      openedAt: new Date(trade.opened_at).getTime(), source: 'VERIFIED_EXECUTION' };
    const [monitorResponse, dashboardResponse] = await Promise.all([
      fetch(`${this.config.n8nBase}/webhook/sl-monitor-set`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      }),
      fetch(`${this.config.dashboardBase}/trade`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          symbol: request.symbol, side: request.positionSide, entryPrice: payload.entryPrice, sl: payload.slPrice,
          tp: payload.tp, qty: payload.qty, leverage: payload.leverage, openedAt: payload.openedAt,
          stage: payload.stage, initialSL: payload.initialSL
        }), signal: AbortSignal.timeout(5000)
      })
    ]);
    if (!monitorResponse.ok || !dashboardResponse.ok) {
      throw new Error(`Local state publication failed (n8n=${monitorResponse.status}, dashboard=${dashboardResponse.status})`);
    }
  }

  async removeLocalState(request, exchangeResponse) {
    const exitPrice = Number(exchangeResponse?.order?.avgPrice || 0) || null;
    const reasonText = String(request.reason || '').toUpperCase();
    const reason = reasonText.includes('STOP') ? 'sl' : reasonText.includes('TIME') ? 'time_exit' : 'manual';
    const [monitorResponse, dashboardResponse] = await Promise.all([
      fetch(`${this.config.n8nBase}/webhook/sl-monitor-delete`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: request.symbol, executionId: request.executionId }),
        signal: AbortSignal.timeout(5000)
      }),
      fetch(`${this.config.dashboardBase}/trade/${request.symbol}?reason=${reason}${exitPrice ? `&exitPrice=${exitPrice}` : ''}`, {
        method: 'DELETE', signal: AbortSignal.timeout(5000)
      })
    ]);
    if (!monitorResponse.ok || !dashboardResponse.ok) {
      throw new Error(`Closed-state publication failed (n8n=${monitorResponse.status}, dashboard=${dashboardResponse.status})`);
    }
  }

  async notifyFailure(request, error, exchangeWasVerified = false, failureCategory = null) {
    if (!this.config.telegramToken || !this.config.telegramChatId) return false;
    if (failureCategory === 'EXECUTION_REJECTED') {
      const capacity = error?.body || {};
      const reason = capacity.primaryReason || {};
      const currentPct = Number(reason.current || 0);
      const maximumPct = Number(reason.maximum || 0);
      const equity = Number(capacity.account?.equity || 0);
      const current = equity > 0 ? equity * currentPct / 100 : currentPct;
      const maximum = equity > 0 ? equity * maximumPct / 100 : maximumPct;
      const remaining = Math.max(0, maximum - current);
      const label = String(reason.code || 'PORTFOLIO_CAPACITY_REJECTED')
        .toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
      const direction = String(reason.direction || request.positionSide || '').toUpperCase();
      const message = ['❌ TRADE REJECTED', request.symbol, '', `Reason: ${label}`,
        direction ? `Current ${direction} Exposure: ${current.toFixed(2)} USDT (${currentPct.toFixed(2)}% equity)` : null,
        maximum > 0 ? `Maximum Allowed: ${maximum.toFixed(2)} USDT (${maximumPct.toFixed(2)}% equity)` : null,
        maximum > 0 ? `Remaining Capacity: ${remaining.toFixed(2)} USDT` : null,
        `Execution ID: ${request.executionId}`, 'No Binance order was created.',
        'Verification and persistence were not started.', 'This is an expected risk protection.']
        .filter(Boolean).join('\n');
      const response = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.config.telegramChatId, text: message }), signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`Telegram rejection notification HTTP ${response.status}`);
      return true;
    }
    const verificationFailure = !exchangeWasVerified
      && (error?.verificationResult || /verif|read-back|visible on Binance/i.test(String(error?.message || '')));
    const title = exchangeWasVerified ? '🚨 PERSISTENCIA PENDIENTE'
      : verificationFailure ? '⚠ VERIFICACIÓN FALLIDA' : '🚨 EJECUCIÓN FALLIDA';
    const bar = (filled, total = 10) => '█'.repeat(filled) + '░'.repeat(total - filled);
    const state = exchangeWasVerified
      ? 'Binance confirmó la operación; el estado local requiere atención.'
      : verificationFailure ? 'Binance no confirmó la operación mediante read-back.'
        : 'Binance rechazó o no confirmó la solicitud.';
    const nextAction = exchangeWasVerified
      ? 'Revisar Monitor SL y Dashboard; no modificar la posición hasta confirmar ambos.'
      : 'No se avanzó el estado local. Revisar el error antes de reintentar.';
    const message = [
      '━━━━━━━━━━━━━━━━━━━━━━━', title, '━━━━━━━━━━━━━━━━━━━━━━━', '',
      `${request.positionSide === 'SHORT' ? '🔴' : '🟢'} ${request.positionSide}  ·  ${request.symbol}`,
      `Execution ID: ${request.executionId}`, `Correlation ID: ${request.correlationId || request.executionId}`, '',
      '━━━ ESTADO DEL PIPELINE ━━━',
      `Binance       [${bar(exchangeWasVerified ? 10 : verificationFailure ? 5 : 2)}] ${exchangeWasVerified ? '✅ VERIFIED' : verificationFailure ? '⚠ UNCONFIRMED' : '❌ FAILED'}`,
      `Persistencia  [${bar(exchangeWasVerified ? 2 : 0)}] ${exchangeWasVerified ? '❌ FAILED' : '⏸ NOT STARTED'}`,
      '', '━━━ SOLICITUD ━━━',
      `Tipo          ${request.type}`, request.quantity ? `Cantidad      ${request.quantity}` : null,
      request.leverage ? `Leverage      ${request.leverage}x` : null,
      request.stopLoss ? `Stop Loss     ${request.stopLoss}` : null,
      request.takeProfit ? `Take Profit   ${request.takeProfit}` : null,
      '', '━━━ DETALLE ━━━', state,
      `Error: ${String(error?.message || error || 'unknown').slice(0, 700)}`,
      '', `Acción: ${nextAction}`, '━━━━━━━━━━━━━━━━━━━━━━━'
    ].filter(Boolean).join('\n');
    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.config.telegramChatId, text: message }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Telegram failure notification HTTP ${response.status}`);
    return true;
  }
}

module.exports = { ExecutionEngine, EXECUTION_TYPES, retryable, near, safeId, externalCloseExecutionId,
  failureNotificationPolicy };
