'use strict';

const assert = require('assert');
const { PositionGuard } = require('./guard');

(async () => {
  const writes = [];
  const events = [];
  const db = { execute: async (sql, params) => { writes.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  const guard = new PositionGuard({ config: {}, db, binance: {} });
  guard.publishPosition = async () => true;
  guard.event = async entry => events.push(entry);
  guard.alert = async () => true;
  const expected = { id: 7, symbol: 'BTCUSDT', direction: 'LONG', entry_price: 99,
    initial_sl_price: 90, sl_price: 90, tp_price: 120, qty: 8, leverage: 3,
    trailing_stage: 'LOCK', opened_at: new Date() };
  const position = { symbol: 'BTCUSDT', side: 'LONG', positionSide: 'LONG', qty: 10,
    entryPrice: 100, leverage: 5 };
  const stops = [{ triggerPrice: '95' }];
  const takeProfits = [{ triggerPrice: '115' }];
  const result = await guard.synchronizePosition(position, expected, stops, takeProfits);
  assert.equal(result.drift, true);
  assert.deepStrictEqual(result.fields.sort(), ['entryPrice', 'leverage', 'qty', 'sl', 'tp'].sort());
  assert.equal(writes.length, 1);
  assert(/UPDATE trades SET entry_price/.test(writes[0].sql));
  assert.equal(expected.sl_price, 95);
  assert.equal(expected.tp_price, 115);
  assert.equal(expected.initial_sl_price, 90, 'sync must preserve initial risk baseline');
  assert.equal(expected.trailing_stage, 'LOCK', 'sync must preserve trailing stage');
  assert.equal(events[0].eventType, 'POSITION_DRIFT_RECONCILED');

  writes.length = 0;
  const stable = await guard.synchronizePosition(position, expected, stops, takeProfits);
  assert.equal(stable.drift, false);
  assert.equal(writes.length, 0);
  console.log('position synchronization tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
