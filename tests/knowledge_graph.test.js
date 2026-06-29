'use strict';

const assert = require('assert');
const { parseRef, timelineFor, graphFor } = require('../services/knowledge_graph');

assert.deepEqual(parseRef('50'), { kind: 'trade', id: 50, ref: 'trade:50' });
assert.deepEqual(parseRef('rejection:588'), { kind: 'rejection', id: 588, ref: 'rejection:588' });
assert.throws(() => parseRef('BTCUSDT'));

const decision = {
  ref: 'trade:50', kind: 'trade', id: 50, symbol: 'HYPEUSDT', direction: 'SHORT',
  eventAt: '2026-06-28T23:30:33.000Z',
  finalDecision: { accepted: true, action: 'OPEN', reason: 'persisted reason' },
  scan: { id: 10, scanned_at: '2026-06-28T23:30:20.000Z', scan_score: 0.5, final_score: 86 },
  learning: { id: 2, created_at: '2026-06-28T23:30:30.000Z', action: 'ALLOW', reason: 'rule evidence' },
  trade: { marketOrderId: '123', openedAt: '2026-06-28T23:30:33.000Z', sl: 62, tp: 59,
    closedAt: '2026-06-29T02:47:12.000Z', closeReason: 'MANUAL', pnlUsdt: -2.6, rFinal: -1.1, trailingStage: 'INITIAL' },
  research: { id: 3 }, learningRules: [{ id: 7, rule_type: 'symbol', rule_key: 'HYPEUSDT' }],
  recommendations: [{ id: 8 }], recommendationReviews: [], changes: [], postTrade: { id: 9, created_at: '2026-06-29T02:47:20.000Z' },
  n8nExecution: { id: 100, nodes: [{ name: 'Execute Trade', at: '2026-06-28T23:30:31.000Z', durationMs: 1000, status: 'success' }] }
};

const timeline = timelineFor(decision);
assert(timeline.length >= 7);
assert.equal(timeline[0].type, 'scan');
assert(timeline.some(event => event.title === 'Execute Trade'));

const graph = graphFor(decision);
assert(graph.nodes.some(node => node.id === 'rule:7'));
assert(graph.edges.some(edge => edge.relation === 'matched_rule'));
console.log('knowledge graph unit tests: ok');
