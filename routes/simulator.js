'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSimulatorReport, getSimulatorPolicy } = require('../services/simulator');

router.use(requireAuth);

router.get('/api/simulator/policy', async (req, res) => {
  try {
    const policy = await getSimulatorPolicy({
      limit: req.query.limit,
      hours: req.query.hours,
      force: req.query.force,
      key: req.query.key
    });
    res.json(policy);
  } catch (error) {
    console.error('[Simulator] policy error:', error.message);
    res.status(500).json({ error: error.message || 'No pude cargar la politica historica' });
  }
});

router.get('/api/simulator/report', async (req, res) => {
  try {
    const report = await getSimulatorReport({
      limit: req.query.limit,
      hours: req.query.hours,
      force: req.query.force
    });
    res.json(report);
  } catch (error) {
    console.error('[Simulator] report error:', error.message);
    res.status(500).json({ error: error.message || 'No pude cargar el simulador' });
  }
});

module.exports = router;
