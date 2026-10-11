"use strict";
const fs=require('node:fs');
const path=require('node:path');
const {dataset,contentHash}=require('./download');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const end=Date.parse('2026-10-01T00:00:00Z');
const symbols=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT'];
const windows=[['15m',180],['5m',90],['1m',14]];
const manifest={schema:1,generatedAt:new Date().toISOString(),end,
  universe:'Eight predefined liquid assets used by the original research manifest; not selected by future returns',datasets:[],rejected:[]};
(async()=>{
 for(const [timeframe,days] of windows) for(const symbol of symbols){
   const start=end-days*86400000;
   try{
     const d=await dataset(symbol,timeframe,start,end);
     if(d.contentHash!==contentHash(d)) throw Error('HISTORY_CHECKSUM_MISMATCH');
     manifest.datasets.push({symbol,timeframe,start,end,days,bars:d.bars.length,
       file:path.relative(root,d.file),contentHash:d.contentHash});
     console.log('OK',timeframe,symbol,d.bars.length);
   }catch(error){
     manifest.rejected.push({symbol,timeframe,start,end,reason:error.message});
     console.error('REJECTED',timeframe,symbol,error.message);
   }
   fs.writeFileSync(path.join(root,'fast-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 }
 if(manifest.rejected.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
