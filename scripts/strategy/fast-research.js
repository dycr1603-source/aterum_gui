"use strict";
// Offline, deterministic experiment. No live orders, JEV requests or DB writes.
const fs=require('node:fs');
const path=require('node:path');
const {prepare,run}=require('../../services/strategy/backtest');
const {pairs}=require('../../services/strategy/indicators');
const {contentHash}=require('./download');
const basePolicy=require('../../config/strategy-v2.json');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const commonEnd=Date.parse('2026-10-01T00:00:00Z');
const commonStart=commonEnd-90*86400000;
const frames=process.env.FAST_TIMEFRAMES?.split(',')||['1h','15m','5m'];
const cut=n=>commonStart+n*86400000;
const splits={train:[commonStart,cut(54)],validation:[cut(54),cut(72)],outOfSample:[cut(72),commonEnd]};
const policy={...basePolicy,initialCapital:1000,maxPositions:3,maxDrawdown:.15,
  maxPortfolioRisk:.44,riskFraction:.22,feeRate:.001,slippageBps:5,
  spreadBps:2,fundingReserve:.001,minQuoteVolume:5e6,maxHoldingBars:24,latencyBars:1};
const plan=[];
for(const timeframe of frames)
 for(const minVotes of [5,6])
 for(const stopAtr of [1.25,1.75])
 for(const targetR of [1.3,1.8])
 for(const maxHours of [3,6])
 for(const management of ['fixed','existing'])
  plan.push({timeframe,entryMode:'consensus10',minVotes,stopAtr,targetR,maxHours,management,
    fast:{minVotes,stopAtr,targetR,maxHours,structureBars:6,minNetR:1.1,
      reversal:management==='existing'?.75:0,earlyLoss:false,staleHours:0}});
for(const timeframe of frames)
 for(const rule of ['TREND','BREAKOUT','PULLBACK','REVERSAL','EMA_RSI','MACD_RSI'])
 for(const stopAtr of [1.25,1.75])
 for(const targetR of [1.3,1.8])
 for(const maxHours of [3,6])
  plan.push({timeframe,entryMode:'rule',rule,stopAtr,targetR,maxHours,management:'existing',
    fast:{rule,stopAtr,targetR,maxHours,structureBars:6,minNetR:1.1,
      reversal:.75,earlyLoss:false,staleHours:0}});
for(const timeframe of frames.filter(x=>x!=='5m'))
 for(const pair of pairs())
  plan.push({timeframe,entryMode:'pair',pair,stopAtr:1.5,targetR:1.5,maxHours:6,
    management:'existing',fast:{stopAtr:1.5,targetR:1.5,maxHours:6,
      structureBars:6,minNetR:1.1,reversal:.75,earlyLoss:false,staleHours:0}});
for(const timeframe of frames)
 for(const entry of ['CONSENSUS5','CONSENSUS6','TREND','BREAKOUT','REVERSAL'])
 for(const stopAtr of [2,3])
 for(const targetR of [1.3,2])
 for(const maxHours of [6,12]){
   const minVotes=entry==='CONSENSUS6'?6:5;
   const rule=entry.startsWith('CONSENSUS')?null:entry;
   plan.push({timeframe,entryMode:rule?'rule':'consensus10',
     ...(rule?{rule}:{minVotes}),stopAtr,targetR,maxHours,management:'existing',
     fast:{...(rule?{rule}:{minVotes}),stopAtr,targetR,maxHours,structureBars:6,
       minNetR:1.1,reversal:.75,earlyLoss:false,staleHours:0}});
 }
for(const timeframe of frames)
 for(const leverage of [8,10])
 for(const minVotes of [5,6])
 for(const stopAtr of [1.25,1.75])
 for(const targetR of [1.3,1.8])
  plan.push({timeframe,entryMode:'consensus10',minVotes,stopAtr,targetR,
    maxHours:6,management:'existing',leverage,
    fast:{minVotes,stopAtr,targetR,maxHours:6,structureBars:6,minNetR:1.1,
      reversal:.75,earlyLoss:false,staleHours:0}});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'fast-manifest.json')));
