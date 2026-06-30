'use strict';

const assert = require('assert');
const { normalizePosition, isStop, isTakeProfit, triggerPrice } = require('./binance');

const short = normalizePosition({ symbol: 'BTCUSDT', positionAmt: '-0.01', positionSide: 'SHORT', entryPrice: '100', markPrice: '101', leverage: '3' });
assert.equal(short.side, 'SHORT');
assert.equal(short.qty, 0.01);
assert.equal(isStop({ symbol:'BTCUSDT',side:'BUY',positionSide:'SHORT',orderType:'STOP_MARKET',algoStatus:'NEW',triggerPrice:'102' }, short), true);
assert.equal(isTakeProfit({ symbol:'BTCUSDT',side:'BUY',positionSide:'SHORT',type:'LIMIT',status:'NEW',price:'95' }, short), true);
assert.equal(triggerPrice({ triggerPrice:'102.5' }), 102.5);

console.log('position-guard unit tests: ok');
