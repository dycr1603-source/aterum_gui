'use strict';

const assert = require('assert');
const { ExecutionEngine } = require('./execution-engine');

function algo({ id, client, type = 'STOP_MARKET', price = 95, side = 'SELL', positionSide = 'LONG' }) {
  return { algoId: id, clientAlgoId: client, symbol: 'BTCUSDT', side, positionSide,
    orderType: type, algoStatus: 'NEW', triggerPrice: String(price) };
}

class FakeBinance {
  constructor() {
    this.position = { symbol: 'BTCUSDT', positionAmt: '10', positionSide: 'LONG',
      entryPrice: '100', markPrice: '101', leverage: '5' };
    this.algos = [algo({ id: 1, client: 'old-stop', price: 90 })];
    this.orders = [];
    this.nextAlgo = 10;
    this.nextOrder = 100;
  }
  positions() { return Promise.resolve(this.position ? [this.position] : []); }
  openOrders() { return Promise.resolve(this.orders); }
  openAlgoOrders() { return Promise.resolve(this.algos); }
  createAlgoOrder(params) {
    const row = algo({ id: this.nextAlgo++, client: params.clientAlgoId, type: params.type,
      price: params.triggerPrice, side: params.side, positionSide: params.positionSide });
    if (params.callbackRate != null) row.callbackRate = String(params.callbackRate);
    this.algos.push(row); return Promise.resolve(row);
  }
  cancelAlgoOrder(id) { this.algos = this.algos.filter(row => row.algoId !== id); return Promise.resolve({ algoId: id }); }
  cancelOrder(_symbol, id) { this.orders = this.orders.filter(row => row.orderId !== id); return Promise.resolve({ orderId: id }); }
  queryOrder(_symbol, client) {
    const found = this.orders.find(row => row.clientOrderId === client);
    return found ? Promise.resolve(found) : Promise.reject(Object.assign(new Error('Order does not exist'), { code: -2013 }));
  }
  createOrder(params) {
    const before = Math.abs(Number(this.position.positionAmt));
    const remaining = Math.max(0, before - Number(params.quantity));
    const row = { orderId: this.nextOrder++, clientOrderId: params.newClientOrderId, status: 'FILLED',
      executedQty: String(params.quantity), origQty: String(params.quantity), avgPrice: '101', symbol: params.symbol };
    this.orders.push(row);
    this.position = remaining ? { ...this.position, positionAmt: String(remaining) } : null;
    return Promise.resolve(row);
  }
  exchangeInfo() {
    return Promise.resolve({ symbols: [{ symbol: 'BTCUSDT', filters: [
      { filterType: 'PRICE_FILTER', tickSize: '0.1' },
      { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
      { filterType: 'MIN_NOTIONAL', notional: '5' }
    ] }] });
  }
  tickerPrice() { return Promise.resolve({ price: '100' }); }
  changePositionMode() { return Promise.resolve({ code: 200 }); }
  changeMarginType() { return Promise.resolve({ code: 200 }); }
  changeLeverage() { return Promise.resolve({ leverage: 5 }); }
}

function engine(binance = new FakeBinance(), db = { execute: async () => [[], []] }) {
  return new ExecutionEngine({ config: {}, db, binance });
}

async function testReplaceStop() {
  const binance = new FakeBinance();
  const result = await engine(binance).replaceProtection({
    executionId: '11111111-1111-4111-8111-111111111111', type: 'MOVE_STOP_LOSS',
    symbol: 'BTCUSDT', positionSide: 'LONG', targetPrice: 95
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(binance.algos.length, 1);
  assert.equal(binance.algos[0].triggerPrice, '95');
  assert.notEqual(binance.algos[0].algoId, 1);
}

async function testRejectedReplacementKeepsOldStop() {
  const binance = new FakeBinance();
  binance.createAlgoOrder = async () => { throw Object.assign(new Error('rejected'), { code: -2021 }); };
  await assert.rejects(() => engine(binance).replaceProtection({
    executionId: '22222222-2222-4222-8222-222222222222', type: 'MOVE_STOP_LOSS',
    symbol: 'BTCUSDT', positionSide: 'LONG', targetPrice: 95
  }), /rejected/);
  assert.equal(binance.algos.length, 1);
  assert.equal(binance.algos[0].algoId, 1);
}

async function testMoveTakeProfitKeepsStop() {
  const binance = new FakeBinance();
  const result = await engine(binance).replaceProtection({
    executionId: '99999999-9999-4999-8999-999999999999', type: 'MOVE_TAKE_PROFIT',
    symbol: 'BTCUSDT', positionSide: 'LONG', targetPrice: 110
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(binance.algos.filter(row => row.orderType === 'STOP_MARKET').length, 1);
  assert.equal(binance.algos.filter(row => row.orderType === 'TAKE_PROFIT_MARKET').length, 1);
  assert.equal(binance.algos.find(row => row.orderType === 'TAKE_PROFIT_MARKET').triggerPrice, '110');
}

async function testTrailingReplacesOnlyStop() {
  const binance = new FakeBinance();
  binance.algos.push(algo({ id: 2, client: 'existing-tp', type: 'TAKE_PROFIT_MARKET', price: 110 }));
  const result = await engine(binance).replaceProtection({
    executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'TRAILING_STOP',
    symbol: 'BTCUSDT', positionSide: 'LONG', targetPrice: 98
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(binance.algos.filter(row => row.orderType === 'STOP_MARKET').length, 1);
  assert.equal(binance.algos.find(row => row.orderType === 'STOP_MARKET').triggerPrice, '98');
  assert.equal(binance.algos.filter(row => row.orderType === 'TAKE_PROFIT_MARKET').length, 1);
  assert.equal(binance.algos.find(row => row.orderType === 'TAKE_PROFIT_MARKET').algoId, 2);
}

async function testVerifiedClose() {
  const binance = new FakeBinance();
  const result = await engine(binance).reducePosition({
    executionId: '33333333-3333-4333-8333-333333333333', type: 'CLOSE_POSITION',
    symbol: 'BTCUSDT', positionSide: 'LONG'
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(binance.position, null);
  assert.equal(binance.algos.length, 0);
  assert(result.exchangeOrderId);
}

async function testVerifiedPartialTakeProfit() {
  const binance = new FakeBinance();
  const result = await engine(binance).reducePosition({
    executionId: '44444444-4444-4444-8444-444444444444', type: 'PARTIAL_TAKE_PROFIT',
    symbol: 'BTCUSDT', positionSide: 'LONG', quantity: 3
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(Number(binance.position.positionAmt), 7);
  assert.equal(binance.algos.length, 1);
}

async function testVerifiedOpen() {
  const binance = new FakeBinance();
  binance.position = null;
  binance.algos = [];
  binance.createOrder = function(params) {
    const row = { orderId: this.nextOrder++, clientOrderId: params.newClientOrderId, status: 'FILLED',
      executedQty: String(params.quantity), origQty: String(params.quantity), avgPrice: '100', symbol: params.symbol };
    this.orders.push(row);
    this.position = { symbol: params.symbol, positionAmt: String(params.quantity), positionSide: params.positionSide,
      entryPrice: '100', markPrice: '100', leverage: '5' };
    return Promise.resolve(row);
  };
  const result = await engine(binance).openPosition({
    executionId: '55555555-5555-4555-8555-555555555555', type: 'OPEN_POSITION', symbol: 'BTCUSDT',
    positionSide: 'LONG', quantity: 2, leverage: 5, stopLoss: 95, takeProfit: 110
  });
  assert.equal(result.verificationResult.verified, true);
  assert.equal(binance.algos.length, 2);
  assert(binance.algos.some(row => row.orderType === 'STOP_MARKET'));
  assert(binance.algos.some(row => row.orderType === 'TAKE_PROFIT_MARKET'));
}

async function testPortfolioCapacityRejectsOpenBeforeBinance() {
  const binance = new FakeBinance();
  binance.position = null;
  binance.algos = [];
  const allocator = { capacity: async () => ({ allowed: false,
    primaryReason: { code: 'PORTFOLIO_RISK_FULL' } }) };
  const instance = new ExecutionEngine({ config: {}, db: { execute: async () => [[], []] },
    binance, portfolioAllocator: allocator });
  await assert.rejects(() => instance.openPosition({
    executionId: '12121212-1212-4212-8212-121212121212', type: 'OPEN_POSITION', symbol: 'BTCUSDT',
    positionSide: 'LONG', quantity: 2, leverage: 5, stopLoss: 95, takeProfit: 110
  }), /PORTFOLIO_RISK_FULL/);
  assert.equal(binance.position, null, 'capacity rejection still opened Binance position');
  assert.equal(binance.orders.length, 0, 'capacity rejection sent an entry order');
}

async function testPortfolioRejectionIsTerminalOutcome() {
  const binance = new FakeBinance();
  binance.position = null;
  binance.algos = [];
  const writes = [];
  const db = { execute: async (sql, params) => {
    writes.push({ sql, params });
    if (sql.startsWith('SELECT * FROM trade_executions')) return [[], []];
    return [{ affectedRows: 1 }, []];
  } };
  const capacity = { allowed: false,
    primaryReason: { code: 'DIRECTION_EXPOSURE_LIMIT', direction: 'SHORT', current: 400.3756, maximum: 400 },
    account: { equity: 203.7178 }, candidate: { symbol: 'ATOMUSDT', direction: 'SHORT',
      quantity: 137.8, entryPrice: 1.501, stopLoss: 1.524, leverage: 5 } };
  const instance = new ExecutionEngine({ config: {}, db, binance,
    portfolioAllocator: { capacity: async () => capacity } });
  instance.symbolRules = async () => ({ tick: 0.001, step: 0.1, minQty: 0.1, minNotional: 5 });
  binance.tickerPrice = async () => ({ price: '1.501' });
  const result = await instance.execute({ executionId: '13131313-1313-4313-8313-131313131313',
    type: 'OPEN_POSITION', symbol: 'ATOMUSDT', positionSide: 'SHORT', quantity: 137.8,
    leverage: 5, stopLoss: 1.524, takeProfit: 1.455 });
  assert.equal(result.finalStatus, 'REJECTED');
  assert.equal(result.status, 'PORTFOLIO_CAPACITY_REJECTED');
  assert.equal(result.failureCategory, 'EXECUTION_REJECTED');
  assert.equal(result.rejectionReason.code, 'DIRECTION_EXPOSURE_LIMIT');
  assert.equal(result.symbol, 'ATOMUSDT');
  assert.equal(result.exchangeOrderId, null);
  assert.equal(result.verificationResult.exchangeVerified, false);
  assert.equal(binance.orders.length, 0, 'rejected lifecycle created a Binance order');
  assert(writes.some(row => /final_status=\?/.test(row.sql) && row.params.includes('REJECTED')));
}

async function testFailureNeverUpdatesTradeState() {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT * FROM trade_executions')) return [[], []];
      return [[], []];
    }
  };
  const instance = engine(new FakeBinance(), db);
  instance.dispatch = async () => { throw Object.assign(new Error('Binance rejected request'), { code: -2021 }); };
  const result = await instance.execute({ executionId: '66666666-6666-4666-8666-666666666666',
    type: 'MOVE_STOP_LOSS', symbol: 'BTCUSDT', positionSide: 'LONG', targetPrice: 96 });
  assert.equal(result.finalStatus, 'FAILED');
  assert.equal(result.failureNotificationSent, false);
  assert.equal(queries.some(row => /UPDATE trades SET/.test(row.sql)), false);
  assert(queries.some(row => /final_status=\?/.test(row.sql) && row.params.includes('FAILED')));
}

async function testTerminalSuccessRequiresPersistence() {
  const queries = [];
  const db = { execute: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT * FROM trade_executions')) return [[], []];
    return [{ affectedRows: 1 }, []];
  } };
  const instance = engine(new FakeBinance(), db);
  instance.dispatch = async () => ({ exchangeOrderId: 123, exchangeResponse: { orderId: 123 },
    verificationResult: { verified: true, before: {}, after: {}, checkedAt: new Date().toISOString() } });
  let persisted = false;
  instance.persistVerifiedState = async () => { persisted = true; };
  const result = await instance.execute({ executionId: '77777777-7777-4777-8777-777777777777',
    type: 'CLOSE_POSITION', symbol: 'BTCUSDT', positionSide: 'LONG' });
  assert.equal(persisted, true);
  assert.equal(result.finalStatus, 'VERIFIED');
  assert.equal(result.verificationResult.pipelineVerified, true);
  assert.equal(result.verificationResult.persistenceStatus, 'VERIFIED');
  assert(queries.some(row => /final_status='VERIFIED'/.test(row.sql)));
}

async function testLocalFailureBlocksTerminalSuccess() {
  const db = { execute: async sql => sql.startsWith('SELECT * FROM trade_executions') ? [[], []] : [{ affectedRows: 1 }, []] };
  const instance = engine(new FakeBinance(), db);
  instance.dispatch = async () => ({ exchangeOrderId: 456, exchangeResponse: { orderId: 456 },
    verificationResult: { verified: true, before: {}, after: {}, checkedAt: new Date().toISOString() } });
  instance.persistVerifiedState = async () => { throw new Error('local persistence unavailable'); };
  const result = await instance.execute({ executionId: '88888888-8888-4888-8888-888888888888',
    type: 'CLOSE_POSITION', symbol: 'BTCUSDT', positionSide: 'LONG' });
  assert.equal(result.finalStatus, 'FAILED');
  assert.equal(result.verificationResult.verified, false);
  assert.equal(result.verificationResult.exchangeVerified, true);
}

(async () => {
  await testReplaceStop();
  await testRejectedReplacementKeepsOldStop();
  await testMoveTakeProfitKeepsStop();
  await testTrailingReplacesOnlyStop();
  await testVerifiedClose();
  await testVerifiedPartialTakeProfit();
  await testVerifiedOpen();
  await testPortfolioCapacityRejectsOpenBeforeBinance();
  await testPortfolioRejectionIsTerminalOutcome();
  await testFailureNeverUpdatesTradeState();
  await testTerminalSuccessRequiresPersistence();
  await testLocalFailureBlocksTerminalSuccess();
  console.log('execution engine tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
