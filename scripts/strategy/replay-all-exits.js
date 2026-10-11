"use strict";
// Historical exit-only counterfactual on recorded entries. Does not reproduce
// JEV's decision, fill probability, three-position capital or live liquidity.
const fs=require('node:fs');
const path=require('node:path');
const {metrics}=require('../../services/strategy/metrics');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const h=JSON.parse(fs.readFileSync(path.join(root,'research-history.json')));
const costs=JSON.parse(fs.readFileSync(path.join(root,'research-history-costs.json')));
const manual=new Set([5,6]);
const fee=.001,slip=.0006,fundingReserve=.001; // 5 bps slippage + 1 bps estimated exit half-spread
const sign=t=>t.direction==='LONG'?1:-1;
function med(a){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]??null;}
function entryTime(t){
 const raw=costs.find(x=>x.id===t.id);
 const linked=raw?.fills?.filter(f=>String(f.orderId)===String(t.market_order_id))||[];
 return linked.length?Math.min(...linked.map(x=>Number(x.time))):Date.parse(t.opened_at);
}
function stopFor(t,before,stopMode){
 if(stopMode==='old')return Number(t.initial_sl_price);
 const sample=before.slice(-20);
 if(sample.length<20)return null;
 const ranges=sample.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-sample[i].close),Math.abs(b.low-sample[i].close)));
 const atr=ranges.slice(-14).reduce((s,x)=>s+x,0)/14;
 const recent=before.slice(-6),entry=Number(t.entry_price),multiple=Number(stopMode);
 return t.direction==='LONG'
   ?Math.min(Math.min(...recent.map(x=>x.low))-atr*.25,entry-atr*multiple)
   :Math.max(Math.max(...recent.map(x=>x.high))+atr*.25,entry+atr*multiple);
}
function net(t,price){
 const e=Number(t.entry_price),q=Number(t.qty),exit=price*(1-sign(t)*slip);
 return sign(t)*(exit-e)*q-(e+exit)*q*fee-e*q*fundingReserve;
}
function replay(t,bars,c){
 const at=entryTime(t),entry=Number(t.entry_price),before=bars.filter(b=>b.time+300000<=at),
   after=bars.filter(b=>b.time>=Math.ceil(at/300000)*300000),stop=stopFor(t,before,c.stopMode);
 if(!(stop>0&&sign(t)*(entry-stop)>0&&after.length))return null;
 const risk=Math.abs(entry-stop),cost=entry*(2*(fee+slip)+fundingReserve);
 const target=entry+sign(t)*Math.max(risk*c.targetR,risk*1.1+cost*2.1);
 let highWaterR=0,pending=null;const closes=[];
 for(const b of after){
   const elapsed=(b.time+300000-at)/3600000;
   if(pending)return {id:t.id,reason:pending,net:net(t,b.open),hours:(b.time-at)/3600000,
     entryTime:at,exitTime:b.time};
   const hitStop=t.direction==='LONG'?b.low<=stop:b.high>=stop;
   const hitTarget=t.direction==='LONG'?b.high>=target:b.low<=target;
   if(hitStop){const exit=t.direction==='LONG'?Math.min(b.open,stop):Math.max(b.open,stop);
     return {id:t.id,reason:'STOP',net:net(t,exit),hours:elapsed,
       entryTime:at,exitTime:b.time+300000};}
   if(hitTarget)return {id:t.id,reason:'TARGET',net:net(t,target),hours:elapsed,
     entryTime:at,exitTime:b.time+300000};
   highWaterR=Math.max(highWaterR,sign(t)*((t.direction==='LONG'?b.high:b.low)-entry)/risk);
   closes.push(b.close);if(closes.length>4)closes.shift();
   const currentR=sign(t)*(b.close-entry)/risk;
   const momentumR=closes.length>=4?sign(t)*(closes.at(-1)-closes[0])/risk:0;
   if(elapsed>=c.maxHours)pending='MAX_HOLD';
   else if(c.exitMode==='reversal'&&elapsed>=.75&&highWaterR>=.75&&
     currentR<=Math.max(.2,highWaterR-.4)&&momentumR<0)pending='REVERSAL';
   else if(c.exitMode==='stale'&&elapsed>=3&&net(t,b.close)<=0)pending='STALE_LOSS';
 }
 return null;
}
function resultMetrics(xs){
 const m=metrics(xs.map(x=>({...x,gross:x.net,fees:0,funding:0})),1000);
 return {n:xs.length,net:m.netProfit,winRate:m.winRate,profitFactor:m.profitFactor,
   expectancy:m.expectancy,maxClosedTradeDrawdown:m.maxDrawdown,
   meanHours:xs.length?xs.reduce((s,x)=>s+x.hours,0)/xs.length:null,
   medianHours:med(xs.map(x=>x.hours)),reasons:xs.reduce((o,x)=>(o[x.reason]=(o[x.reason]||0)+1,o),{})};
}
const rows=[];
for(const t of h.trades.filter(t=>!manual.has(t.id))){
 const file=path.join(root,'trade-bars',`${t.id}.json`);
 if(!fs.existsSync(file))throw Error(`MISSING_TRADE_BARS_${t.id}`);
 const bars=JSON.parse(fs.readFileSync(file)).bars,at=entryTime(t),
   near=bars.filter(b=>b.time+300000<=at).at(-1);
 if(!near||Math.abs(near.close/Number(t.entry_price)-1)>.10){
   rows.push({trade:t,skipped:'PRICE_TIME_MISMATCH'});continue;
 }
 rows.push({trade:t,bars});
}
const usable=rows.filter(x=>x.bars),n=usable.length;
const limits=[Math.floor(n*.6),Math.floor(n*.8)];
const segments={train:usable.slice(0,limits[0]),validation:usable.slice(limits[0],limits[1]),
  outOfSample:usable.slice(limits[1])};
