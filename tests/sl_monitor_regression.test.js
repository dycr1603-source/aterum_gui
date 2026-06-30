'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowPath = path.resolve(__dirname, '../bot-control/workflows/current/sl-monitor.workflow.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const code = workflow.nodes.find(node => node.name === 'SL Monitor Code').parameters.jsCode;

async function runScenario({ price, hoursOpen = 1, engineFailure = false }) {
  const calls = [];
  const position = {
    positionSide: 'LONG', slPrice: 90, qty: 10, side: 'SELL', entryPrice: 100,
    initialSL: 90, stage: 'INITIAL', tp: 120, leverage: 5,
    openedAt: Date.now() - hoursOpen * 3600000
  };
  const state = { positions: { BTCUSDT: position } };
  const helpers = { httpRequest: async options => {
    calls.push({ method: options.method, url: options.url, body: options.body });
    if (options.url.includes('/fapi/v2/positionRisk')) return [{
      symbol: 'BTCUSDT', positionAmt: '10', positionSide: 'LONG', entryPrice: '100'
    }];
    if (options.url.includes('/fapi/v1/ticker/price')) return { symbol: 'BTCUSDT', price: String(price) };
    if (options.url.endsWith('/executions')) {
      if (engineFailure) return {
        ok: false, executionId: options.body.executionId, finalStatus: 'FAILED',
        error: 'Binance rejected request', verificationResult: { verified: false }
      };
      return {
        ok: true, executionId: options.body.executionId, exchangeOrderId: '8001',
        exchangeResponse: { order: { orderId: '8001', avgPrice: String(price), status: 'FILLED' } },
        verificationResult: { verified: true, requested: options.body, exchangeVerified: true },
        finalStatus: 'VERIFIED', timestamp: new Date().toISOString()
      };
    }
    if (options.url.includes('/db/trade/close')) return { ok: true };
    if (options.method === 'DELETE' && options.url.includes('/trade/BTCUSDT')) return { ok: true };
    if (options.url.includes('/cb/') || options.url.includes('/cooldown/set')) return { ok: true };
    if (options.method === 'POST' && options.url.endsWith('/trade')) return { ok: true };
    throw new Error(`Unexpected request ${options.method} ${options.url}`);
  } };
  const processMock = { env: {
    BINANCE_API_KEY: 'test-key', BINANCE_API_SECRET: 'test-secret',
    INTERNAL_DASHBOARD_BASE: 'http://dashboard:3001',
    EXECUTION_ENGINE_TOKEN: 'test-engine-token', EXECUTION_ENGINE_URL: 'http://position_guard:3091/executions'
  } };
  const fn = new AsyncFunction('$input', '$getWorkflowStaticData', 'process', 'require', 'console', code);
  const output = await fn.call({ helpers }, { first: () => ({ json: {} }) }, () => state,
    processMock, require, { log() {} });
  return { result: output[0].json, calls, state };
}

function engineCall(calls) { return calls.find(call => call.url.endsWith('/executions')); }

async function runExternalClose({ persistenceFailure = false } = {}) {
  const calls = [];
  const stopExecutionId = '16446462-ebc2-473a-ba74-f44d980744b4';
  const state = { positions: { TAOUSDT: {
    positionSide: 'SHORT', slPrice: 199.91, qty: 1.27, side: 'BUY', entryPrice: 203.16,
    initialSL: 205.86, stage: 'TIME_LOCK', tp: 197.28, leverage: 5,
    openedAt: Date.now() - 9 * 3600000, lastExecutionId: stopExecutionId
  } } };
  const helpers = { httpRequest: async options => {
    calls.push({ method: options.method, url: options.url, body: options.body });
    if (options.url.includes('/fapi/v2/positionRisk')) return [];
    if (options.url.includes('/fapi/v1/userTrades')) return [{ orderId: 11775207017, side: 'BUY',
      qty: '1.27', price: '199.92', realizedPnl: '4.1148', time: Date.now() - 1000 }];
    if (options.url.includes('/fapi/v1/allOrders')) return [{ orderId: 11775207017, type: 'MARKET', side: 'BUY' }];
    if (options.url.includes('/fapi/v1/allAlgoOrders')) return [{ algoId: 3000001998111891,
      actualOrderId: 11775207017, orderType: 'STOP_MARKET', side: 'BUY', positionSide: 'SHORT' }];
    if (options.url.endsWith('/reconciliations')) return { ok: options.body.persistenceStatus !== 'FAILED',
      executionId: options.body.executionId, correlationId: options.body.correlationId || stopExecutionId,
      cleanup: { verified: true, cancelled: [{ orderId: 3000001997551395 }], remaining: [] },
      error: options.body.persistenceStatus === 'FAILED' ? 'recorded persistence failure' : null };
    if (options.url.includes('/db/trade/close')) {
      if (persistenceFailure) {
        const error = new Error('Request failed with status code 500');
        error.config = { method: 'POST', url: options.url };
        error.response = { status: 500, data: { error: 'database unavailable' } };
        throw error;
      }
      return { ok: true, status: 'ok', alreadyPersisted: true };
    }
    if (options.method === 'DELETE' && options.url.includes('/trade/TAOUSDT')) return { ok: true };
    if (options.url.includes('/cb/') || options.url.includes('/cooldown/set')) return { ok: true };
    throw new Error(`Unexpected request ${options.method} ${options.url}`);
  } };
  const processMock = { env: { BINANCE_API_KEY: 'test-key', BINANCE_API_SECRET: 'test-secret',
    INTERNAL_DASHBOARD_BASE: 'http://dashboard:3001', EXECUTION_ENGINE_TOKEN: 'test-engine-token',
    EXECUTION_ENGINE_URL: 'http://position_guard:3091/executions' } };
  const fn = new AsyncFunction('$input', '$getWorkflowStaticData', 'process', 'require', 'console', code);
  const output = await fn.call({ helpers }, { first: () => ({ json: {} }) }, () => state,
    processMock, require, { log() {} });
  return { result: output[0].json, calls, state };
}