if(manifest.rejected?.length) throw Error('FAST_HISTORY_INCOMPLETE');
function load(tf){
 const entries=manifest.datasets.filter(x=>x.timeframe===tf);
 if(entries.length!==8)throw Error(`INCOMPLETE_${tf}`);
 return entries.map(x=>{const d=JSON.parse(fs.readFileSync(path.join(root,x.file)));
   if(d.contentHash!==contentHash(d))throw Error(`CHECKSUM_${x.symbol}_${tf}`);
   return prepare(d,.8,{adxThreshold:22,bollingerSigma:1.8});});
}
function loadHourly(){
 const main=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 const entries=main.datasets.filter(x=>x.purpose==='research'&&x.timeframe==='1h');
 return entries.map(x=>{const d=JSON.parse(fs.readFileSync(path.join(root,x.file)));
   if(d.contentHash!==contentHash(d))throw Error(`CHECKSUM_${x.symbol}_1h`);
   return prepare(d,.8,{adxThreshold:22,bollingerSigma:1.8});});
}
function execute(data,c,range,extra={}){
 return run(data,{policy:{...policy,...extra},start:range[0],end:range[1],
   entryMode:c.entryMode||'consensus10',pair:c.pair,
   directions:['LONG','SHORT'],management:c.management,
   fast:c.fast,leverage:c.leverage||5,maxMarginFractionPerPosition:.35});
}
function summary(r){
 const t=r.trades;
 const hours=t.map(x=>(x.exitTime-x.entryTime)/3600000);
 return {...r.metrics,meanHours:hours.length?hours.reduce((s,x)=>s+x,0)/hours.length:null,
   medianHours:hours.length?[...hours].sort((a,b)=>a-b)[Math.floor(hours.length/2)]:null,
   symbols:new Set(t.map(x=>x.symbol)).size,sides:{LONG:t.filter(x=>x.side==='LONG').length,
     SHORT:t.filter(x=>x.side==='SHORT').length},halted:r.halted,skipped:r.skipped};
}
const good=m=>m.trades>=25&&m.netProfit>0&&m.profitFactor>1&&m.maxDrawdown<.15&&
  m.symbols>=3&&!m.halted;
