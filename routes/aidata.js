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
      symbol VARCHAR(20), direction VARCHAR(10),
      close_type VARCHAR(5), stage VARCHAR(15),
      pnl_usdt DECIMAL(10,4), r_final DECIMAL(6,2),
      duration_minutes INT,
      analysis TEXT,
      created_at DATETIME DEFAULT NOW()
    )`);
    await db.execute(
      `INSERT INTO post_trade_analysis (symbol,direction,close_type,stage,pnl_usdt,r_final,duration_minutes,analysis) VALUES (?,?,?,?,?,?,?,?)`,
      [t.symbol||null, t.direction||null, t.closeType||null, t.stage||null, t.pnl||null, t.rFinal||null, t.durationMinutes||null, t.analysis||null]
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
