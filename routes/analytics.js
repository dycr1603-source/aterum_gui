'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { db, query } = shared;

router.post('/db/trade/open', async (req, res) => {
  const t = req.body;
  try {
    try{
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_trend VARCHAR(10) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_status VARCHAR(15) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_rsi DECIMAL(6,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_bias VARCHAR(10) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_fear_greed INT NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_btc_change DECIMAL(6,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_size_mult DECIMAL(4,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS score_multiplier DECIMAL(4,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS effective_risk_pct DECIMAL(5,2) NULL`);
    }catch(e){ /* columns may already exist */ }

    const sql = `INSERT INTO trades
      (symbol, direction, status, entry_price, sl_price, tp_price, qty, leverage,
       margin, risk_pct, max_loss, max_gain, rr_ratio, final_score, scan_score,
       ai_regime, ai_bias, ai_reasoning, ai_key_risk, recommended_leverage,
       vision_state, vision_approved, vision_reason, used_fallback, original_symbol,
       market_order_id, tp_order_id, sl_monitor,
       tf4h_trend, tf4h_status, tf4h_rsi,
       macro_bias, macro_fear_greed, macro_btc_change, macro_size_mult,
       score_multiplier, effective_risk_pct,
       opened_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`;
    const params = [
      t.symbol || null,
      t.direction || null,
      'OPEN',
      t.entryPrice || null,
      t.sl || null,
      t.tp || null,
      t.qty || null,
      t.leverage || null,
      t.marginRequired || null,
      t.riskPct || null,
      t.maxLoss || null,
      t.maxGain || null,
      t.rrRatio || null,
      t.finalScore || null,
      t.scanScore || null,
      t.aiResult?.regime || null,
      t.aiResult?.direction_bias || null,
      t.aiResult?.reasoning || null,
      t.aiResult?.key_risk || null,
      t.aiResult?.recommended_leverage || null,
      t.aiVision?.market_state || null,
      t.aiVision?.approve_trade ? 1 : 0,
      t.aiVision?.reason || null,
      t.usedFallback ? 1 : 0,
      t.originalSymbol || null,
      t.marketOrderId || null,
      t.tpOrderId || null,
      t.slMonitorRequired ? 1 : 0,
      t.tf4h?.trend || null,
      t.tf4h?.status || null,
      t.tf4h?.rsi || null,
      t.marketContext?.market_bias || null,
      t.marketContext?.fearGreed?.value || null,
      t.marketContext?.btcChange || null,
      t.marketContext?.size_multiplier || null,
      t.sizingInfo?.scoreMultiplier || null,
      t.riskPct || null
    ];
    const result = await db.execute(sql, params);
    const id = result[0]?.insertId;
    console.log(`DB: Trade abierto ${t.symbol} id=${id}`);
    res.json({ ok: true, id });
  } catch(e) {
    console.error('DB trade/open error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/trade/close', async (req, res) => {
  const t = req.body;
  try {
    const [rows] = await db.execute(
      `SELECT id FROM trades WHERE symbol=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`,
      [t.symbol]
    );
    if (!rows?.length) return res.status(404).json({ error: 'No open trade for ' + t.symbol });
    const tradeId = rows[0].id;
    await db.execute(`UPDATE trades SET status='CLOSED' WHERE id=?`, [tradeId]);

    const closeReason  = t.closeReason?.toUpperCase() || 'MANUAL';
    const trailingStage = t.trailingStage || 'INITIAL';
    const isWinStage   = ['BREAKEVEN','TIME_LOCK','LOCK','TRAILING'].includes(trailingStage);

    let pnlUsdt = t.pnlUsdt != null ? +t.pnlUsdt : null;
    let pnlPct  = t.pnlPct  != null ? +t.pnlPct  : null;
    let rFinal  = t.rFinal  != null ? +t.rFinal   : null;

    if(pnlUsdt !== null){
      // SL en INITIAL con PnL positivo → forzar negativo (pérdida real mal calculada)
      if(closeReason === 'SL' && pnlUsdt > 0 && !isWinStage){
        pnlUsdt = -pnlUsdt;
        pnlPct  = pnlPct  ? -Math.abs(pnlPct)  : pnlPct;
        rFinal  = rFinal  ? -Math.abs(rFinal)   : rFinal;
      }
      // SL en win stage con PnL negativo → forzar positivo (SL movido con ganancia)
      if(closeReason === 'SL' && pnlUsdt < 0 && isWinStage){
        pnlUsdt = Math.abs(pnlUsdt);
        pnlPct  = pnlPct  ? Math.abs(pnlPct)   : pnlPct;
        rFinal  = rFinal  ? Math.abs(rFinal)    : rFinal;
      }
      // TP con PnL negativo → siempre forzar positivo
      if(closeReason === 'TP' && pnlUsdt < 0){
        pnlUsdt = -pnlUsdt;
        pnlPct  = pnlPct  ? Math.abs(pnlPct)   : pnlPct;
        rFinal  = rFinal  ? Math.abs(rFinal)    : rFinal;
      }
    }

    await db.execute(
      `INSERT INTO trade_closes (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [tradeId, t.symbol, t.exitPrice||null, pnlUsdt, pnlPct, rFinal, closeReason, trailingStage, t.durationMinutes||null]
    );
    console.log(`DB: Trade cerrado ${t.symbol} id=${tradeId} pnl=${pnlUsdt} reason=${closeReason} stage=${trailingStage}`);
    res.json({ ok: true, tradeId });
  } catch(e) {
    console.error('DB trade/close error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/rejection', async (req, res) => {
  const t = req.body;
  try{
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS tf4h_status VARCHAR(15) NULL`).catch(()=>{});
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS macro_bias VARCHAR(10) NULL`).catch(()=>{});
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS macro_fear_greed INT NULL`).catch(()=>{});
    await query(
      `INSERT INTO trade_rejections (symbol,direction,skip_reason,final_score,scan_score,ai_regime,ai_bias,vision_state,vision_approved,rsi14,atr_pct,vol_ratio,funding_rate,tf4h_status,macro_bias,macro_fear_greed,rejected_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [t.symbol,t.direction,t.skipReason,t.finalScore,t.scanScore,
       t.aiResult?.regime,t.aiResult?.direction_bias,
       t.aiVision?.market_state,t.aiVision?.approve_trade?1:0,
       t.indicators?.rsi14,t.indicators?.atrPct,t.indicators?.volRatio,t.indicators?.fundingRate,
       t.tf4hStatus||null, t.macroBias||null, t.fearGreed||null]
    );
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/db/scan', async (req, res) => {
  const t = req.body;
  try {
    await query(
      `INSERT INTO scan_events (symbol,scan_score,direction,final_score,long_score,short_score,pass_ai,skip_reason,rsi14,ema8,ema21,ema50,atr_pct,vol_ratio,funding_rate,vwap,current_price,volume24h,price_change_pct,open_interest,scanned_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [t.symbol,t.scanScore,t.direction,t.finalScore,t.longScore,t.shortScore,t.passAI?1:0,t.skipReason||null,
       t.indicators?.rsi14,t.indicators?.ema8,t.indicators?.ema21,t.indicators?.ema50,
       t.indicators?.atrPct,t.indicators?.volRatio,t.indicators?.fundingRate,t.indicators?.vwap,
       t.indicators?.currentPrice,t.volume24h,t.priceChangePct,t.openInterest]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/db/stats', async (req, res) => {
  try {
    const [daily,symbols,recent,topRejections,weeklyPnl,winLoss] = await Promise.all([
      query(`SELECT * FROM daily_pnl LIMIT 30`),
      query(`SELECT symbol, ROUND(CAST(total_pnl AS DECIMAL(10,2)),2) as total_pnl, win_rate FROM symbol_performance LIMIT 20`),
      query(`SELECT t.*,tc.pnl_usdt,tc.r_final,tc.close_reason,tc.trailing_stage,tc.duration_minutes,tc.closed_at FROM trades t LEFT JOIN trade_closes tc ON t.id=tc.trade_id ORDER BY t.opened_at DESC LIMIT 50`),
      query(`SELECT skip_reason,COUNT(*) as count FROM trade_rejections GROUP BY skip_reason ORDER BY count DESC LIMIT 10`),
      query(`SELECT DATE_FORMAT(closed_at,'%Y-%u') as week, ROUND(CAST(SUM(pnl_usdt) AS DECIMAL(10,2)),2) as pnl, COUNT(*) as trades FROM trade_closes GROUP BY DATE_FORMAT(closed_at,'%Y-%u') ORDER BY week DESC LIMIT 12`),
      query(`SELECT SUM(pnl_usdt>0) as wins,SUM(pnl_usdt<=0) as losses,ROUND(AVG(r_final),2) as avg_r,ROUND(SUM(pnl_usdt),2) as total_pnl FROM trade_closes`)
    ]);
    res.json({ daily, symbols, recent, topRejections, weeklyPnl, winLoss: winLoss?.[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/db/trade/update-sl', async (req, res) => {
  const t = req.body;
  try {
    const [rows] = await db.execute(
      `SELECT id FROM trades WHERE symbol=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`,
      [t.symbol]
    );
    if (!rows?.length) return res.status(404).json({ error: 'No open trade for ' + t.symbol });
    const tradeId = rows[0].id;
    await db.execute(`UPDATE trades SET sl_price=? WHERE id=?`, [t.newSL || null, tradeId]);
    console.log(`DB: SL actualizado ${t.symbol} → ${t.newSL}`);
    res.json({ ok: true, tradeId });
  } catch(e) {
    console.error('DB update-sl error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;