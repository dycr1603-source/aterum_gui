'use strict';
const express = require('express');
const { timingSafeEqual } = require('crypto');
const shared = require('../shared');
const jev = require('../services/jev');
const { deliver } = require('../services/telegram_delivery');
const { describeReason } = require('../services/telegram_reasons');
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
    const trend = Number(indicators.ema8) > Number(indicators.ema21) ? 'alcista (EMA8 > EMA21)'
      : Number(indicators.ema8) < Number(indicators.ema21) ? 'bajista (EMA8 < EMA21)' : 'neutral';
    const momentum = `RSI ${Number(indicators.rsi14 || 0).toFixed(1)} · volumen ${Number(indicators.volRatio || 0).toFixed(2)}× lo normal`;
    const providerLabel = result.provider === 'typesafe-jev' ? 'Jev real' : 'Haiku adapter';
    const skippedBeforeModel = !result.request;
    const approved = ['LONG', 'SHORT'].includes(result.decision);
    const status = skippedBeforeModel ? '⏸ ANÁLISIS JEV OMITIDO'
      : approved ? '🧠 PROPUESTA DE OPERACIÓN' : '⛔ OPERACIÓN RECHAZADA';
    const sideIcon = side => side === 'LONG' ? '🟢 LONG (busca una subida)' : side === 'SHORT' ? '🔴 SHORT (busca una bajada)' : '⚪ NO OPERAR';
    const pct = value => `${(Number(value || 0) * 100).toFixed(0)}%`;
    const reason = describeReason(result.reason);
    const quality = result.entryQuality || {};
    const metrics = quality.metrics || {};
    const selection = quality.selection;
    const qualityFacts = [
      metrics.openPositions != null ? `posiciones abiertas ${metrics.openPositions}/${quality.policy?.maxOpenPositions ?? 2}` : '',
      Number.isFinite(metrics.volumeRatio) ? `volumen ${metrics.volumeRatio.toFixed(2)}× (mín. ${quality.policy?.minVolumeRatio ?? 0.8}×)` : '',
      Number.isFinite(metrics.extensionAtr) ? `distancia a EMA21 ${metrics.extensionAtr >= 0 ? '+' : ''}${metrics.extensionAtr.toFixed(2)} ATR (máx. ±${quality.policy?.maxTrendExtensionAtr ?? 2})` : ''
    ].filter(Boolean).join(' · ');
    const eventKey = skippedBeforeModel ? `jev-preflight:${cfg.provider}:${result.reason}:${Math.floor(Date.now() / 3600000)}`
      : `jev:${id}`;
    let levels = [];
    if (p) {
      const entry = Number(p.entry), sl = Number(p.sl), tp = Number(p.tp);
      const slPct = Math.abs(entry - sl) / entry * 100, tpPct = Math.abs(tp - entry) / entry * 100;
      levels = ['', '━━━ 📋 PROPUESTA ━━━',
        `🎯 Entrada  ${p.entry} · ⚡ ${p.leverage}×`,
        `🏁 Objetivo de ganancia (TP): ${p.tp} (${tpPct.toFixed(2)}% de recorrido)`,
        `🛑 Salida para limitar pérdidas (SL): ${p.sl} (${slPct.toFixed(2)}% en contra desde la entrada)`,
        `⚖ R:R      1:${(tpPct / slPct).toFixed(2)} bruto${selection ? ` · ${selection.netRewardRisk.toFixed(2)} neto de comisiones` : ''}`,
        result.leveragePolicy?.allowedChoices?.length
          ? `⚡ Apalancamiento permitido: ${result.leveragePolicy.allowedChoices.map(n => `${n}×`).join(', ')} · Jev eligió ${p.leverage}×` : null,
        result.leveragePolicy?.caps?.length
          ? `🧱 Topes: ${result.leveragePolicy.caps.map(cap => `${cap.source} ${cap.max}×`).join(' · ')}` : null,
        'ℹ El tamaño y el riesgo en USDT se calculan después; llegan en el aviso de orden confirmada.'];
    }
    const message = skippedBeforeModel
      ? [`${status} · ${providerLabel}`, `💎 ${d.symbol}`, '',
        `❓ Qué pasó: ${reason.label}.`,
        reason.why ? `💡 Por qué: ${reason.why}` : null,
        qualityFacts ? `📊 Datos: ${qualityFacts}` : null,
        result.preflight?.metrics?.remainingMargin != null
          ? `💰 Margen restante: ${Number(result.preflight.metrics.remainingMargin).toFixed(2)} USDT` : null,
        result.preflight?.blockedSides?.length
          ? `🚫 Direcciones sin capacidad: ${result.preflight.blockedSides.join(', ')}` : null,
        quality.blockedSides?.length && result.reason !== 'JEV_EXTENDED_ENTRY'
          ? `🚫 Direcciones descartadas por precio extendido: ${quality.blockedSides.join(', ')}` : null,
        '',
        '🪙 No se consultó al modelo; tokens de Jev: 0.',
        '🛡 No se envió ninguna orden a Binance.']
      : [`${status} · ${providerLabel}${result.mode === 'observe' ? ' (modo observación: no decide operaciones)' : ''}`,
        `💎 ${d.symbol} · el modelo propuso ${sideIcon(result.proposedDecision)}`,
        `🤖 Modelo: ${result.model || 'sin respuesta válida'}`,
        ...levels,
        '', '━━━ 🎲 OPINIÓN DEL MODELO ━━━',
        `NO OPERAR ${pct(probabilities.NO_TRADE)} · LONG ${pct(probabilities.LONG)} · SHORT ${pct(probabilities.SHORT)}`,
        selection ? `Confianza ${pct(selection.confidence)} (mín. 60%) · ventaja sobre la 2.ª opción ${pct(selection.decisionMargin)} (mín. 20 puntos porcentuales)` : null,
        'ℹ Son preferencias del modelo, no probabilidades de ganar.',
        '', '━━━ 📈 CONTEXTO DE MERCADO ━━━',
        `Tendencia 1H: ${trend}`, `Impulso: ${momentum}`,
        qualityFacts ? `Calidad de entrada: ${qualityFacts}` : null,
        result.intelligenceReference?.receivedConfidence
          ? `Intelligence: ${result.intelligenceReference.applied ? 'referencia aplicada' : 'ignorada'} (confianza ${result.intelligenceReference.receivedConfidence})` : null,
        '', `━━━ ${approved ? '✅' : '⛔'} RESULTADO ━━━`,
        `Resultado tras validación: ${approved ? sideIcon(result.decision) : 'NO OPERAR'}`,
        `Motivo: ${reason.label} (${result.reason})`,
        reason.why ? `💡 ${reason.why}` : null,
        result.mode === 'observe' ? '👁 Análisis informativo: el flujo base conserva la decisión de operar.' : approved ? '👉 Ahora se calcula el tamaño y se revisa el riesgo de la cartera.' : '🛡 No se enviará ninguna orden por esta señal.',
        approved ? 'ℹ No confirma una orden en Binance. Si se abre, llegará "✅ ORDEN CONFIRMADA POR BINANCE".'
          : 'ℹ No confirma una orden en Binance.',
        `🆔 Decision ID: ${id}`];
    await deliver({ db: shared.db, eventKey, token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID, text: message.filter(line => line != null).join('\n') });
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
