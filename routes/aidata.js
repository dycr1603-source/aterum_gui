'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');

const { db, query } = shared;

router.post('/db/post-trade', async (req, res) => {
  const t = req.body;
  try{
    await db.execute(`CREATE TABLE IF NOT EXISTS post_trade_analysis (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trade_id INT NULL,
      symbol VARCHAR(20), direction VARCHAR(10),
      close_type VARCHAR(5), stage VARCHAR(15),
      pnl_usdt DECIMAL(10,4), r_final DECIMAL(6,2),
      duration_minutes INT,
      entry_reason TEXT NULL,
      exit_reason TEXT NULL,
      setup_label VARCHAR(120) NULL,
      ai_regime VARCHAR(32) NULL,
      ai_bias VARCHAR(16) NULL,
      tf4h_status VARCHAR(15) NULL,
      macro_bias VARCHAR(10) NULL,
      atr_pct DECIMAL(10,4) NULL,
      rsi14 DECIMAL(8,3) NULL,
      vol_ratio DECIMAL(10,4) NULL,
      funding_rate DECIMAL(12,8) NULL,
      final_score DECIMAL(8,3) NULL,
      scan_score DECIMAL(8,3) NULL,
      dynamic_threshold DECIMAL(8,3) NULL,
      entry_hour_utc INT NULL,
      analysis TEXT,
      created_at DATETIME DEFAULT NOW()
    )`);
    const alters = [
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS trade_id INT NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS entry_reason TEXT NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS exit_reason TEXT NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS setup_label VARCHAR(120) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS ai_regime VARCHAR(32) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS ai_bias VARCHAR(16) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS tf4h_status VARCHAR(15) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS macro_bias VARCHAR(10) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS atr_pct DECIMAL(10,4) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS rsi14 DECIMAL(8,3) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS vol_ratio DECIMAL(10,4) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS funding_rate DECIMAL(12,8) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS final_score DECIMAL(8,3) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS scan_score DECIMAL(8,3) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS dynamic_threshold DECIMAL(8,3) NULL`,
      `ALTER TABLE post_trade_analysis ADD COLUMN IF NOT EXISTS entry_hour_utc INT NULL`
    ];
    for (const sql of alters) await db.execute(sql).catch(() => {});
    await db.execute(
      `INSERT INTO post_trade_analysis
        (trade_id,symbol,direction,close_type,stage,pnl_usdt,r_final,duration_minutes,
         entry_reason,exit_reason,setup_label,ai_regime,ai_bias,tf4h_status,macro_bias,
         atr_pct,rsi14,vol_ratio,funding_rate,final_score,scan_score,dynamic_threshold,entry_hour_utc,analysis)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        t.tradeId || t.trade_id || null,
        t.symbol || null,
        t.direction || null,
        t.closeType || null,
        t.stage || null,
        t.pnl || t.pnlUsdt || null,
        t.rFinal || null,
        t.durationMinutes || null,
        t.entryReason || null,
        t.exitReason || null,
        t.setupLabel || null,
        t.aiRegime || null,
        t.aiBias || null,
        t.tf4hStatus || null,
        t.macroBias || null,
        t.atrPct || null,
        t.rsi14 || null,
        t.volRatio || null,
        t.fundingRate || null,
        t.finalScore || null,
        t.scanScore || null,
        t.dynamicThreshold || null,
        t.entryHourUtc || null,
        t.analysis || null
      ]
    );
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/db/ai-data', async (req, res) => {
  try{
    const limit  = parseInt(req.query.limit  || 100);
    const period = parseInt(req.query.period || 30);
    const cutoff = new Date(Date.now() - period * 86400000).toISOString().slice(0,10);

    const [trades, rejections, postTrades, tf4hStats, macroStats, visionStats, regimeStats] = await Promise.all([
      // Full AI context per trade
      query(`SELECT t.id, t.symbol, t.direction, t.final_score, t.scan_score,
               t.ai_regime, t.ai_bias, t.ai_reasoning, t.ai_key_risk, t.recommended_leverage,
               t.vision_state, t.vision_approved, t.vision_reason,
               t.tf4h_trend, t.tf4h_status, t.tf4h_rsi,
               t.macro_bias, t.macro_fear_greed, t.macro_btc_change, t.macro_size_mult,
               t.score_multiplier, t.effective_risk_pct,
               t.used_fallback, t.original_symbol, t.status, t.opened_at,
               tc.pnl_usdt, tc.r_final, tc.close_reason, tc.trailing_stage, tc.duration_minutes, tc.closed_at
             FROM trades t LEFT JOIN trade_closes tc ON t.id=tc.trade_id
             WHERE t.opened_at >= ? ORDER BY t.opened_at DESC LIMIT ?`, [cutoff, limit]),

      // Rejection reasons with AI context
      query(`SELECT skip_reason, ai_regime, ai_bias, vision_state,
               COUNT(*) as count, AVG(final_score) as avg_score
             FROM trade_rejections WHERE rejected_at >= ?
             GROUP BY skip_reason, ai_regime, ai_bias, vision_state
             ORDER BY count DESC LIMIT 30`, [cutoff]),

      // Post-trade analyses
      query(`SELECT * FROM post_trade_analysis WHERE created_at >= ? ORDER BY created_at DESC LIMIT 50`, [cutoff])
        .catch(() => []),

      // 4H performance stats
      query(`SELECT t.tf4h_status,
               COUNT(*) as total,
               SUM(tc.pnl_usdt > 0) as wins,
               ROUND(AVG(tc.pnl_usdt),2) as avg_pnl,
               ROUND(AVG(tc.r_final),2) as avg_r
             FROM trades t JOIN trade_closes tc ON t.id=tc.trade_id
             WHERE t.opened_at >= ? AND t.tf4h_status IS NOT NULL
             GROUP BY t.tf4h_status`, [cutoff]),

      // Macro bias performance
      query(`SELECT t.macro_bias,
               COUNT(*) as total,
               SUM(tc.pnl_usdt > 0) as wins,
               ROUND(AVG(tc.pnl_usdt),2) as avg_pnl,
               ROUND(SUM(tc.pnl_usdt),2) as total_pnl
             FROM trades t JOIN trade_closes tc ON t.id=tc.trade_id
             WHERE t.opened_at >= ? AND t.macro_bias IS NOT NULL
             GROUP BY t.macro_bias`, [cutoff]),

      // Vision state performance
      query(`SELECT t.vision_state,
               COUNT(*) as total,
               SUM(tc.pnl_usdt > 0) as wins,
               ROUND(AVG(tc.pnl_usdt),2) as avg_pnl,
               ROUND(AVG(tc.r_final),2) as avg_r
             FROM trades t JOIN trade_closes tc ON t.id=tc.trade_id
             WHERE t.opened_at >= ? AND t.vision_state IS NOT NULL
             GROUP BY t.vision_state`, [cutoff]),

      // Regime performance
      query(`SELECT t.ai_regime,
               COUNT(*) as total,
               SUM(tc.pnl_usdt > 0) as wins,
               ROUND(AVG(tc.pnl_usdt),2) as avg_pnl,
               ROUND(AVG(tc.r_final),2) as avg_r
             FROM trades t JOIN trade_closes tc ON t.id=tc.trade_id
             WHERE t.opened_at >= ? AND t.ai_regime IS NOT NULL
             GROUP BY t.ai_regime`, [cutoff])
    ]);

    res.json({ trades, rejections, postTrades, tf4hStats, macroStats, visionStats, regimeStats });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

module.exports = router;
