'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const w = require('../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json')[0];
const { ExecutionEngine } = require('../position-guard/execution-engine');
const crypto=require('crypto');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function run(name,input,handler=async()=>({}),env={}) {
  const code=w.nodes.find(n=>n.name===name).parameters.jsCode;
  const fn=new AsyncFunction('$input','process','require','console',code);
  return (await fn.call({helpers:{httpRequest:handler}}, {first:()=>({json:input})},{env},require,{log(){},error(){}}))[0].json;
}
const base=()=>({...require('./fixtures/jev_context')(),symbol:'BTCUSDT',direction:'LONG',indicators:{currentPrice:100,atr:2},
  finalScore:90,technicalScore:90,dynamicThreshold:65,balance:1000,availableBalance:1000,
  tf4h:{status:'CONFIRMS'},aiResult:{regime:'TRENDING',recommended_leverage:5},
  portfolioCapacity:{allowed:true},opportunityCycleId:'cycle',marketDataAt:Date.now()});
const receipt=()=>({id:'a'.repeat(64),symbol:'BTCUSDT',mode:'enforce',enabled:true,decision:'LONG',
  context:require('../services/jev_authority').chosenContext(base(),'LONG'),expiresAt:Date.now()+10000,proposal:{direction:'LONG',entry:100,sl:97,tp:106}});
