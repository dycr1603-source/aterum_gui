"use strict";
// Public market data only. One 5m window per recorded entry, stored locally.
const fs=require('node:fs');
const path=require('node:path');
const h=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../.local/strategy-v2/research-history.json')));
const root=path.resolve(__dirname,'../../.local/strategy-v2/trade-bars');
fs.mkdirSync(root,{recursive:true,mode:0o700});
const rows=h.trades.filter(t=>![5,6].includes(t.id));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(t){
 const file=path.join(root,`${t.id}.json`);
 if(fs.existsSync(file))return {id:t.id,ok:true,cached:true};
 const entry=Date.parse(t.opened_at),start=Math.floor(entry/300000)*300000-2*3600000,
   end=entry+13*3600000;
 const url=new URL('https://fapi.binance.com/fapi/v1/klines');
 for(const [k,v] of Object.entries({symbol:t.symbol,interval:'5m',startTime:start,endTime:end,limit:1000}))
   url.searchParams.set(k,String(v));
 for(let attempt=0;attempt<4;attempt++){
   try{
     const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
     if(r.status===429||r.status>=500){await wait(1000*(attempt+1));continue;}
     if(!r.ok)throw Error(`HTTP_${r.status}`);
     const raw=await r.json();
     const bars=raw.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),
       low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])}));
     if(bars.length<50||bars.some((b,i)=>i&&b.time-bars[i-1].time!==300000))
       throw Error('INCOMPLETE_FIVE_MINUTE_HISTORY');
     fs.writeFileSync(file,JSON.stringify({id:t.id,symbol:t.symbol,entry,bars}),{mode:0o600,flag:'wx'});
     return {id:t.id,ok:true,bars:bars.length};
   }catch(error){if(attempt===3)return {id:t.id,ok:false,error:error.message};
     await wait(1000*(attempt+1));}
 }
 return {id:t.id,ok:false,error:'RETRIES_EXHAUSTED'};
}
(async()=>{
 const results=[];
 for(let i=0;i<rows.length;i+=4){
   results.push(...await Promise.all(rows.slice(i,i+4).map(get)));
   await wait(250);
   console.log('downloaded',Math.min(i+4,rows.length),'of',rows.length);
 }
 console.log(JSON.stringify({complete:results.filter(x=>x.ok).length,
   failed:results.filter(x=>!x.ok)}));
 if(results.some(x=>!x.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
