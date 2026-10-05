'use strict';

const assert = require('assert');
const { normalizePosition, isStop, isTakeProfit, triggerPrice,
  protectionOrdersForPositions } = require('./binance');

const short = normalizePosition({ symbol: 'BTCUSDT', positionAmt: '-0.01', positionSide: 'SHORT', entryPrice: '100', markPrice: '101', leverage: '3' });
assert.equal(short.side, 'SHORT');
assert.equal(short.qty, 0.01);
assert.equal(isStop({ symbol:'BTCUSDT',side:'BUY',positionSide:'SHORT',orderType:'STOP_MARKET',algoStatus:'NEW',triggerPrice:'102' }, short), true);
assert.equal(isTakeProfit({ symbol:'BTCUSDT',side:'BUY',positionSide:'SHORT',type:'LIMIT',status:'NEW',price:'95' }, short), true);
assert.equal(triggerPrice({ triggerPrice:'102.5' }), 102.5);

async function testScopedProtectionQueries() {
  const calls = [];
  const binance = {
    openOrders: async symbol => { calls.push(`regular:${symbol}`); return [{ symbol }]; },
    openAlgoOrders: async symbol => { calls.push(`algo:${symbol}`); return [{ symbol }]; }
  };
  const rows = [
    { symbol: 'BNBUSDT', positionAmt: '0.01', positionSide: 'LONG' },
    { symbol: 'BNBUSDT', positionAmt: '-0.01', positionSide: 'SHORT' },
    { symbol: 'BTCUSDT', positionAmt: '0' }
  ];
  const orders = await protectionOrdersForPositions(binance, rows);
  assert.deepEqual(calls.sort(), ['algo:BNBUSDT', 'regular:BNBUSDT']);
  assert.equal(orders.regular.length, 1);
  assert.equal(orders.algo.length, 1);
  calls.length = 0;
  assert.deepEqual(await protectionOrdersForPositions(binance, []), { regular: [], algo: [] });
  assert.deepEqual(calls, []);
}

testScopedProtectionQueries().then(() => console.log('position-guard unit tests: ok'))
  .catch(error => { console.error(error); process.exitCode = 1; });
