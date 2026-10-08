'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inferOpenTime } = require('../position-guard/open-time');
const now = Date.now();
const at = h => now - h * 3600000;
const opts={now,historyStart:now-7*86400000};
test('reconstructs current LONG after partial close and add, retaining original time',()=>{
 const fills=[{id:1,positionSide:'LONG',side:'BUY',qty:'10',time:at(9)},
 {id:2,positionSide:'LONG',side:'SELL',qty:'4',time:at(4)},
 {id:3,positionSide:'LONG',side:'BUY',qty:'2',time:at(2)}];
 assert.equal(inferOpenTime({side:'LONG',qty:8},fills,opts),at(9));
});
test('separates hedge sides and reconstructs SHORT',()=>{
 const fills=[{id:1,positionSide:'SHORT',side:'SELL',qty:'3',time:at(8)},
 {id:2,positionSide:'LONG',side:'BUY',qty:'5',time:at(7)},
 {id:3,positionSide:'SHORT',side:'BUY',qty:'1',time:at(3)}];
 assert.equal(inferOpenTime({side:'SHORT',qty:2},fills,opts),at(8));
});
test('refuses incomplete and saturated history',()=>{
 assert.equal(inferOpenTime({side:'LONG',qty:5},[{id:1,positionSide:'LONG',side:'BUY',qty:'2',time:at(2)}],opts),null);
 assert.equal(inferOpenTime({side:'LONG',qty:1},Array(1000).fill({positionSide:'LONG',side:'BUY',qty:'1',time:at(1)}),opts),null);
});
test('Position Guard persists verified Binance open time without an order', async()=>{
 const {PositionGuard}=require('../position-guard/guard');
 const writes=[];
 const guard=new PositionGuard({db:{execute:async(sql,args)=>{writes.push({sql,args});return [{insertId:41}]}},
   binance:{userTrades:async()=>[{id:1,positionSide:'LONG',side:'BUY',qty:'2',time:at(6)}]},config:{}});
 guard.event=async()=>{};guard.alert=async()=>{};guard.publishPosition=async()=>{};
 const adopted=await guard.adoptPosition({symbol:'TESTUSDT',side:'LONG',entryPrice:10,qty:2,leverage:2},
   [{stopPrice:'9.5'}],[{stopPrice:'11'}]);
 assert.equal(new Date(adopted.opened_at).getTime(),at(6));
 assert.equal(new Date(writes[0].args.at(-1)).getTime(),at(6));
});
