'use strict';

const express = require('express');
const knowledge = require('../services/knowledge_graph');
const router = express.Router();

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

module.exports = router;
