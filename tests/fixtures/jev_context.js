'use strict';
module.exports = () => ({
  directionalEvidence: Object.fromEntries(['LONG','SHORT'].map(direction => [direction, {
    direction, score: direction === 'LONG' ? 90 : 30,
    contributions: [{ component: 'base', value: direction === 'LONG' ? 90 : 30 }],
    tf4h: { trend: 'LONG', status: direction === 'LONG' ? 'CONFIRMS' : 'CONTRADICTS' },
    indicators: { currentPrice: 100, atr: 2 }
  }])),
  directionalRisk: { LONG: [], SHORT: [] }
});
