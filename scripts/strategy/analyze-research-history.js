"use strict";
const fs=require('node:fs');
const path=require('node:path');
const {metrics}=require('../../services/strategy/metrics');
const root=path.resolve(__dirname,'../../.local/strategy-v2');
const h=JSON.parse(fs.readFileSync(path.join(root,'research-history.json')));
const accounting=JSON.parse(fs.readFileSync(path.join(root,'research-accounting.json')));
const manualAnomalies=h.trades.filter(t=>t.pnl_usdt==0&&
  Math.abs((t.direction==='LONG'?1:-1)*(Number(t.exit_price)-Number(t.entry_price))*Number(t.qty))>1&&
  !t.market_order_id).map(t=>t.id);
const recorded=h.trades.filter(t=>!manualAnomalies.includes(t.id));
function days(t){return (Date.parse(t.closed_at)-Date.parse(t.opened_at))/86400000;}
function auditRow(t){
  const a=accounting.find(x=>x.id===t.id),entry=Number(t.entry_price),exit=Number(t.exit_price),qty=Number(t.qty);
  const implied=(t.direction==='LONG'?1:-1)*(exit-entry)*qty;
  const estimated=implied-(entry+exit)*qty*.001-entry*qty*.001;
  const opened=Date.parse(t.opened_at);
  const jev=h.jevDecisions.filter(x=>x.symbol===t.symbol&&x.decision===t.direction&&
    Date.parse(x.createdAt)<=opened&&opened-Date.parse(x.createdAt)<=15*60000).at(-1);
  return {...t,exact:a?.accountingComplete===true,net:a?.accountingComplete?a.net:estimated,
    estimatedNet:estimated,verifiedNet:a?.accountingComplete?a.net:null,
    fees:a?.accountingComplete?a.fees:null,funding:a?.accountingComplete?a.funding:null,
    durationHours:days(t)*24,matchedJev:!!jev,jevConfidence:jev?.confidence??null};
}
const rows=recorded.map(auditRow);
const exact=rows.filter(x=>x.exact);
const toMetric=a=>metrics(a.map(t=>({net:t.net,gross:Number(t.pnl_usdt),
  fees:t.fees??0,funding:t.funding??0,entryTime:Date.parse(t.opened_at),
  exitTime:Date.parse(t.closed_at)})),1000);
const summary=a=>{
  const m=toMetric(a),hours=a.map(x=>x.durationHours);
  return {n:a.length,net:m.netProfit,winRate:m.winRate,profitFactor:m.profitFactor,
    expectancy:m.expectancy,maxClosedTradeDrawdown:m.maxDrawdown,
    meanHours:hours.length?hours.reduce((s,x)=>s+x,0)/hours.length:null,
    medianHours:hours.length?[...hours].sort((x,y)=>x-y)[Math.floor(hours.length/2)]:null,
    feeTotal:a.filter(x=>x.exact).reduce((s,x)=>s+x.fees,0),
    fundingTotal:a.filter(x=>x.exact).reduce((s,x)=>s+x.funding,0)};
};
const cut1=Math.floor(rows.length*.6),cut2=Math.floor(rows.length*.8);
const partitions={train:rows.slice(0,cut1),validation:rows.slice(cut1,cut2),
  outOfSample:rows.slice(cut2)};
const by=(key)=>Object.fromEntries([...new Set(rows.map(key))].sort().map(v=>[v,summary(rows.filter(x=>key(x)===v))]));
const report={capturedAt:h.capturedAt,totalRecorded:h.trades.length,
  manualAnomalies,botTrades:rows.length,exactTrades:exact.length,
  estimatedTrades:rows.length-exact.length,range:[rows[0].opened_at,rows.at(-1).closed_at],
  exact:summary(exact),allEstimatedWhereMissing:summary(rows),
  partitions:Object.fromEntries(Object.entries(partitions).map(([k,v])=>[k,{
    range:[v[0]?.opened_at,v.at(-1)?.closed_at],all:summary(v),exact:summary(v.filter(x=>x.exact))}])),
  groups:{side:by(x=>x.direction),regime:by(x=>x.ai_regime||'UNKNOWN'),
    leverage:by(x=>x.leverage||'UNKNOWN'),
    duration:by(x=>x.durationHours<1?'<1h':x.durationHours<6?'1-6h':x.durationHours<12?'6-12h':'>=12h'),
    jevConfidence:by(x=>x.jevConfidence==null?'UNMATCHED':x.jevConfidence<.6?'<0.6':x.jevConfidence<.8?'0.6-0.8':'>=0.8')},
  coverage:{matchedJev:rows.filter(x=>x.matchedJev).length,
    withTechnicalFeatures:rows.filter(x=>x.final_score!=null&&x.vol_ratio!=null).length},
  limitations:['Verified net covers only complete Binance fill and funding attribution.',
    'Estimated net for remaining trades assumes 0.1% fee per side plus 0.1% funding reserve; it is not an actual account result.',
    'Closed-trade drawdown omits intratrade equity fluctuations.',
    'JEV and feature groups are observational and too small to establish predictive value.']};
fs.writeFileSync(path.join(root,'research-history-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