const plan=[];
for(const stopMode of ['old',1,1.5,2.5])for(const targetR of [1.1,1.3,1.6,2])
 for(const maxHours of [3,6,12])for(const exitMode of ['fixed','reversal','stale'])
  plan.push({stopMode,targetR,maxHours,exitMode});
const evaluate=(data,c)=>{
 const trades=data.map(x=>replay(x.trade,x.bars,c));
 return trades.every(Boolean)?{...resultMetrics(trades),trades}:null;
};
const trials=plan.map(c=>({params:c,train:evaluate(segments.train,c)}));
const ranked=trials.filter(x=>x.train&&x.train.n>=25&&x.train.net>0&&
  x.train.profitFactor>1.2&&x.train.maxClosedTradeDrawdown<.15)
  .sort((a,b)=>b.train.net-a.train.net);
const shortlisted=ranked.slice(0,12);
for(const x of shortlisted)x.validation=evaluate(segments.validation,x.params);
const validated=shortlisted.filter(x=>x.validation&&x.validation.net>0&&
  x.validation.profitFactor>1&&x.validation.n>=10)
  .sort((a,b)=>b.validation.net-a.validation.net);
const frozen=validated[0]||trials.filter(x=>x.train).sort((a,b)=>b.train.net-a.train.net)[0];
if(!frozen.validation)frozen.validation=evaluate(segments.validation,frozen.params);
const oos=evaluate(segments.outOfSample,frozen.params);
const actual=data=>resultMetrics(data.map(x=>{
 const t=x.trade,at=entryTime(t),a=JSON.parse(fs.readFileSync(path.join(root,'research-accounting.json')))
   .find(y=>y.id===t.id);
 const gross=(t.direction==='LONG'?1:-1)*(Number(t.exit_price)-Number(t.entry_price))*Number(t.qty),
   estimated=gross-(Number(t.entry_price)+Number(t.exit_price))*Number(t.qty)*fee-
     Number(t.entry_price)*Number(t.qty)*fundingReserve;
 return {net:a?.accountingComplete?a.net:estimated,
   hours:(Date.parse(t.closed_at)-at)/3600000,reason:'RECORDED',entryTime:at,
   exitTime:Date.parse(t.closed_at)};
}));
const out={generatedAt:new Date().toISOString(),sample:{total:h.trades.length,bot:h.trades.length-manual.size,
  usable:n,skipped:rows.filter(x=>x.skipped).map(x=>({id:x.trade.id,reason:x.skipped})),
  train:segments.train.length,validation:segments.validation.length,
  outOfSample:segments.outOfSample.length},tested:trials.length,
  trainQualified:ranked.length,validationTested:shortlisted.length,
  validationQualified:validated.length,selected:frozen.params,
  status:validated.length&&oos?.net>0&&oos?.profitFactor>1?'EXIT_ONLY_CANDIDATE':'NO_ROBUST_EXIT',
  train:frozen.train&&{...frozen.train,trades:undefined},
  validation:frozen.validation&&{...frozen.validation,trades:undefined},
  outOfSample:oos&&{...oos,trades:undefined},
  recorded:{train:actual(segments.train),validation:actual(segments.validation),
    outOfSample:actual(segments.outOfSample)},
  allTraining:trials.map(x=>({params:x.params,train:x.train&&{...x.train,trades:undefined}})),
  limitations:['The last trades were previously inspected in the earlier 10-trade replay; this is not an untouched holdout.',
    'Recorded entries and quantities are reused, so selection, JEV and margin competition are not reproduced.',
    'Fees, slippage and funding reserve are assumed for hypothetical exits; real order-book fills are unavailable.']};
fs.writeFileSync(path.join(root,'all-exits-results.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({sample:out.sample,tested:out.tested,trainQualified:out.trainQualified,
  validationQualified:out.validationQualified,selected:out.selected,status:out.status,
  train:out.train,validation:out.validation,outOfSample:out.outOfSample,recorded:out.recorded},null,2));
