"use strict";
// Read-only exchange accounting; credentials stay inside the existing dashboard.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../.local/strategy-v2"),
  baseline = JSON.parse(fs.readFileSync(path.join(root, "baseline.json")));
const previous = fs.existsSync(path.join(root, "baseline-costs.json"))
  ? JSON.parse(fs.readFileSync(path.join(root, "baseline-costs.json")))
  : [];
const done = previous.filter((r) => !r.error);
const pending = baseline.trades.filter((t) => !done.some((r) => r.id === t.id));
const script = `const {BinanceFutures}=require('/app/position-guard/binance');const b=new BinanceFutures({apiKey:process.env.BINANCE_API_KEY,apiSecret:process.env.BINANCE_API_SECRET});let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{const rows=JSON.parse(input),out=[];for(const t of rows){const start=Date.parse(t.opened_at)-60000,end=Date.parse(t.closed_at)+999;try{await new Promise(r=>setTimeout(r,3500));if(end-start>7*86400000)throw Error('WINDOW_TOO_LONG');const fills=await b.request('GET','/fapi/v1/userTrades',{symbol:t.symbol,startTime:start,endTime:end,limit:1000});await new Promise(r=>setTimeout(r,3500));const funding=await b.request('GET','/fapi/v1/income',{symbol:t.symbol,incomeType:'FUNDING_FEE',startTime:start,endTime:end,limit:1000});out.push({id:t.id,fills,funding});}catch(e){out.push({id:t.id,error:e.message});if(/Too many requests|429|418/.test(e.message))break;}await new Promise(r=>setTimeout(r,3500));}console.log(JSON.stringify(out));});`;
const r = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    process.env.ATERUM_DASHBOARD_CONTAINER || "aterum-dashboard-1",
    "node",
    "-e",
    script,
  ],
  {
    input: JSON.stringify(pending),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600000,
  },
);
if (r.status !== 0) throw Error(r.stderr || "BASELINE_AUDIT_FAILED");
const out = [...done, ...JSON.parse(r.stdout)];
fs.writeFileSync(path.join(root, "baseline-costs.json"), JSON.stringify(out), {
  mode: 0o600,
});
console.log({
  trades: out.length,
  retrieved: out.filter((x) => !x.error).length,
  errors: [...new Set(out.filter((x) => x.error).map((x) => x.error))],
});
