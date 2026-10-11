"use strict";
// Read-only Binance fill and funding audit. Credentials remain inside dashboard.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {account}=require('../../services/strategy/feedback');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const history=JSON.parse(fs.readFileSync(path.join(root,'research-history.json')));
const prior=JSON.parse(fs.readFileSync(path.join(root,'baseline-costs.json')));
const outFile=path.join(root,'research-history-costs.json');
const cache=fs.existsSync(outFile)?JSON.parse(fs.readFileSync(outFile)):prior;
const pending=history.trades.filter(t=>{
 const x=cache.find(x=>x.id===t.id);
 return !x||x.error||(t.id>52&&t.market_order_id&&
   !x.fills?.some(f=>String(f.orderId)===String(t.market_order_id)));
});
if(pending.length){
 const script=`const {BinanceFutures}=require('./position-guard/binance');
 const b=new BinanceFutures({apiKey:process.env.BINANCE_API_KEY,apiSecret:process.env.BINANCE_API_SECRET});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));let s='';
 process.stdin.on('data',x=>s+=x);process.stdin.on('end',async()=>{
 const out=[];for(const t of JSON.parse(s)){
   const start=Date.parse(t.opened_at)-600000,end=Date.parse(t.closed_at)+999;
   try{await wait(3000);if(end-start>7*86400000)throw Error('WINDOW_TOO_LONG');
     const fills=await b.request('GET','/fapi/v1/userTrades',{symbol:t.symbol,startTime:start,endTime:end,limit:1000});
     await wait(3000);
     const funding=await b.request('GET','/fapi/v1/income',{symbol:t.symbol,incomeType:'FUNDING_FEE',startTime:start,endTime:end,limit:1000});
     out.push({id:t.id,fills,funding});
   }catch(e){out.push({id:t.id,error:e.message});if(/Too many requests|429|418/.test(e.message))break;}
   await wait(3000);
 }console.log(JSON.stringify(out));});`;
 const r=spawnSync('docker',['compose','exec','-T','dashboard','node','-e',script],{
   cwd:path.resolve(__dirname,'../..'),input:JSON.stringify(pending),encoding:'utf8',
   maxBuffer:64*1024*1024,timeout:600000});
 if(r.status!==0)throw Error(`EXCHANGE_AUDIT_FAILED: ${r.stderr.slice(0,250)}`);
 const fetched=JSON.parse(r.stdout);
 const merged=new Map(cache.map(x=>[x.id,x]));
 for(const x of fetched)merged.set(x.id,x);
 fs.writeFileSync(outFile,JSON.stringify([...merged.values()]),{mode:0o600});
}
const costs=JSON.parse(fs.readFileSync(outFile));
const records=history.trades.map(t=>{
 const raw=costs.find(x=>x.id===t.id);
 if(!raw||raw.error)return {id:t.id,accountingComplete:false,reason:raw?.error||'NO_EXCHANGE_DATA'};
 const entry=Date.parse(t.opened_at),exit=Date.parse(t.closed_at);
 const hedged=history.trades.some(x=>x.id!==t.id&&x.symbol===t.symbol&&
   x.direction!==t.direction&&Date.parse(x.opened_at)<exit&&Date.parse(x.closed_at)>entry);
 const linked=raw.fills.filter(f=>String(f.orderId)===String(t.market_order_id)&&
   f.positionSide===t.direction&&f.side===(t.direction==='LONG'?'BUY':'SELL'));
 const verifiedQty=linked.reduce((sum,f)=>sum+Number(f.qty),0);
 return {id:t.id,...account({fills:raw.fills,funding:raw.funding,side:t.direction,
   quantity:verifiedQty>0?verifiedQty:Number(t.qty),entryTime:entry-600000,exitTime:exit+999,
   entryOrderId:t.market_order_id,hedged})};
});
fs.writeFileSync(path.join(root,'research-accounting.json'),JSON.stringify(records,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({total:records.length,complete:records.filter(x=>x.accountingComplete).length,
  netVerified:records.filter(x=>x.accountingComplete).reduce((s,x)=>s+x.net,0),
  incompleteIds:records.filter(x=>!x.accountingComplete).map(x=>x.id)}));
