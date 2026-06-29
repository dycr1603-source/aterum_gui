'use strict';

const assert = require('assert');
const { PositionGuard } = require('./guard');

async function run() {
  const calls = [];
  const position = { symbol:'BTCUSDT', positionAmt:'-0.01', positionSide:'SHORT', entryPrice:'100', markPrice:'101', leverage:'3' };
  const binance = {
    positions: async () => [position],
    openAlgoOrders: async () => [],
    closeMarket: async () => { calls.push('market-close'); return { orderId:'9002' }; }
  };
  const guard = new PositionGuard({
    config:{ enforce:true, unprotectedGraceMs:60000, alertCooldownMs:300000, telegramToken:'', telegramChatId:'' },
    db:{}, binance
  });
  guard.expectedTrades = async () => [{ id:1,symbol:'BTCUSDT',direction:'SHORT',entry_price:100,sl_price:102,tp_price:95,qty:0.01,opened_at:'2026-06-29 00:00:00' }];
  guard.event = async event => calls.push(`event:${event.eventType}`);
  guard.alert = async () => calls.push('alert');
  const first = await guard.scan();
  assert.equal(first.unprotected, 1);
  assert.equal(calls.includes('market-close'), false);
  guard.unprotectedSince.set('BTCUSDT:SHORT', Date.now() - 60001);
  const second = await guard.scan();
  assert.equal(second.emergencyClosed, 1);
  assert.equal(calls.includes('market-close'), true);
  assert.equal(calls.includes('event:UNPROTECTED_POSITION'), true);
  assert.equal(calls.includes('event:EMERGENCY_CLOSE'), true);
  assert.equal(calls.includes('alert'), true);
  console.log('position-guard simulation: missing SL alerts, waits and closes after grace without live API');
}

run().catch(error => { console.error(error); process.exit(1); });
