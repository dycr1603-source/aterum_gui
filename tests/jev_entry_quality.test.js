'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {screen,validateSelection}=require('../services/jev_entry_quality');
const d={indicators:{atr:2,ema21:100,volRatio:1}};
test('missing data and concentration fail closed',()=>{
 assert.equal(screen({}, {positions:[]},100).allowed,false);
 assert.equal(screen(d,{positions:[{},{}]},100).reasons[0],'JEV_POSITION_LIMIT');
 assert.equal(screen({...d,indicators:{...d.indicators,volRatio:0.5}},{positions:[]},100).allowed,false);
});
test('extension is symmetric and does not invert the proposed direction',()=>{
 assert.deepEqual(screen(d,{positions:[]},105).blockedSides,['LONG']);
 assert.deepEqual(screen(d,{positions:[]},95).blockedSides,['SHORT']);
});
test('fees and uncertainty can reject otherwise valid proposals',()=>{
 const a={choice:'LONG',confidence:0.8,probabilities:{LONG:0.9,SHORT:0.05,NO_TRADE:0.05}};
 assert.equal(validateSelection(a,100,98,103).allowed,true);
 assert.equal(validateSelection(a,100,99,101.3).allowed,false);
 assert.equal(validateSelection({...a,confidence:0.3},100,98,104).allowed,false);
 assert.equal(validateSelection({...a,probabilities:{LONG:0.5,SHORT:0.45,NO_TRADE:0.05}},100,98,104).allowed,false);
});
