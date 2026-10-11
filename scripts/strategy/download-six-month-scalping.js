"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { dataset, contentHash } = require("./download");

const root = path.resolve(__dirname, "../../.local/strategy-v2");
const start = Date.parse("2026-04-01T00:00:00Z");
const join = Date.parse("2026-07-03T00:00:00Z");
const end = Date.parse("2026-10-01T00:00:00Z");
const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "ADAUSDT", "LTCUSDT",
  "DOTUSDT", "TRXUSDT"];

async function main() {
  fs.mkdirSync(root, { recursive: true });
  const manifest = { schema: 1, source: "Binance USD-M REST", timeframe: "5m",
    start, end, generatedAt: new Date().toISOString(), datasets: [], rejected: [] };
  for (const symbol of symbols) {
    try {
      const first = await dataset(symbol, "5m", start, join);
      const second = await dataset(symbol, "5m", join, end);
      if (first.contentHash !== contentHash(first) ||
        second.contentHash !== contentHash(second) ||
        first.bars.at(-1).time + 300000 !== second.bars[0].time)
        throw Error("SCALPING_DATA_GAP_OR_CHECKSUM");
      const item = { symbol, timeframe: "5m", intervalMs: 300000, start, end,
        bars: [...first.bars, ...second.bars],
        funding: [...first.funding, ...second.funding],
        source: "Binance USD-M REST", retrievedAt: new Date().toISOString(),
        componentHashes: [first.contentHash, second.contentHash] };
      item.contentHash = contentHash(item);
      const file = path.join(root, "market", `${symbol}-5m-${start}-${end}.json`);
      fs.writeFileSync(file, JSON.stringify(item));
      manifest.datasets.push({ symbol, bars: item.bars.length,
        fundingEvents: item.funding.length, contentHash: item.contentHash,
        file: path.relative(root, file) });
      console.log("OK", symbol, item.bars.length, item.funding.length);
    } catch (error) {
      manifest.rejected.push({ symbol, reason: error.message });
      console.error("REJECTED", symbol, error.message);
    }
    fs.writeFileSync(path.join(root, "scalping-six-month-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n");
  }
  if (manifest.rejected.length) process.exitCode = 1;
}
if (require.main === module) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
module.exports = { symbols, start, end };
