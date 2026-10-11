'use strict';
// Read-only diagnostic. Run inside the dashboard container with:
// docker compose exec -T dashboard node - < scripts/strategy/replay-recent-fast-exits.js
const { db } = require('./shared');
const fee = 0.001, slip = 0.0005, fundingReserve = 0.001;
const sign = side => side === 'LONG' ? 1 : -1;
const median = xs => { const a = [...xs].sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : null; };
const net = (row, exit, adverseSlip = false) => {
  const price = adverseSlip ? exit * (1 - sign(row.direction) * slip) : exit;
  return sign(row.direction) * (price - row.entry) * row.qty -
    (row.entry + price) * row.qty * fee - row.entry * row.qty * fundingReserve;
};
async function barsAround(row) {
  const start = Math.floor(row.entryTime / 300000) * 300000 - 2 * 3600000;
  const end = row.entryTime + 12 * 3600000;
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(row.symbol)}`+
    `&interval=5m&startTime=${start}&endTime=${end}&limit=1000`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Binance ${response.status}: ${row.symbol}`);
  const raw = await response.json();
  return raw.map(k=>({time:Number(k[0]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}));
}
function shortStop(row, before) {
  if (before.length < 20) return null;
  const candles = before.slice(-20);
  const ranges = candles.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-candles[i].close),Math.abs(b.low-candles[i].close)));
  const atr = ranges.slice(-14).reduce((s,x)=>s+x,0)/14;
  const swing = row.direction === 'LONG'
    ? Math.min(...before.slice(-6).map(b=>b.low))
    : Math.max(...before.slice(-6).map(b=>b.high));
  const stop = row.direction === 'LONG'
    ? Math.min(swing-atr*.25,row.entry-atr*1.5)
    : Math.max(swing+atr*.25,row.entry+atr*1.5);
  return stop>0 ? stop : null;
}
function replay(row, bars, targetR, maxHours=6, early=true) {
  const risk = Math.abs(row.entry - row.stop);
  const target = row.entry + sign(row.direction) * Math.max(risk * targetR,
    risk * 1.1 + row.entry * (2 * (fee + slip) + fundingReserve) * 2.1);
  const closes = [];
  let highWaterR = 0;
  for (const b of bars) {
    const hours = (b.time + 300000 - row.entryTime) / 3600000;
    const stopHit = row.direction === 'LONG' ? b.low <= row.stop : b.high >= row.stop;
    const targetHit = row.direction === 'LONG' ? b.high >= target : b.low <= target;
    // When both levels occur inside one candle, the stop wins.
    if (stopHit) return {reason:'SL',minutes:hours*60,net:net(row,row.stop,true)};
    if (targetHit) return {reason:'TP',minutes:hours*60,net:net(row,target,true)};
    const favorable = row.direction === 'LONG' ? b.high : b.low;
    highWaterR = Math.max(highWaterR,sign(row.direction)*(favorable-row.entry)/risk);
    closes.push(b.close);
    const currentR = sign(row.direction) * (b.close - row.entry) / risk;
    const momentumR = closes.length >= 4 ? sign(row.direction) * (closes.at(-1) - closes.at(-4)) / risk : 0;
    const currentNetPerUnit = net({...row,qty:1},b.close,false);
    const reversal = hours >= .75 && highWaterR >= .75 &&
      currentR <= Math.max(.2,highWaterR-.4) && momentumR < 0;
    const earlyLoss = hours >= 1.5 && currentR <= -.35 && momentumR <= -.1;
    const staleLoss = hours >= 3 && currentNetPerUnit <= 0;
    if (reversal || (early && earlyLoss) || (early && staleLoss) || hours >= maxHours)
      return {reason:reversal?'REVERSAL':earlyLoss?'EARLY_LOSS':staleLoss?'STALE_LOSS':'MAX_HOLD',
        minutes:hours*60,net:net(row,b.close,true)};
  }
  return null;
}
(async()=>{
  const [raw] = await db.query(`SELECT t.id,t.symbol,t.direction,t.opened_at,t.entry_price,t.initial_sl_price,t.qty,
    tc.closed_at,tc.exit_price,tc.pnl_usdt
    FROM trades t JOIN trade_closes tc ON tc.trade_id=t.id
    WHERE t.opened_at >= '2026-10-05' AND t.initial_sl_price IS NOT NULL
      AND tc.exit_price IS NOT NULL AND t.qty > 0
    ORDER BY t.opened_at`);
  const rows=[];
  for (const t of raw) {
    const row={id:t.id,symbol:t.symbol,direction:t.direction,entry:Number(t.entry_price),
      stop:Number(t.initial_sl_price),qty:Number(t.qty),entryTime:new Date(t.opened_at).getTime(),
      actualMinutes:(new Date(t.closed_at)-new Date(t.opened_at))/60000,
      oldNet:Number(t.pnl_usdt)-(Number(t.entry_price)+Number(t.exit_price))*Number(t.qty)*fee-
        Number(t.entry_price)*Number(t.qty)*fundingReserve};
    if (!(row.entry>0&&row.stop>0&&row.qty>0&&row.actualMinutes>=5)) continue;
    try {
      const around=await barsAround(row);
      const before=around.filter(b=>b.time+300000<=row.entryTime);
      const bars=around.filter(b=>b.time>=Math.ceil(row.entryTime/300000)*300000);
      if (!bars.length || Math.abs(bars[0].close/row.entry-1)>.10) {
        rows.push({id:row.id,symbol:row.symbol,skipped:'PRICE_TIME_MISMATCH'});continue;
      }
      const newStop=shortStop(row,before);
      if (!newStop) { rows.push({id:row.id,symbol:row.symbol,skipped:'NO_SHORT_TERM_STOP'});continue; }
      const fast={...row,stop:newStop};
      rows.push({id:row.id,symbol:row.symbol,actualMinutes:Math.round(row.actualMinutes),oldNet:row.oldNet,
        oldStop:row.stop,newStop,
        scenarios:{oldLevelsFast:replay(row,bars,1.55),
          shortFast:replay(fast,bars,1.55),shortSixHour:replay(fast,bars,1.55,6,false),
          shortTwelveHour:replay(fast,bars,1.55,12,false)}});
    } catch(error) { rows.push({id:row.id,symbol:row.symbol,skipped:error.message}); }
  }
  const complete=rows.filter(r=>r.scenarios&&Object.values(r.scenarios).every(Boolean));
  const oldNet=complete.reduce((s,r)=>s+r.oldNet,0);
  const summary={sample:complete.length,skipped:rows.length-complete.length,
    old:{net:oldNet,winRate:complete.filter(r=>r.oldNet>0).length/Math.max(1,complete.length),
      medianMinutes:median(complete.map(r=>r.actualMinutes))},
    scenarios:Object.fromEntries(['oldLevelsFast','shortFast','shortSixHour','shortTwelveHour'].map(k=>{
      const xs=complete.map(r=>r.scenarios[k]);
      return [k,{net:xs.reduce((s,x)=>s+x.net,0),winRate:xs.filter(x=>x.net>0).length/Math.max(1,xs.length),
        medianMinutes:median(xs.map(x=>x.minutes)),reasons:xs.reduce((o,x)=>(o[x.reason]=(o[x.reason]||0)+1,o),{})}];
    }))};
  console.log(JSON.stringify({summary,rows},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.end());
