"use strict";
// Read-only snapshot of trading outcomes and decision metadata. Never exports
// API credentials, chat content, execution payloads, or customer records.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const out = path.resolve(__dirname, '../../.local/strategy-v2/research-history.json');
const script = `const {db}=require('./shared');(async()=>{
 const [trades]=await db.query('SELECT t.id,t.symbol,t.direction,t.opened_at,t.entry_price,t.initial_sl_price,t.tp_price,t.qty,t.leverage,t.margin,t.market_order_id,t.rsi14,t.atr_pct,t.vol_ratio,t.funding_rate,t.final_score,t.scan_score,t.ai_regime,t.setup_label,c.closed_at,c.exit_price,c.pnl_usdt,c.close_reason FROM trades t JOIN trade_closes c ON c.trade_id=t.id ORDER BY t.opened_at');
 const [decisions]=await db.query('SELECT id,symbol,result,created_at FROM jev_decisions ORDER BY created_at');
 const [opportunities]=await db.query('SELECT symbol,direction,coarse_score,technical_score,final_score,rank_position,selected,primary_reason,evaluated_at FROM market_opportunities ORDER BY evaluated_at');
 console.log(JSON.stringify({capturedAt:new Date().toISOString(),trades,jevDecisions:decisions.map(d=>{let x;try{x=typeof d.result==='string'?JSON.parse(d.result):d.result}catch{x={}}return {id:d.id,symbol:d.symbol,createdAt:d.created_at,decision:x.decision,confidence:x.confidence??x.answer?.confidence,proposal:x.proposal,marketRegime:x.market_regime,reason:x.reason}}),opportunities}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());`;
const r=spawnSync('docker',['compose','exec','-T','dashboard','node','-e',script],
  {cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:64*1024*1024,timeout:30000});
if(r.status!==0) throw Error(`HISTORY_EXPORT_FAILED: ${r.stderr.slice(0,300)}`);
const parsed=JSON.parse(r.stdout);
fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
fs.writeFileSync(out,JSON.stringify(parsed),{mode:0o600});
console.log(JSON.stringify({file:out,trades:parsed.trades.length,jevDecisions:parsed.jevDecisions.length,
  opportunities:parsed.opportunities.length}));
