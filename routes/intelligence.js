'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { getSummary, answerQuestion } = require('../services/intelligence');

router.get('/intelligence/signal', async (req, res) => {
  const adjustments = {
    conflict_high:   -12,
    conflict_medium:  -7,
    conflict_low:     -3,
    confirm_high:      6,
    confirm_medium:    3,
    confirm_low:       1,
    neutral:           0,
    no_operar_high:   -10,  // NO OPERAR alta confianza → penalizar ambas
    no_operar_medium:  -6,  // NO OPERAR media confianza
    no_operar_low:     -2   // NO OPERAR baja confianza
  };

  const fallback = {
    signal: 'NEUTRAL',
    confidence: 'baja',
    bias: null,
    postureScore: null,
    scoreAdjustment: { ifLong: 0, ifShort: 0 },
    alerts: [],
    generatedAt: new Date().toISOString()
  };

  const getAdjustment = (action, confidence, wantedSide) => {
    // NO OPERAR — penaliza ambas direcciones
    if(action === 'NO OPERAR'){
      if(confidence === 'alta')   return adjustments.no_operar_high;
      if(confidence === 'media')  return adjustments.no_operar_medium;
      return adjustments.no_operar_low;
    }
    if(action === 'NEUTRAL') return adjustments.neutral;
    if(wantedSide === action){
      if(confidence === 'alta')   return adjustments.confirm_high;
      if(confidence === 'media')  return adjustments.confirm_medium;
      return adjustments.confirm_low;
    }
    // Conflicto de dirección
    if(confidence === 'alta')   return adjustments.conflict_high;
    if(confidence === 'media')  return adjustments.conflict_medium;
    return adjustments.conflict_low;
  };

  try{
    const summary    = await getSummary({ symbol: null, page: 'bot' });
    const signal     = summary?.signal  || {};
    const posture    = summary?.posture || {};

    // Normalizar action — mantener NO OPERAR como valor propio
    const rawAction  = String(signal.action || 'NEUTRAL').trim().toUpperCase();
    const action     = rawAction; // NO OPERAR, LONG, SHORT, NEUTRAL
    const confidence = String(signal.confidence || 'baja').trim().toLowerCase();

    // Para el campo signal devuelto, mapear a algo legible
    const signalOut = action === 'NO OPERAR' ? 'NO OPERAR' : action;

    res.json({
      signal:        signalOut,
      confidence,
      bias:          posture.bias || null,
      postureScore:  typeof posture.score === 'number' ? posture.score : null,
      scoreAdjustment: {
        ifLong:  getAdjustment(action, confidence, 'LONG'),
        ifShort: getAdjustment(action, confidence, 'SHORT')
      },
      alerts:      Array.isArray(summary?.alerts) ? summary.alerts : [],
      generatedAt: summary?.generatedAt || new Date().toISOString()
    });
  }catch(error){
    res.json(fallback);
  }
});

router.use(requireAuth);

router.get('/api/intelligence/summary', async (req, res) => {
  try{
    const symbol  = String(req.query.symbol || '').trim().toUpperCase();
    const page    = String(req.query.page || 'aidata').trim().toLowerCase();
    const summary = await getSummary({ symbol, page });
    res.json(summary);
  }catch(error){
    res.status(500).json({ error: error.message || 'No pude cargar el resumen de inteligencia' });
  }
});

router.post('/api/intelligence/chat', async (req, res) => {
  try{
    const question = String(req.body?.question || '').trim();
    const context  = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const history  = Array.isArray(req.body?.history) ? req.body.history : [];
    const symbol   = String(
      req.body?.symbol ||
      context.activo ||
      context.symbol ||
      context.posicion?.symbol ||
      ''
    ).trim().toUpperCase();
    const page = String(req.body?.page || 'aidata').trim().toLowerCase();

    if(!question) return res.status(400).json({ error: 'La pregunta es obligatoria' });

    const response = await answerQuestion({ question, symbol, page, context, history });
    res.json(response);
  }catch(error){
    res.status(500).json({ error: error.message || 'No pude responder la consulta' });
  }
});

module.exports = router;