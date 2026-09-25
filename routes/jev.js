'use strict';
const express = require('express');
const { timingSafeEqual } = require('crypto');
const shared = require('../shared');
const jev = require('../services/jev');
const { deliver } = require('../services/telegram_delivery');
const router = express.Router();
function internal(req, res, next) {
  const token = process.env.EXECUTION_ENGINE_TOKEN;
  const supplied = Buffer.from(req.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token || ''}`);
  if (!token || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.sendStatus(401);
  next();
}
async function ensureTable() {
  await shared.db.execute(`CREATE TABLE IF NOT EXISTS jev_decisions (
    id VARCHAR(64) PRIMARY KEY, symbol VARCHAR(24) NOT NULL,
    result LONGTEXT NULL, created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
}
router.post('/internal/jev/evaluate', internal, async (req, res) => {
  try {
    const cfg = jev.config();
    if (!cfg.enabled) return res.json({ enabled: false });
    const d = req.body;
    const id = jev.requestId(d);
    await ensureTable();
    try { await shared.db.execute('INSERT INTO jev_decisions (id,symbol) VALUES (?,?)', [id, d.symbol]); }
    catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      // Claim survives crashes. Never evaluate a cycle twice or change its proposal.
      const [rows] = await shared.db.execute('SELECT result FROM jev_decisions WHERE id=?', [id]);
      const old = rows[0]?.result ? JSON.parse(rows[0].result) : null;
      if (!old || Date.now() > old.expiresAt || old.mode !== (cfg.observe ? 'observe' : 'enforce'))
        return res.json({ enabled: true, mode: cfg.observe ? 'observe' : 'enforce', decision: 'NO_TRADE', reason: 'JEV_DUPLICATE_OR_EXPIRED', id });
      return res.json({ enabled: true, ...old });
    }
    const result = await jev.evaluate(d, { cfg });
    await shared.db.execute('UPDATE jev_decisions SET result=? WHERE id=?', [JSON.stringify(result), id]);
    const p = result.proposal;
    const a = result.answer || {};
    const probabilities = a.probabilities || {};
    const indicators = d.indicators || {};
    const trend = Number(indicators.ema8) > Number(indicators.ema21) ? 'LONG' : Number(indicators.ema8) < Number(indicators.ema21) ? 'SHORT' : 'NEUTRAL';
    const momentum = `RSI ${Number(indicators.rsi14 || 0).toFixed(1)} · Vol ${Number(indicators.volRatio || 0).toFixed(2)}x`;
    await deliver({ db: shared.db, eventKey: `jev:${id}`, token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      text: [`Jev PROPUESTA (${result.mode})`, `${d.symbol}: ${result.proposedDecision}`,
        p ? `Entrada de referencia ${p.entry} / TP ${p.tp} / SL ${p.sl}` : '',
        `Probabilidades: NO_TRADE ${(Number(probabilities.NO_TRADE || 0) * 100).toFixed(0)}% · LONG ${(Number(probabilities.LONG || 0) * 100).toFixed(0)}% · SHORT ${(Number(probabilities.SHORT || 0) * 100).toFixed(0)}%`,
        `Reglas: EMA ${trend} · ${momentum}`,
        `Resultado tras validación: ${result.decision}`, `Motivo: ${result.reason}`,
        'No confirma una orden en Binance.', `Decision ID: ${id}`].filter(Boolean).join('\n') });
    res.json({ enabled: true, ...result });
  } catch (_) {
    console.error('[Jev] DECISION_SERVICE_FAILED');
    res.status(503).json({ enabled: true, decision: 'NO_TRADE', reason: 'JEV_SERVICE_UNAVAILABLE' });
  }
});
router.post('/internal/notifications/telegram', internal, async (req, res) => {
  try {
    const { eventKey, text, parseMode } = req.body;
    if (typeof eventKey !== 'string' || !eventKey || eventKey.length > 300 || (parseMode && parseMode !== 'HTML')) return res.sendStatus(400);
    const result = await deliver({ db: shared.db, eventKey, text, parseMode,
      token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID });
    res.json(result);
  } catch (_) {
    console.error('[TelegramDelivery] LEDGER_UNAVAILABLE');
    res.status(503).json({ status: 'FAILED', errorCode: 'LEDGER_UNAVAILABLE' });
  }
});
module.exports = router;
