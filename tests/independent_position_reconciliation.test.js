'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PositionGuard } = require('../position-guard/guard');
const { ExecutionEngine } = require('../position-guard/execution-engine');
const slWorkflow = require('../bot-control/workflows/current/sl-monitor.workflow.json');
const trailingWorkflow = require('../bot-control/workflows/current/trailing-manager.workflow.json');
const { graphHash, assertNoConflict, sourceWorkflow } = require('../scripts/sync-local-workflows');

const code = name => slWorkflow.nodes.find(node => node.name === name).parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function callNode(name, state, body) {
  return new AsyncFunction('$getWorkflowStaticData', '$input', code(name))(
    () => state, { first: () => ({ json: { body } }) });
}

test('SL Monitor keeps hedge sides separate and Trailing Manager resolves the real symbol', async () => {
  const state = {};
  await callNode('Guardar Estado', state, { symbol: 'ETHUSDT', positionSide: 'LONG', slPrice: 95,
    entryPrice: 100, qty: 1, side: 'SELL' });
  await callNode('Guardar Estado', state, { symbol: 'ETHUSDT', positionSide: 'SHORT', slPrice: 105,
    entryPrice: 100, qty: 2, side: 'BUY' });
  assert.deepEqual(Object.keys(state.positions).sort(), ['ETHUSDT:LONG', 'ETHUSDT:SHORT']);
  assert.equal(state.positions['ETHUSDT:LONG'].slPrice, 95);
  assert.equal(state.positions['ETHUSDT:SHORT'].slPrice, 105);
  const read = await callNode('Leer Estado', state, {});
  assert.equal(Object.keys(read[0].json.positions).length, 2);
  await callNode('Eliminar Posición', state, { symbol: 'ETHUSDT', positionSide: 'LONG' });
  assert.deepEqual(Object.keys(state.positions), ['ETHUSDT:SHORT']);
  const trailing = trailingWorkflow.nodes.find(n => n.name === 'Trailing Manager Code').parameters.jsCode;
  assert.match(trailing, /const symbol=pos\.symbol\|\|key\.split/);
  assert.match(code('SL Monitor Code'), /const symbol = pos\.symbol \|\| key\.split/);
});

test('Position Guard adopts an external protected Binance position without sending an order', async t => {
  const calls = { db: [], http: [], event: [], alert: [], exchange: [] };
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.http.push({ url, method: options.method, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };
  t.after(() => { global.fetch = originalFetch; });
  const binance = {
    positions: async () => { calls.exchange.push('GET positions'); return [{ symbol: 'ETHUSDT', positionSide: 'LONG',
      positionAmt: '1.5', entryPrice: '100', leverage: '3' }]; },
    openOrders: async () => { calls.exchange.push('GET openOrders'); return []; },
    openAlgoOrders: async () => { calls.exchange.push('GET openAlgoOrders'); return [
      { symbol: 'ETHUSDT', positionSide: 'LONG', side: 'SELL', orderType: 'STOP_MARKET',
        algoStatus: 'NEW', triggerPrice: '95' },
      { symbol: 'ETHUSDT', positionSide: 'LONG', side: 'SELL', orderType: 'TAKE_PROFIT_MARKET',
        algoStatus: 'NEW', triggerPrice: '110' }
    ]; }
  };
  const guard = new PositionGuard({ binance, db: { execute: async (sql, values) => {
    calls.db.push({ sql, values });
    assert.match(sql, /^INSERT INTO trades/);
    return [{ insertId: 42 }];
  } }, config: { n8nBase: 'http://n8n.local', dashboardBase: 'http://dashboard.local',
    enforce: false, unprotectedGraceMs: 60000 }, executionEngine: {
    execute: async () => { throw Error('ORDER_SUBMISSION_FORBIDDEN_IN_TEST'); }
  } });
  guard.expectedTrades = async () => [];
  guard.activeExecution = async () => null;
  guard.pendingLocalOpen = async () => null;
  guard.event = async e => { calls.event.push(e); };
  guard.alert = async (...a) => { calls.alert.push(a); };
  const result = await guard.scan();
  assert.equal(result.ok, true);
  assert.equal(result.adopted, 1);
  assert.equal(result.protected, 1);
  assert.equal(calls.db.length, 1);
  assert.deepEqual(calls.exchange.sort(), ['GET openAlgoOrders', 'GET openOrders', 'GET positions']);
  const seeded = calls.http.find(c => c.url.endsWith('/webhook/sl-monitor-set'));
  assert(seeded);
  assert.equal(seeded.body.symbol, 'ETHUSDT');
  assert.equal(seeded.body.positionSide, 'LONG');
  assert.equal(seeded.body.slPrice, 95);
  assert.equal(seeded.body.source, 'BINANCE_SYNC');
  assert(calls.http.every(c => c.method === 'POST' && !/binance\.com/.test(c.url)));
});

test('workflow sync refuses unknown or locally edited definitions', () => {
  const credential = { id: 'local-telegram', name: 'Aterum Telegram local' };
  const desired = sourceWorkflow('sl-monitor.workflow.json', 'ZYhtV8yWXjNukrW4', 'SL Monitor', credential);
  assert(desired.nodes.filter(n => n.credentials?.telegramApi).every(n =>
    n.credentials.telegramApi.id === credential.id));
  const row = { id: desired.id, name: desired.name, versionId: 'saved-v1', nodes: JSON.stringify(desired.nodes),
    connections: JSON.stringify(desired.connections), settings: JSON.stringify(desired.settings) };
  const current = { workflows: [row] };
  assert.throws(() => assertNoConflict(current, desired, null), /UNMANAGED_WORKFLOW/);
  assert.equal(assertNoConflict(current, desired, { deployedHash: graphHash(desired) }), row);
  const changed = { ...row, settings: JSON.stringify({ ...desired.settings, timezone: 'changed locally' }) };
  assert.throws(() => assertNoConflict({ workflows: [changed] }, desired,
    { deployedHash: graphHash(desired) }), /LOCAL_WORKFLOW_MODIFIED/);
  assert.throws(() => assertNoConflict({ workflows: [{ ...row, versionId: 'editor-v2' }] }, desired,
    { deployedHash: graphHash(desired), savedVersionId: 'saved-v1', status: 'published' }), /LOCAL_WORKFLOW_MODIFIED/);
  assert.equal(assertNoConflict(current, desired, { deployedHash: 'new-source-hash',
    previousHash: graphHash(desired), status: 'importing' }), row);
  assert.throws(() => assertNoConflict({ workflows: [row, { ...row, id: 'copy' }] }, desired,
    { deployedHash: graphHash(desired) }), /DUPLICATE_WORKFLOW/);
});

test('verified close removes only the matching hedge side from SL Monitor', async t => {
  const calls = [];
  const before = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, status: 200 };
  };
  t.after(() => { global.fetch = before; });
  const engine = new ExecutionEngine({ config: { n8nBase: 'http://n8n.local',
    dashboardBase: 'http://dashboard.local' }, db: {}, binance: {} });
  await engine.removeFinalizedMonitorState({ symbol: 'ETHUSDT', positionSide: 'LONG', executionId: 'close-long' });
  await engine.removeLocalState({ symbol: 'ETHUSDT', positionSide: 'SHORT', executionId: 'close-short',
    reason: 'STOP' }, { order: { avgPrice: '100' } });
  const deletions = calls.filter(call => call.url.endsWith('/webhook/sl-monitor-delete'));
  assert.deepEqual(deletions.map(call => call.body.positionSide), ['LONG', 'SHORT']);
  assert(calls.every(call => !/binance\.com/.test(call.url)));
});
