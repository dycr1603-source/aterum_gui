"use strict";
// Minimal read-only snapshot. No exchange keys, sessions, users or chat content.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const out = path.resolve(__dirname, "../../.local/strategy-v2/baseline.json");
fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
if (fs.existsSync(out))
  throw Error(
    "Baseline exists; preserve it or explicitly move it before a new experiment",
  );
const script = `const s=require('/app/shared');(async()=>{const out={capturedAt:new Date().toISOString()};for(const [key,sql] of Object.entries({trades:'SELECT t.*,c.exit_price,c.pnl_usdt,c.r_final,c.close_reason,c.closed_at FROM trades t JOIN trade_closes c ON c.trade_id=t.id ORDER BY c.closed_at',decisions:'SELECT id,symbol,result,created_at FROM jev_decisions ORDER BY created_at',opportunities:'SELECT * FROM market_opportunities ORDER BY evaluated_at',executions:"SELECT execution_id,request_payload,verification_result,final_status,requested_at FROM trade_executions WHERE request_type='OPEN_POSITION'"})){[out[key]]=await s.db.query(sql)}console.log(JSON.stringify(out));await s.db.end()})().catch(e=>{console.error(e.message);process.exit(1)})`;
const r = spawnSync(
  "docker",
  [
    "exec",
    process.env.ATERUM_DASHBOARD_CONTAINER || "aterum-dashboard-1",
    "node",
    "-e",
    script,
  ],
  { encoding: "utf8", maxBuffer: 100 * 1024 * 1024, timeout: 30000 },
);
if (r.status !== 0) throw Error("BASELINE_EXPORT_FAILED");
JSON.parse(r.stdout);
fs.writeFileSync(out, r.stdout, { mode: 0o600, flag: "wx" });
console.log(out);