test('workflow topology retains risk, learning, sizing, sole writer and verified-open boundary',()=>{
  assert.equal(w.connections['If: Setup Found'].main[0][0].node,'Jev Entry Gate');
  assert.equal(w.connections['Jev Entry Gate'].main[0][0].node,'Deterministic Entry Gate');
  assert.equal(w.connections['Position Sizer'].main[0][0].node,'Execute Trade');
  assert.equal(w.active,false);
});
test('NO_TRADE/error blocks learning and execution; observation preserves baseline',async()=>{
  for(const handler of [async()=>({...receipt(),decision:'NO_TRADE',reason:'JEV_NO_TRADE'}),async()=>{throw new Error('offline');}]) {
    const gate=await run('Jev Entry Gate',base(),handler);
    assert.equal(gate.passAI,false); assert.equal(gate.jevBlocked,true);
    const out=await run('Deterministic Entry Gate',gate,async()=>{throw new Error('must not call');});
    assert.equal(out.passAI,false);
  }
  const observed=await run('Jev Entry Gate',base(),async()=>({...receipt(),mode:'observe',decision:'SHORT'}));
  assert.equal(observed.direction,'LONG'); assert.equal(observed.jev.mode,'observe'); assert(!observed.jevBlocked);
  const disabled=await run('Jev Entry Gate',base(),async()=>({enabled:false}));
  assert(!disabled.jev);
});
test('operational learning halt after Jev approval persists rejection and never announces open',async()=>{
  const gate=await run('Jev Entry Gate',base(),async()=>receipt());
  const learning=await run('Deterministic Entry Gate',gate,async()=>({allowed:false,primaryReason:'RISK_HALT',reason:'blocked',baseScore:90,finalScore:90,requiredScore:95,scoreTrace:{}}));
  assert.equal(learning.passAI,false);
  const calls=[];
  const rejected=await run('Build Entry Rejection',learning,async o=>{calls.push(o);return {};});
  assert(rejected.text.includes('ENTRY REJECTED')); assert.equal(calls.length,2); assert.equal(rejected.jev.id,gate.jev.id);
});
test('sizer uses Jev SL for risk sizing, preserves selected levels and prevents alternate-symbol bypass',async()=>{
  const d={...base(),jev:receipt()};
  const sized=await run('Position Sizer',d);
  assert.equal(sized.sl,97); assert.equal(sized.tp,106); assert.equal(sized.jev.id,d.jev.id);
  assert.equal(sized.riskAmount,Number((sized.qty*3).toFixed(2)));
  const rejected=await run('Position Sizer',{...d,portfolioCapacity:{allowed:false},opportunityRanking:[{...base(),symbol:'ETHUSDT',finalScore:100}]});
  assert.equal(rejected.qty,0); assert.equal(rejected.efficiencyGate.attempts.length,1);
});
test('same Jev decision uses one execution ID and one engine dispatch for concurrent and later replays',async()=>{
  const e=new ExecutionEngine({config:{},db:{execute:async()=>[{}]},binance:{}});
  e.event=async()=>{}; let dispatches=0; const stored=new Map();
  e.existing=async id=>stored.get(id);
  e.dispatch=async r=>{dispatches++;await new Promise(resolve=>setTimeout(resolve,5));return {exchangeOrderId:'1',exchangeResponse:{},verificationResult:{verified:true,after:{position:{qty:r.quantity,entryPrice:100}},requested:{stopLoss:r.stopLoss,takeProfit:r.takeProfit}}};};
  e.persistVerifiedState=async(r,v,x)=>{stored.set(r.executionId,{ok:true,executionId:r.executionId,finalStatus:'VERIFIED',exchangeOrderId:'1',exchangeResponse:x,verificationResult:{...v,pipelineVerified:true,persistenceStatus:'VERIFIED'}});};
  const requests=[];
  const handler=async o=>{requests.push(o.body);return e.execute(o.body);};
  const sized=await run('Position Sizer',{...base(),jev:receipt()});
  const results=await Promise.all([run('Execute Trade',sized,handler,{EXECUTION_ENGINE_TOKEN:'test'}),run('Execute Trade',sized,handler,{EXECUTION_ENGINE_TOKEN:'test'})]);
  assert(results.every(r=>r.success)); assert.equal(dispatches,1);assert.equal(requests[0].executionId,requests[1].executionId);
  assert.equal(requests[0].maxAttempts,1);
  await run('Execute Trade',sized,handler,{EXECUTION_ENGINE_TOKEN:'test'});assert.equal(dispatches,1);
});
test('expired or invalid Jev result makes zero execution requests',async()=>{
  for(const jev of [{...receipt(),expiresAt:0},{...receipt(),decision:'NO_TRADE'},{...receipt(),symbol:'ETHUSDT'}]) {
    let calls=0;
    const result=await run('Execute Trade',{...base(),jev,qty:1,side:'BUY'},async()=>{calls++;},{EXECUTION_ENGINE_TOKEN:'test'});
    assert.equal(result.success,false);assert.equal(calls,0);
  }
});
test('proposal alone cannot generate confirmed-open Telegram message',async()=>{
  await assert.rejects(run('Build Trade Alert',{...base(),jev:receipt(),success:false}), /blocked for unverified/);
});
test('explicit trading-disabled flag blocks baseline and Jev orders after observation',async()=>{
  let calls=0;
  for (const jev of [undefined,{...receipt(),mode:'observe'},receipt()]) {
    const result=await run('Execute Trade',{...base(),jev,qty:1,side:'BUY'},async()=>{calls++;},{N8N_TRADING_DISABLED:'1'});
    assert.equal(result.finalStatus,'REJECTED');assert.equal(result.error,'TRADING_DISABLED_BY_CONFIGURATION');
  }
  assert.equal(calls,0);
});
test('engine rejects missing receipt before any Binance mutation in enforced mode',async()=>{
  const names=['JEV_ENABLED','JEV_OBSERVE_ONLY']; const previous=names.map(k=>process.env[k]);
  process.env.JEV_ENABLED='true';process.env.JEV_OBSERVE_ONLY='false';
  let mutations=0;
  try {
    const e=new ExecutionEngine({config:{},db:{execute:async()=>[[]]},binance:{tickerPrice:async()=>({price:'100'}),
      createOrder:async()=>{mutations++;},changeLeverage:async()=>{mutations++;},changeMarginType:async()=>{mutations++;}}});
    e.snapshot=async()=>({position:null}); e.recoverMarketOrder=async()=>null;
    e.symbolRules=async()=>({tick:0.1,step:0.1,minQty:0.1,minNotional:1});
    await assert.rejects(e.openPosition({symbol:'BTCUSDT',positionSide:'LONG',executionId:crypto.randomUUID(),quantity:1,stopLoss:97,takeProfit:106}),/RECEIPT_REQUIRED/);
    assert.equal(mutations,0);
  } finally {names.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
test('opposite Jev decision survives advisory Learning veto and sizes the selected side', async()=>{
  const d=base(), context=require('../services/jev_authority').chosenContext(d,'SHORT');
  const jev={...receipt(),decision:'SHORT',context,proposal:{direction:'SHORT',entry:100,sl:103,tp:94}};
  const proposed=await run('Jev Entry Gate',d,async()=>jev);
  assert.equal(proposed.direction,'SHORT');assert.equal(proposed.technicalScore,30);
  for (const primaryReason of ['SCORE_BELOW_THRESHOLD','LEARNING_HARD_BLOCK']) {
    const learning=await run('Deterministic Entry Gate',proposed,async()=>({allowed:false,action:'REJECT',primaryReason,
      capital:{halted:false},baseScore:30,finalScore:25,requiredScore:65,scoreTrace:{contributions:context.contributionTable}}));
    assert.equal(learning.passAI,true); assert.equal(learning.decisionAuthority,'JEV');
    assert.equal(learning.decisionExplanation.primaryReason,'JEV_APPROVED');
    const sized=await run('Position Sizer',learning);
    assert.equal(sized.direction,'SHORT');assert.equal(sized.side,'SELL');
    assert.equal(sized.sl,103);assert.equal(sized.tp,94);assert.equal(sized.leverage,4);
    assert.equal(sized.technicalScore,30);assert.equal(sized.tf4h.status,'CONTRADICTS');
  }
  const baseline=await run('Deterministic Entry Gate',d,async()=>({allowed:false,primaryReason:'SCORE_BELOW_THRESHOLD',capital:{halted:false}}));
  assert.equal(baseline.passAI,false);
});
