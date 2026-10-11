"use strict";
// Expanding selection folds using only data preceding each test window.
const fs=require('node:fs');
const path=require('node:path');
const {prepare,run}=require('../../services/strategy/backtest');
const {contentHash}=require('./download');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const research=JSON.parse(fs.readFileSync(path.join(root,'fast-research-results.json')));
const p=require('../../config/strategy-v2.json');
const policy={...p,initialCapital:1000,maxPositions:3,maxDrawdown:.15,
  maxPortfolioRisk:.44,riskFraction:.22,feeRate:.001,slippageBps:5,
  spreadBps:2,fundingReserve:.001,minQuoteVolume:5e6,maxHoldingBars:24,latencyBars:1};
const start=Date.parse('2026-07-03T00:00:00Z'),day=86400000;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'fast-manifest.json')));
const main=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
function dataFor(tf){
 const entries=tf==='1h'?main.datasets.filter(x=>x.purpose==='research'&&x.timeframe==='1h'):
   manifest.datasets.filter(x=>x.timeframe===tf);
 if(entries.length!==8)throw Error(`INCOMPLETE_${tf}`);
 return entries.map(x=>{const d=JSON.parse(fs.readFileSync(path.join(root,x.file)));
   if(d.contentHash!==contentHash(d))throw Error(`CHECKSUM_${x.symbol}`);
   return prepare(d,.8,{adxThreshold:22,bollingerSigma:1.8});});
}
function evaluate(data,params,range){
 const fast={...(params.rule?{rule:params.rule}:params.minVotes?{minVotes:params.minVotes}:{}),
   stopAtr:params.stopAtr,targetR:params.targetR,maxHours:params.maxHours,
   structureBars:6,minNetR:1.1,reversal:params.management==='existing'?.75:0,
   earlyLoss:false,staleHours:0};
 const r=run(data,{policy,start:range[0],end:range[1],
   entryMode:params.entryMode,pair:params.pair,directions:['LONG','SHORT'],
   management:params.management,fast,leverage:params.leverage||5,
   maxMarginFractionPerPosition:.35});
 const hours=r.trades.map(t=>(t.exitTime-t.entryTime)/3600000);
 return {...r.metrics,symbols:new Set(r.trades.map(t=>t.symbol)).size,
   meanHours:hours.length?hours.reduce((s,x)=>s+x,0)/hours.length:null,
   halted:r.halted};
}
const eligible=m=>m.trades>=20&&m.netProfit>0&&m.profitFactor>1.1&&
  m.maxDrawdown<.15&&m.symbols>=3&&!m.halted;
const score=m=>m.netProfit/(1+10*m.maxDrawdown)+5*m.expectancy;
const params=research.allTraining.map(x=>x.params);
const folds=[];let trainRuns=0,testRuns=0;
for(const [trainDays,testDays] of [[36,[36,54]],[54,[54,72]]]){
 const trainRange=[start,start+trainDays*day],
   testRange=[start+testDays[0]*day,start+testDays[1]*day];
 const ranked=[];
 for(const tf of ['1h','15m','5m']){
   const data=dataFor(tf);
   const group=params.filter(x=>x.timeframe===tf);
   for(const x of group){
     const actual=trainDays===54?research.allTraining[params.indexOf(x)].train:
       evaluate(data,x,trainRange);
     if(trainDays!==54)trainRuns++;
     if(actual.trades>=20)ranked.push({params:x,train:actual});
   }
 }
 ranked.sort((a,b)=>score(b.train)-score(a.train));
 const qualified=ranked.filter(x=>eligible(x.train));
 const chosen=qualified[0]||ranked[0]||null;
 let tested=null;
 if(chosen){tested=evaluate(dataFor(chosen.params.timeframe),chosen.params,testRange);testRuns++;}
 folds.push({trainRange,testRange,trainEligible:qualified.length,
   selected:chosen?.params||null,train:chosen?.train||null,test:tested,
   reason:qualified.length?'TRAIN_QUALIFIED':chosen?'DIAGNOSTIC_ONLY':'NO_TRAIN_SAMPLE'});
 console.log('FOLD',trainDays,'eligible',qualified.length,
   'selected',chosen?.params?.timeframe||'none','test',tested?.netProfit??null);
}
const out={generatedAt:new Date().toISOString(),candidateCount:params.length,
  trainRuns,testRuns,folds,positive:folds.every(f=>f.reason==='TRAIN_QUALIFIED'&&
    f.test&&f.test.netProfit>0&&
    f.test.profitFactor>1&&f.test.maxDrawdown<.15)};
fs.writeFileSync(path.join(root,'fast-walk-forward.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({candidateCount:out.candidateCount,trainRuns,testRuns,
  folds:folds.map(f=>({trainRange:f.trainRange,testRange:f.testRange,
    trainEligible:f.trainEligible,selected:f.selected,test:f.test&&{
      trades:f.test.trades,net:f.test.netProfit,pf:f.test.profitFactor,
      dd:f.test.maxDrawdown}})),positive:out.positive},null,2));
