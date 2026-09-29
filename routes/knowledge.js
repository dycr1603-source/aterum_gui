'use strict';

const express = require('express');
const knowledge = require('../services/knowledge_graph');
const aiAudit = require('../services/research_ai_audit');
const crypto = require('crypto');
const router = express.Router();

function requireUserSession(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'No autorizado' });
}

function endpoint(handler) {
  return async (req, res) => {
    const started = Date.now();
    try {
      const body = await handler(req);
      res.setHeader('Cache-Control', `private, max-age=${Math.floor(knowledge.CACHE_TTL_MS / 1000)}`);
      res.setHeader('X-Knowledge-Duration-Ms', String(Date.now() - started));
      res.json(body);
    } catch (error) {
      const status = /no existe|invalido/i.test(error.message) ? 404 : 500;
      console.error('[Knowledge]', error.message);
      res.status(status).json({ error: error.message });
    }
  };
}

router.get('/api/knowledge/trades', endpoint(req => knowledge.listTrades(req.query)));
router.get('/api/knowledge/trade/:id', endpoint(req => knowledge.getTrade(req.params.id)));
router.get('/api/knowledge/timeline/:id', endpoint(req => knowledge.getTimeline(req.params.id)));
router.get('/api/knowledge/graph/:id', endpoint(req => knowledge.getGraph(req.params.id)));
router.get('/api/knowledge/diff', endpoint(req => {
  if (!req.query.id1 || !req.query.id2) throw new Error('id1 e id2 son obligatorios');
  return knowledge.getDiff(req.query.id1, req.query.id2);
}));
router.get('/api/knowledge/rules', endpoint(() => knowledge.getRules()));
router.get('/api/knowledge/evidence/:id', endpoint(req => knowledge.getEvidence(req.params.id)));

function internalWorkflowAuth(req, res, next) {
  const expected = String(process.env.RESEARCH_AI_AUDIT_TOKEN || '');
  const supplied = String(req.headers['x-aterum-workflow-token'] || '');
  if (!expected || expected.length !== supplied.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.get('/api/knowledge/ai-usage', requireUserSession, endpoint(() => aiAudit.getSummary()));
router.get('/api/knowledge/ai-usage/estimate', internalWorkflowAuth, async (req, res) => {
  const analysisType = String(req.query.analysisType || '').toLowerCase();
  if (!['daily', 'weekly'].includes(analysisType)) return res.status(400).json({ error: 'invalid analysis type' });
  try { res.json(await aiAudit.getInputEstimate(analysisType)); }
  catch (error) { console.error('[Knowledge AI audit] estimate unavailable:', error.message); res.status(500).json({ error: 'estimate unavailable' }); }
});
router.post('/api/knowledge/ai-usage', internalWorkflowAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const analysisType = String(body.analysisType || '').toLowerCase();
    const status = String(body.status || '').toUpperCase();
    if (!['daily', 'weekly'].includes(analysisType) ||
        !['COMPLETED', 'SKIPPED_CAPACITY', 'SKIPPED_UNAVAILABLE', 'FAILED'].includes(status) ||
        !body.executionId || !body.model) {
      return res.status(400).json({ error: 'invalid research AI audit payload' });
    }
    const numericFields = ['maxOutputTokens','inputTokens','outputTokens','estimatedInputTokensSaved',
      'estimatedOutputTokensSaved','accountEquity','availableMargin','remainingMargin','marginUsagePct',
      'openRiskPct','remainingRiskPct','maxRiskPct','maxMarginUsagePct','openPositions'];
    const record = { ...body, analysisType, status };
    for (const field of numericFields) {
      if (record[field] == null || record[field] === '') { record[field] = null; continue; }
      const value = Number(record[field]);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'invalid numeric audit field' });
      record[field] = value;
    }
    record.execution_id = String(record.executionId).slice(0, 80);
    record.analysis_type = analysisType;
    record.reason_code = record.reasonCode ? String(record.reasonCode).slice(0, 64) : null;
    record.max_output_tokens = record.maxOutputTokens;
    record.input_tokens = record.inputTokens;
    record.output_tokens = record.outputTokens;
    record.estimated_input_tokens_saved = record.estimatedInputTokensSaved;
    record.estimated_output_tokens_saved = record.estimatedOutputTokensSaved;
    record.account_equity = record.accountEquity;
    record.available_margin = record.availableMargin;
    record.remaining_margin = record.remainingMargin;
    record.margin_usage_pct = record.marginUsagePct;
    record.open_risk_pct = record.openRiskPct;
    record.remaining_risk_pct = record.remainingRiskPct;
    record.max_risk_pct = record.maxRiskPct;
    record.max_margin_usage_pct = record.maxMarginUsagePct;
    record.open_positions = record.openPositions;
    record.max_output_tokens = record.max_output_tokens == null ? 0 : record.max_output_tokens;
    record.model = String(record.model).slice(0, 100);
    await aiAudit.recordRun(record);
    res.status(201).json({ saved: true });
  } catch (error) {
    console.error('[Knowledge AI audit] persistence failed:', error.message);
    res.status(500).json({ error: 'could not persist research AI audit' });
  }
});

module.exports = router;
