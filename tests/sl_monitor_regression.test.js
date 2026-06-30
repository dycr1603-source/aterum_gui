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

  console.log('SL monitor regression tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
