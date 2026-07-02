'use strict';

const express = require('express');
const shared = require('../shared');
const engine = require('../services/opportunity_engine');

const router = express.Router();

engine.ensureTables().catch(error => console.error('[Opportunity] schema:', error.message));

router.post('/api/opportunities/scan', async (req, res) => {
  try {
    const result = await engine.scanAndSelect(req.body || {});
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) {
    console.error('[Opportunity] scan:', error.message);
    res.status(502).json({
      error: 'OPPORTUNITY_SCAN_FAILED',
      reason: error.message,
      hardBlocker: true
    });
  }
});

router.get('/api/opportunities/latest', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const [cycles] = await shared.db.query(`SELECT * FROM market_scan_cycles ORDER BY started_at DESC LIMIT ?`, [limit]);
    const cycleId = req.query.cycle || cycles?.[0]?.id;
    const [opportunities] = cycleId
      ? await shared.db.execute(`SELECT * FROM market_opportunities WHERE cycle_id=? ORDER BY rank_position`, [cycleId])
      : [[]];
    res.json({ cycles: cycles || [], opportunities: opportunities || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/opportunities/coverage', async (_req, res) => {
  try {
    const [[summary]] = await shared.db.query(`SELECT
      COUNT(*) universe_seen,
      SUM(last_deep_scan_at IS NOT NULL) analyzed,
      SUM(last_deep_scan_at>=NOW()-INTERVAL 3 HOUR) fresh,
      MIN(last_deep_scan_at) oldest_scan,
      MAX(last_deep_scan_at) newest_scan
      FROM market_symbol_state`);
    const [stale] = await shared.db.query(`SELECT symbol,last_deep_scan_at,next_scan_at,consecutive_skips
      FROM market_symbol_state ORDER BY last_deep_scan_at IS NULL DESC,last_deep_scan_at ASC LIMIT 30`);
    res.json({ summary, stale });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
