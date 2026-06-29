'use strict';

const { normalizePosition, isStop } = require('./binance');

function json(value) { return JSON.stringify(value ?? null); }

class PositionGuard {
  constructor(deps) {
    Object.assign(this, deps);
    this.running = false;
    this.alerted = new Map();
    this.unprotectedSince = new Map();
    this.emergencyClosing = new Map();
    this.lastScan = null;
  }

  async initialize() {
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
    const [rows] = await this.db.query(`SELECT id,symbol,direction,status,entry_price,sl_price,tp_price,qty,leverage,
      opened_at,updated_at FROM trades WHERE status='OPEN' ORDER BY opened_at`);
    return rows || [];
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
      const closed = await this.binance.closeMarket(position);
      await this.event({ eventType: 'EMERGENCY_CLOSE', severity: 'CRITICAL', symbol: position.symbol,
        positionSide: position.side, expected: { nativeStop: true, graceMs: this.config.unprotectedGraceMs },
        actual: { nativeStop: false, unprotectedMs: elapsedMs }, action: 'MARKET_CLOSE', actionStatus: 'SUCCESS' });
      await this.alert(`emergency:${key}`,
        `🚨 ATERUM EMERGENCY\n${position.symbol} ${position.side} remained without native STOP for ${Math.round(elapsedMs / 1000)}s. Emergency market close sent.`, true);
      return { status: 'emergency_closed', order: closed };
    } catch (error) {
      this.emergencyClosing.delete(key);
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
    const fills = trades.filter(trade => trade.side === closeSide && Number(trade.realizedPnl || 0) !== 0);
    if (!fills.length) return { status: 'no_exit_evidence' };
    const latestTime = Math.max(...fills.map(row => Number(row.time || 0)));
    const latest = fills.filter(row => Number(row.time) === latestTime || Math.abs(Number(row.time) - latestTime) < 2000);
    const qty = latest.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const exitPrice = qty > 0 ? latest.reduce((sum, row) => sum + Number(row.price || 0) * Number(row.qty || 0), 0) / qty : Number(expected.entry_price);
    const pnl = latest.reduce((sum, row) => sum + Number(row.realizedPnl || 0), 0);
    const filledOrder = [...orders, ...algos].find(order => String(order.orderId || order.algoId) === String(latest[0].orderId));
    const type = String(filledOrder?.orderType || filledOrder?.origType || filledOrder?.type || '').toUpperCase();
    const clientId = String(filledOrder?.clientOrderId || filledOrder?.clientAlgoId || '');
    const closeReason = type.includes('STOP') ? 'SL' : type.includes('TAKE_PROFIT') || type === 'LIMIT' ? 'TP' : 'MANUAL';
    const initialRisk = Math.abs(Number(expected.entry_price) - Number(expected.sl_price));
    const rFinal = initialRisk > 0 ? (Math.abs(exitPrice - Number(expected.entry_price)) / initialRisk) * (pnl >= 0 ? 1 : -1) : 0;
    const duration = Math.max(0, Math.round((latestTime - new Date(expected.opened_at).getTime()) / 60000));
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [exists] = await connection.execute('SELECT id FROM trade_closes WHERE trade_id=? LIMIT 1 FOR UPDATE', [expected.id]);
      if (!exists.length) {
        await connection.execute(`INSERT INTO trade_closes
          (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at)
          VALUES (?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?/1000))`, [expected.id, expected.symbol, exitPrice, pnl,
          Number(expected.entry_price) * Number(expected.qty) > 0 ? pnl / (Number(expected.entry_price) * Number(expected.qty)) * 100 : 0,
          rFinal, closeReason, 'INITIAL', duration, latestTime]);
      }
      await connection.execute("UPDATE trades SET status='CLOSED',updated_at=FROM_UNIXTIME(?/1000) WHERE id=?", [latestTime, expected.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }

    await fetch(`${this.config.dashboardBase}/trade/${expected.symbol}?reason=${closeReason.toLowerCase()}&exitPrice=${exitPrice}`, {
      method: 'DELETE', signal: AbortSignal.timeout(5000)
    }).catch(() => null);
    await this.event({ eventType: 'DB_RECONCILED_CLOSED', severity: 'CRITICAL', symbol: expected.symbol,
      positionSide: expected.direction, expected: { dbStatus: 'OPEN' },
      actual: { binanceStatus: 'CLOSED', exitPrice, pnl, closeReason, clientId: clientId ? `${clientId.slice(0, 4)}…` : null },
      action: 'CLOSE_DB_TRADE', actionStatus: 'SUCCESS' });
    await this.alert(`db-close:${expected.id}`,
      `🚨 ATERUM RECONCILIATION\n${expected.symbol} was OPEN in MySQL but CLOSED on Binance. DB reconciled as ${closeReason} at ${exitPrice}, PnL ${pnl.toFixed(2)} USDT.`, true);
    return { status: 'reconciled', closeReason, exitPrice, pnl };
  }

  async scan() {
    if (this.running) return this.lastScan;
    this.running = true;
    const started = Date.now();
    const summary = { positions: 0, protected: 0, unprotected: 0, emergencyClosed: 0, reconciled: 0, errors: [] };
    try {
      const [positionRows, algoOrders, expectedRows] = await Promise.all([
        this.binance.positions(), this.binance.openAlgoOrders(), this.expectedTrades()
      ]);
      const positions = positionRows.map(normalizePosition).filter(Boolean);
      summary.positions = positions.length;
      for (const position of positions) {
        const expected = expectedRows.find(row => row.symbol === position.symbol && row.direction === position.side);
        if (!expected) {
          const message = `${position.symbol} ${position.side} is open on Binance without an OPEN MySQL trade; desired SL is unknown.`;
          await this.event({ eventType: 'POSITION_WITHOUT_DB', severity: 'CRITICAL', symbol: position.symbol,
            positionSide: position.side, actual: position, actionStatus: 'BLOCKED', error: message });
          await this.alert(`no-db:${position.symbol}:${position.side}`, `🚨 ATERUM CRITICAL\n${message}`, true);
          summary.errors.push(message); continue;
        }
        const stops = algoOrders.filter(order => isStop(order, position));
        try {
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

module.exports = { PositionGuard };
