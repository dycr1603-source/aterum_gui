'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowPath = path.resolve(__dirname, '../bot-control/workflows/current/trailing-manager.workflow.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const code = workflow.nodes.find(node => node.name === 'Trailing Manager Code').parameters.jsCode;

function klines(price, range = 1) {
  return Array.from({ length: 30 }, (_, index) => [
    Date.now() - (30 - index) * 3600000,
    String(price), String(price + range / 2), String(price - range / 2), String(price), '1'
  ]);
}

async function runScenario({ currentPrice, stage = 'INITIAL', slPrice = 90, hoursOpen = 1, engineFailure = false }) {
  const calls = [];
  const position = {
    positionSide: 'LONG', slPrice, qty: 1, side: 'SELL', entryPrice: 100,
    initialSL: 90, stage, tp: 120, leverage: 5,
    openedAt: Date.now() - hoursOpen * 3600000
  };
  const helpers = {
    httpRequest: async options => {
      calls.push({ method: options.method, url: options.url, body: options.body });
      if (options.url.endsWith('/webhook/sl-monitor-get')) return { positions: { BTCUSDT: position } };
      if (options.url.includes('/fapi/v1/exchangeInfo')) return { symbols: [{
        symbol: 'BTCUSDT', filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.1' }]
      }] };
      if (options.url.includes('/fapi/v1/ticker/price')) return { symbol: 'BTCUSDT', price: String(currentPrice) };
      if (options.url.includes('/fapi/v1/klines')) return klines(currentPrice);
      if (options.url.endsWith('/executions')) {
        if (engineFailure) return {
          ok: false, executionId: options.body.executionId, finalStatus: 'FAILED',
          error: 'Binance rejected request', verificationResult: { verified: false }
        };
        return {
          ok: true, executionId: options.body.executionId, exchangeOrderId: '9001',
          exchangeResponse: { create: { algoId: '9001' } },
          verificationResult: { verified: true, requested: options.body, exchangeVerified: true },
          finalStatus: 'VERIFIED', timestamp: new Date().toISOString()
        };
      }
      if (options.url.endsWith('/webhook/sl-monitor-set')) return { ok: true, positions: { BTCUSDT: options.body } };
      if (options.url.endsWith('/trade')) return { ok: true };
      throw new Error(`Unexpected request ${options.method} ${options.url}`);
    }
  };
  const processMock = { env: {
    BINANCE_API_KEY: 'test-key', BINANCE_API_SECRET: 'test-secret',
    EXECUTION_ENGINE_TOKEN: 'test-engine-token', EXECUTION_ENGINE_URL: 'http://position_guard:3091/executions'
  } };
  const fn = new AsyncFunction('$input', 'process', 'require', 'console', code);
  const output = await fn.call({ helpers }, { first: () => ({ json: {} }) }, processMock, require, { log() {} });
  return { result: output[0].json, calls };
}

function executionCall(calls) {
  return calls.find(call => call.url.endsWith('/executions'));
}

async function assertVerifiedStage(name, scenario, expected) {
  const { result, calls } = await runScenario(scenario);
  const execution = executionCall(calls);
  assert(execution, `${name}: Execution Engine did not receive a request`);
  assert.equal(execution.body.type, expected.type, `${name}: wrong execution type`);
  assert.equal(execution.body.requestedStage, expected.stage, `${name}: wrong requested stage`);
  assert.equal(execution.body.targetPrice, expected.targetPrice, `${name}: wrong target price`);
  assert.equal(result.status, 'SL_UPDATED', `${name}: stage was not advanced`);
  assert.equal(result.finalStatus, 'VERIFIED', `${name}: result was not verified`);
  assert.equal(result.verificationResult.verified, true, `${name}: read-back was not verified`);
  assert(result.telegramText?.includes('SL ACTUALIZADO'), `${name}: verified notification missing`);
  const engineIndex = calls.indexOf(execution);
  const localIndexes = calls.map((call, index) => ({ call, index }))
    .filter(({ call }) => call.url.endsWith('/webhook/sl-monitor-set') || call.url.endsWith('/trade'))
    .map(({ index }) => index);
  assert(localIndexes.every(index => index > engineIndex), `${name}: local state changed before engine verification`);
}

(async () => {
  await assertVerifiedStage('Break Even 1R', { currentPrice: 110 }, {
    type: 'MOVE_STOP_LOSS', stage: 'BREAKEVEN', targetPrice: 100.1
  });
  await assertVerifiedStage('Lock 1.5R', { currentPrice: 115, stage: 'BREAKEVEN', slPrice: 100.1 }, {
    type: 'MOVE_STOP_LOSS', stage: 'LOCK', targetPrice: 105
  });
  await assertVerifiedStage('Trailing 2R', { currentPrice: 120, stage: 'LOCK', slPrice: 105 }, {
    type: 'TRAILING_STOP', stage: 'TRAILING', targetPrice: 119
  });
  await assertVerifiedStage('Time Lock', { currentPrice: 102, hoursOpen: 5 }, {
    type: 'MOVE_STOP_LOSS', stage: 'TIME_LOCK', targetPrice: 101.6
  });

  const failed = await runScenario({ currentPrice: 110, engineFailure: true });
  assert.equal(failed.result.status, 'monitoring', 'Rejected Binance request advanced local stage');
  assert.equal(failed.result.finalStatus, 'FAILED');
  assert(failed.result.telegramText.includes('EXECUTION FAILED'), 'Failure notification missing');
  assert(!failed.result.telegramText.includes('SL ACTUALIZADO'), 'Failure emitted a success notification');
  assert.equal(failed.calls.some(call => call.url.endsWith('/webhook/sl-monitor-set')), false,
    'Rejected Binance request updated SL Monitor');
  assert.equal(failed.calls.some(call => call.url.endsWith('/trade')), false,
    'Rejected Binance request updated Dashboard');

  console.log('trailing manager regression tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
