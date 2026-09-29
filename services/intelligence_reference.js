'use strict';

// Intelligence is a heuristic reference, separate from Jev and operational vetoes.
function intelligenceReference(signal) {
  const confidence = typeof signal?.confidence === 'string'
    ? signal.confidence.trim().toLowerCase() : '';
  const applied = confidence === 'alta';
  return {
    policy: 'high-confidence-only-v1',
    minimumConfidence: 'alta',
    receivedConfidence: ['alta', 'media', 'baja'].includes(confidence) ? confidence : null,
    applied,
    reason: applied ? 'HIGH_CONFIDENCE_REFERENCE'
      : !signal ? 'NO_REFERENCE' : 'CONFIDENCE_BELOW_REQUIRED'
  };
}

function marketContextForJev(context) {
  if (!context || typeof context !== 'object') return context;
  const { intelligenceSignal, ...market } = context;
  if (intelligenceReference(intelligenceSignal).applied) {
    market.intelligenceSignal = { ...intelligenceSignal, confidence: 'alta',
      source: 'aterum-intelligence-heuristic', role: 'reference_only' };
  }
  return market;
}

module.exports = { intelligenceReference, marketContextForJev };
