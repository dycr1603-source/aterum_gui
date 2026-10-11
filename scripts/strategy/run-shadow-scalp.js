"use strict";
require("../../services/load_env");
const base = process.env.INTERNAL_DASHBOARD_BASE || "http://127.0.0.1:3001";
const token = process.env.EXECUTION_ENGINE_TOKEN;
if (!token) throw Error("EXECUTION_ENGINE_TOKEN_REQUIRED");
const headers = { authorization: `Bearer ${token}` };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(method, endpoint) {
  const response = await fetch(new URL(endpoint, base), { method, headers,
    signal: AbortSignal.timeout(280000) });
  if (!response.ok) throw Error(`SHADOW_CYCLE_HTTP_${response.status}`);
  return response.json();
}
async function once() {
  const status = await request("GET", "/internal/strategy/status");
  if (status.engine !== "two-indicator" || status.mode !== "shadow" ||
    status.entryMode !== "scalp" || status.timeframe !== "5m")
    throw Error("SCALP_SHADOW_POLICY_NOT_ACTIVE");
  const result = await request("POST", "/internal/strategy/cycle");
  if (result.passAI || result.allocationAllowed)
    throw Error("SHADOW_CYCLE_ATTEMPTED_LIVE_ALLOCATION");
  console.log(JSON.stringify({ at: new Date().toISOString(),
    reason: result.skipReason, symbol: result.symbol || null,
    candidates: result.universeSummary?.marketQualified || 0,
    jevCompared: result.shadowComparison?.length || 0 }));
}
async function main() {
  do {
    const delay = 5000 + 300000 - (Date.now() % 300000);
    await wait(delay);
    await once();
  } while (process.env.SHADOW_ONCE !== "1");
}
if (require.main === module) main().catch(error => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { once };