(async () => {
  const timed = await runScenario({ price: 99, hoursOpen: 6.1 });
  assert.equal(timed.result.status, 'TIME_SL_ADJUSTED');
  assert.equal(timed.result.finalStatus, 'VERIFIED');
  assert.equal(timed.result.newSL, 93);
  assert.equal(engineCall(timed.calls).body.type, 'MOVE_STOP_LOSS');
  assert.equal(engineCall(timed.calls).body.targetPrice, 93);
  assert.equal(timed.state.positions.BTCUSDT.slPrice, 93);
  assert(timed.result.telegramText.includes('SL AJUSTADO POR TIEMPO'));

  const stop = await runScenario({ price: 90 });
  assert.equal(stop.result.status, 'SL_EXECUTED');
  assert.equal(stop.result.finalStatus, 'VERIFIED');
  assert.equal(engineCall(stop.calls).body.type, 'CLOSE_POSITION');
  assert.equal(engineCall(stop.calls).body.reason, 'STOP_LOSS_TRIGGERED');
  assert.equal(stop.state.positions.BTCUSDT, undefined);
  assert(stop.result.telegramText.includes('TRADE CERRADO'));

  const timeExit = await runScenario({ price: 99, hoursOpen: 20.1 });
  assert.equal(timeExit.result.status, 'TIME_EXIT');
  assert.equal(timeExit.result.finalStatus, 'VERIFIED');
  assert.equal(engineCall(timeExit.calls).body.type, 'CLOSE_POSITION');
  assert.equal(engineCall(timeExit.calls).body.reason, 'TIME_EXIT_20H');
  assert.equal(timeExit.state.positions.BTCUSDT, undefined);

  const rejected = await runScenario({ price: 90, engineFailure: true });
  assert.equal(rejected.result.status, 'SL_EXECUTION_FAILED');
  assert.equal(rejected.result.finalStatus, 'FAILED');
  assert(rejected.state.positions.BTCUSDT, 'Rejected close removed local position');
  assert(!rejected.result.telegramText.includes('TRADE CERRADO'), 'Rejected close emitted success notification');
  assert.equal(rejected.calls.some(call => call.url.includes('/db/trade/close')), false);
  assert.equal(rejected.calls.some(call => call.method === 'DELETE' && call.url.includes('/trade/BTCUSDT')), false);

  const external = await runExternalClose();
  assert.equal(external.result.status, 'EXCHANGE_CLOSE_VERIFIED');
  assert.equal(external.result.closeType, 'SL', 'regular MARKET fill overrode matching STOP algo');
  assert.equal(external.result.finalStatus, 'VERIFIED');
  assert.equal(external.state.positions.TAOUSDT, undefined);
  assert(!external.result.telegramText.includes('EXECUTION FAILED'));
  assert.notEqual(external.result.executionId, 'not-created');
  const closeCall = external.calls.find(call => call.url.includes('/db/trade/close'));
  assert.equal(closeCall.body.trailingStage, 'TIME_LOCK');
  assert.equal(closeCall.body.exchangeVerified, true);
  const reconciliationCalls = external.calls.filter(call => call.url.endsWith('/reconciliations'));
  assert.deepStrictEqual(reconciliationCalls.map(call => call.body.persistenceStatus), ['PENDING', 'VERIFIED']);
  assert.equal(reconciliationCalls[0].body.correlationId, '16446462-ebc2-473a-ba74-f44d980744b4');
  assert.equal(external.result.verificationResult.verified, true);

  const persistence = await runExternalClose({ persistenceFailure: true });
  assert.equal(persistence.result.status, 'EXTERNAL_CLOSE_PERSISTENCE_FAILED');
  assert(persistence.result.telegramText.includes('ATERUM PERSISTENCE FAILED'));
  assert(persistence.result.telegramText.includes('Local persistence failed after verified Binance close.'));
  assert(persistence.result.telegramText.includes('HTTP Method: POST'));
  assert(persistence.result.telegramText.includes('Status Code: 500'));
  assert(!persistence.result.telegramText.includes('Binance did not confirm'));
  assert(persistence.state.positions.TAOUSDT, 'Persistence failure removed local monitor state');

  console.log('SL monitor regression tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
