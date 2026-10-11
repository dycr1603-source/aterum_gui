"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { dataset, contentHash } = require("./download");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const old = JSON.parse(fs.readFileSync(path.join(root, "scalping-six-month-manifest.json")));
const start = old.end, end = Date.parse("2026-10-10T00:00:00Z");
async function main() {
  const out = { schema: 1, source: "Binance USD-M REST", start, end,
    generatedAt: new Date().toISOString(), datasets: [], rejected: [] };
  for (const { symbol } of old.datasets) {
    try {
      const d = await dataset(symbol, "5m", start, end);
      if (d.contentHash !== contentHash(d)) throw Error("CHECKSUM_MISMATCH");
      out.datasets.push({ symbol, bars: d.bars.length,
        fundingEvents: d.funding.length, contentHash: d.contentHash,
        file: path.relative(root, d.file) });
      console.log("OK", symbol, d.bars.length);
    } catch (error) {
      out.rejected.push({ symbol, reason: error.message });
      console.error("REJECTED", symbol, error.message);
    }
    fs.writeFileSync(path.join(root, "scalping-recent-manifest.json"),
      JSON.stringify(out, null, 2) + "\n");
  }
  if (out.rejected.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