const rank=m=>m.netProfit/(1+10*m.maxDrawdown) + m.expectancy*5;
(async()=>{
 const records=[];
 for(const tf of frames){
   const data=tf==='1h'?loadHourly():load(tf);
   console.log('DATA',tf,data.length,data[0].bars.length);
   for(const c of plan.filter(x=>x.timeframe===tf)){
     const m=summary(execute(data,c,splits.train));
     records.push({params:{timeframe:c.timeframe,entryMode:c.entryMode,
       ...(c.minVotes?{minVotes:c.minVotes}:{}),...(c.rule?{rule:c.rule}:{}),
       ...(c.pair?{pair:c.pair}:{}),stopAtr:c.stopAtr,targetR:c.targetR,
       maxHours:c.maxHours,management:c.management,
       ...(c.leverage?{leverage:c.leverage}:{})},train:m});
   }
   console.log('TRAIN_DONE',tf,records.length);
 }
 const candidates=records.filter(x=>good(x.train)).sort((a,b)=>rank(b.train)-rank(a.train));
 const shortlisted=candidates.slice(0,12);
 for(const tf of frames){
   const group=shortlisted.filter(x=>x.params.timeframe===tf);
   if(!group.length)continue;
   const data=tf==='1h'?loadHourly():load(tf);
   for(const x of group){
     const c=plan.find(c=>Object.entries(x.params).every(([k,v])=>
       Array.isArray(v)?JSON.stringify(c[k])===JSON.stringify(v):c[k]===v));
     x.validation=summary(execute(data,c,splits.validation));
   }
 }
 const validated=shortlisted.filter(x=>x.validation&&x.validation.trades>=8&&
   x.validation.netProfit>0&&x.validation.profitFactor>1&&
   x.validation.maxDrawdown<.15&&!x.validation.halted)
   .sort((a,b)=>rank(b.validation)-rank(a.validation));
 const frozen=validated[0]||shortlisted[0]||records.filter(x=>x.train.trades>=25)
   .sort((a,b)=>rank(b.train)-rank(a.train))[0]||null;
 const frozenReason=validated.length?'VALIDATION_QUALIFIED':'TRAIN_DIAGNOSTIC_ONLY';
 let oos=null,stress=null,baseline=null,fastCurrent=null,walkForward=[];
 if(frozen){
   const data=frozen.params.timeframe==='1h'?loadHourly():load(frozen.params.timeframe);
   const c=plan.find(c=>Object.entries(frozen.params).every(([k,v])=>
     Array.isArray(v)?JSON.stringify(c[k])===JSON.stringify(v):c[k]===v));
   if(!frozen.validation)frozen.validation=summary(execute(data,c,splits.validation));
   oos=summary(execute(data,c,splits.outOfSample));
   stress=summary(execute(data,c,splits.outOfSample,{feeRate:.0015,slippageBps:10,spreadBps:4}));
   for(const [start,end] of [[0,18],[18,36],[36,54],[54,72]])
     walkForward.push({range:[cut(start),cut(end)],metrics:summary(execute(data,c,[cut(start),cut(end)]))});
   baseline=summary(execute(data,{management:'existing',fast:null},splits.outOfSample));
   fastCurrent=summary(execute(data,{management:'existing',fast:{minVotes:5,
     stopAtr:1.5,targetR:1.55,maxHours:6,structureBars:6,minNetR:1.1,
     reversal:.75,earlyLoss:true,staleHours:3}},splits.outOfSample));
 }
 const oneMinute=[];
 if(manifest.datasets.filter(x=>x.timeframe==='1m').length===8){
   const data=load('1m');
   const oneStart=commonEnd-14*86400000;
   const periods={train:[oneStart,oneStart+8*86400000],
     validation:[oneStart+8*86400000,oneStart+11*86400000],
     outOfSample:[oneStart+11*86400000,commonEnd]};
   for(const minVotes of [5,6])for(const maxHours of [1,3]){
     const c={management:'fixed',fast:{minVotes,stopAtr:1.5,targetR:1.5,
       maxHours,structureBars:6,minNetR:1.1}};
     oneMinute.push({minVotes,maxHours,train:summary(execute(data,c,periods.train)),
       validation:summary(execute(data,c,periods.validation)),
       outOfSample:summary(execute(data,c,periods.outOfSample))});
   }
 }
 const h=JSON.parse(fs.readFileSync(path.join(root,'research-history.json')));
 const out={schema:1,generatedAt:new Date().toISOString(),splits,universe:manifest.universe,
   assumptions:{feePerSide:.001,slippageBps:5,spreadBps:2,
     spreadMethod:'1 bps half-spread charged on each execution leg; historical spread is unavailable',
     funding:'historical funding events',
     initialCapital:1000,maxPositions:3,maxMarginFraction:.9,maxMarginPerPosition:.35,
     leverage:5,latencyBars:1,liquidation:'maintenance margin and stop-risk guard',
     entry:'closed-candle consensus; JEV historical decisions not regenerated',
     selectedBy:'train then validation; OOS evaluated once only after freeze'},
   counts:{recordedTrades:h.trades.length,eligibleRecordedTrades:h.trades.filter(t=>t.id!==5&&t.id!==6).length,
     jevDecisions:h.jevDecisions.length,opportunities:h.opportunities.length,
     tested:records.length,trainQualified:candidates.length,validationTested:shortlisted.length,
     validationQualified:validated.length},
   allTraining:records,shortlisted,selected:frozen?.params||null,frozenReason,
   selectedTrain:frozen?.train||null,selectedValidation:frozen?.validation||null,
   outOfSample:oos,stressedOutOfSample:stress,baselineOutOfSample:baseline,
   fastCurrentOutOfSample:fastCurrent,fixedCandidatePeriods:walkForward,
   oneMinuteExploratory:oneMinute,
   status:validated.length&&frozen&&oos?.netProfit>0&&oos?.profitFactor>1&&stress?.netProfit>0&&
     walkForward.every(x=>x.metrics.netProfit>0)&&oos.trades>=20?'TECHNICAL_CANDIDATE':'NO_ROBUST_CONFIGURATION'};
 const file=path.join(root,'fast-research-results.json');
 fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({file,counts:out.counts,selected:out.selected,frozenReason,
   train:out.selectedTrain,validation:out.selectedValidation,oos,stress,baseline,
   fastCurrent,status:out.status},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
