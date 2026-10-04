"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../.local/strategy-v2"),
  baseline = JSON.parse(fs.readFileSync(path.join(root, "baseline.json"))),
  file = path.join(root, "baseline-costs.json"),
  costs = JSON.parse(fs.readFileSync(file));
const pending = baseline.trades.filter(
  (t) =>
    t.market_order_id && !costs.find((c) => c.id === t.id)?.boundaryChecked,
);
const script = `const {BinanceFutures}=require('/app/position-guard/binance');const b=new BinanceFutures({apiKey:process.env.BINANCE_API_KEY,apiSecret:process.env.BINANCE_API_SECRET});let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{const out=[];for(const t of JSON.parse(input)){await new Promise(r=>setTimeout(r,1500));try{out.push({id:t.id,fills:await b.request('GET','/fapi/v1/userTrades',{symbol:t.symbol,startTime:Date.parse(t.closed_at)-1000,endTime:Date.parse(t.closed_at)+999,limit:1000})});}catch(e){out.push({id:t.id,error:e.message});if(/Too many requests|429|418/.test(e.message))break;}}console.log(JSON.stringify(out));});`;
const r = spawnSync(
  "docker",
  ["exec", "-i", "aterum-dashboard-1", "node", "-e", script],
  {
    input: JSON.stringify(pending),
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 10000000,
  },
);
if (r.status !== 0) throw Error("BOUNDARY_AUDIT_FAILED");
for (const x of JSON.parse(r.stdout)) {
  const t = costs.find((t) => t.id === x.id);
  if (!x.error && t && !t.error) {
    t.fills = [
      ...new Map([...t.fills, ...x.fills].map((f) => [f.id, f])).values(),
    ];
    t.boundaryChecked = true;
  }
}
fs.writeFileSync(file, JSON.stringify(costs), { mode: 0o600 });
console.log(
  "Boundary windows checked",
  costs.filter((t) => t.boundaryChecked).length,
);
