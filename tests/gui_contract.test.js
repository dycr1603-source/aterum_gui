'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {getAnalyticsHTML} = require('../views/analytics');
const {getDashboardHTML} = require('../views/dashboard');
const elements = new Map();
const element = id => {if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{}});return elements.get(id);};
const context = {document:{addEventListener(){},getElementById:element},URL,AbortSignal,console};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/gui.js'),'utf8'),context);
const html=getAnalyticsHTML({username:'<img onerror=alert(1)>'});
const dashboard=getDashboardHTML('CFXUSDT',{username:'GUI validation'});
assert(dashboard.includes('<script src="/aterum-assets/gui.js"></script>'),'Trading needs the shared API and account helpers');
assert(dashboard.includes('AterumUI.json(\'/api/dashboard/state\')'),'Dashboard state must use the shared checked API client');
assert(!html.includes('<span class="nav-user nav-user-blue"><img'), 'User names must be escaped');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('let allStats=null'));
const rendering=inline.slice(inline.indexOf('function render(){'),inline.indexOf('// Arrancar stream'));
const recent=[
  {id:1,symbol:'LOSSUSDT',direction:'LONG',pnl_usdt:-8,close_reason:'TP',r_final:-1,closed_at:new Date().toISOString(),opened_at:'2020-01-01',status:'CLOSED'},
  {id:2,symbol:'WINUSDT',direction:'SHORT',pnl_usdt:2,close_reason:'SL',r_final:0.5,closed_at:new Date().toISOString(),status:'CLOSED'},
  {id:3,symbol:'OPENUSDT',direction:'SHORT',pnl_usdt:null,opened_at:new Date().toISOString(),status:'OPEN'}
];
context.fixture={recent,weeklyPnl:[],symbols:[{symbol:'LOSSUSDT',total_pnl:-6,win_rate:50}],topRejections:[]};
vm.runInContext("let allStats=fixture,allResearch=null,period=7,filterDir='',filterResult='';function money(v){return AterumUI.money(v)}function fmtNum(v,d){return AterumUI.number(v,d)}function metricColor(){return ''}"+rendering,context);
vm.runInContext('render()',context);
assert(element('kpiGrid').innerHTML.includes('-$6.00'),'Negative total PnL keeps its sign');
assert(element('tradesTbl').innerHTML.includes('-$8.00'),'TP label never flips a recorded loss');
assert(element('tradesTbl').innerHTML.includes('+$2.00'),'SL label never flips a recorded gain');
assert(element('tradesTbl').innerHTML.includes('trade%3A1'),'Each trade links to persisted decision evidence');
assert(element('symList').innerHTML.includes('-$6.00'),'Symbol PnL keeps its sign');
vm.runInContext("filterResult='loss';render()",context);
assert(!element('tradesTbl').innerHTML.includes('OPENUSDT'),'Open positions are not classified as losses');
assert(element('tradesTbl').innerHTML.includes('LOSSUSDT'),'Period uses close date for realized results');
assert.equal(context.AterumUI.number(null),'—');
assert.equal(context.AterumUI.number(0),'0');
assert.equal(context.AterumUI.accountFresh({status:'unavailable',ts:Date.now()}),false);
assert.equal(context.AterumUI.accountFresh({status:'ready',snapshotTs:Date.now()-120000,ts:Date.now()}),false);
assert.equal(context.AterumUI.accountFresh({status:'ready',snapshotTs:Date.now(),balance:0}),true);
(async()=>{
  context.fetch=async()=>({status:503,ok:false});
  await assert.rejects(context.AterumUI.json('/api/example'),/HTTP 503/);
  context.fetch=async()=>({status:401,ok:false});
  await assert.rejects(context.AterumUI.json('/api/example'),/sesión/);
  console.log('GUI contracts: recorded PnL, filters, dates, missing values, freshness and HTTP errors passed');
})().catch(error=>{console.error(error);process.exitCode=1});
