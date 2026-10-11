"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scalping-six-month-manifest.json")));
const start = Date.parse("2026-09-11T00:00:00Z");
const end = Date.parse("2026-10-01T00:00:00Z");
const intervalMs = 300000;
async function get(symbol, endCursor) {
  const url = new URL("https://fapi.binance.com/futures/data/openInterestHist");
  for (const [key, value] of Object.entries({ symbol, period: "5m",
    startTime: start, endTime: endCursor, limit: 500 }))
    url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500)
      throw Error(`OPEN_INTEREST_HTTP_${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw Error("OPEN_INTEREST_RETRIES_EXHAUSTED");
}
async function main() {
  const out = { schema: 1, source: "Binance USD-M openInterestHist",
    start, end, retrievedAt: new Date().toISOString(),
    availableWindow: "Only the latest 30 days are published by this endpoint; diagnostic only",
    datasets: [], rejected: [] };
  for (const { symbol } of manifest.datasets) {
    try {
      const chunks = [];
      let cursor = end - intervalMs;
      while (cursor >= start) {
        const chunk = await get(symbol, cursor);
        if (!Array.isArray(chunk) || !chunk.length) break;
        chunks.push(chunk);
        const next = Number(chunk[0].timestamp) - intervalMs;
        if (next >= cursor) throw Error("OPEN_INTEREST_NONADVANCING");
        cursor = next;
      }
      const rows = chunks.reverse().flat().filter(x =>
        Number(x.timestamp) >= start && Number(x.timestamp) < end);
      const points = rows.map(x => ({ time: Number(x.timestamp),
        quantity: Number(x.sumOpenInterest),
        quoteValue: Number(x.sumOpenInterestValue) }));
      if (points[0]?.time !== start || points.at(-1)?.time !== end - intervalMs ||
        points.some((p,i) => !Number.isFinite(p.quantity) || p.quantity <= 0 ||
          !Number.isFinite(p.quoteValue) || p.quoteValue <= 0 ||
          (i && p.time - points[i-1].time !== intervalMs)))
        throw Error("OPEN_INTEREST_INCOMPLETE");
      const sha256 = createHash("sha256").update(JSON.stringify(points)).digest("hex");
      const file = path.join(root, "market", `${symbol}-oi-5m-${start}-${end}.json`);
      fs.writeFileSync(file, JSON.stringify({ symbol, start, end, points, sha256 }));
      out.datasets.push({ symbol, points: points.length, sha256,
        file: path.relative(root,file) });
      console.log("OK", symbol, points.length);
    } catch (error) {
      out.rejected.push({ symbol, reason: error.message });
      console.error("REJECTED", symbol, error.message);
    }
    fs.writeFileSync(path.join(root, "scalping-open-interest-manifest.json"),
      JSON.stringify(out, null, 2) + "\n");
  }
  if (out.rejected.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
