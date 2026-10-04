"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { validateBars } = require("../../services/strategy/indicators");
const ROOT = path.resolve(__dirname, "../../.local/strategy-v2/market");
const intervals = { "1h": 3600000, "4h": 14400000 };
function contentHash(d) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        symbol: d.symbol,
        timeframe: d.timeframe,
        start: d.start,
        end: d.end,
        bars: d.bars,
        funding: d.funding,
      }),
    )
    .digest("hex");
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(endpoint, params) {
  const url = new URL(`https://fapi.binance.com/fapi/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 0; attempt < 4; attempt++) {
    await wait(350);
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status >= 500) {
      await wait(2000 * (attempt + 1));
      continue;
    }
    if (!r.ok) throw Error(`BINANCE_HTTP_${r.status}`);
    return r.json();
  }
  throw Error("BINANCE_RETRIES_EXHAUSTED");
}
async function dataset(symbol, timeframe, start, end) {
  fs.mkdirSync(ROOT, { recursive: true });
  const key = `${symbol}-${timeframe}-${start}-${end}`,
    file = path.join(ROOT, key + ".json");
  if (fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file));
    validateBars(cached.bars, intervals[timeframe]);
    if (cached.contentHash && cached.contentHash !== contentHash(cached))
      throw Error("HISTORY_CHECKSUM_MISMATCH");
    if (
      cached.bars[0].time !== start ||
      cached.bars.at(-1).time !== end - intervals[timeframe]
    )
      throw Error("INCOMPLETE_HISTORY");
    return { file, ...cached };
  }
  const raw = [];
  let cursor = start;
  while (cursor < end) {
    const chunk = await get("klines", {
      symbol,
      interval: timeframe,
      startTime: cursor,
      endTime: end - 1,
      limit: 1000,
    });
    if (!Array.isArray(chunk) || !chunk.length) break;
    raw.push(...chunk.filter((r) => r[0] < end));
    const next = Number(chunk.at(-1)[0]) + intervals[timeframe];
    if (next <= cursor) throw Error("NONADVANCING_KLINES");
    cursor = next;
  }
  const bars = raw.map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    quoteVolume: Number(r[7]),
  }));
  validateBars(bars, intervals[timeframe]);
  if (bars[0].time !== start || bars.at(-1).time !== end - intervals[timeframe])
    throw Error("INCOMPLETE_HISTORY");
  const funding = [];
  cursor = start;
  while (cursor < end) {
    const chunk = await get("fundingRate", {
      symbol,
      startTime: cursor,
      endTime: end - 1,
      limit: 1000,
    });
    if (!Array.isArray(chunk) || !chunk.length) break;
    funding.push(
      ...chunk.map((f) => ({
        time: Number(f.fundingTime),
        rate: Number(f.fundingRate),
        markPrice: Number(f.markPrice),
      })),
    );
    const next = Number(chunk.at(-1).fundingTime) + 1;
    if (next <= cursor) throw Error("NONADVANCING_FUNDING");
    cursor = next;
  }
  if (
    !funding.length ||
    funding.some(
      (f) =>
        ![f.time, f.rate, f.markPrice].every(Number.isFinite) ||
        f.markPrice <= 0,
    ) ||
    funding.some((f, i) => i && f.time - funding[i - 1].time > 12 * 3600000) ||
    funding[0].time - start > 12 * 3600000 ||
    end - funding.at(-1).time > 12 * 3600000
  )
    throw Error("INCOMPLETE_FUNDING");
  const payload = {
    symbol,
    timeframe,
    intervalMs: intervals[timeframe],
    start,
    end,
    bars,
    funding,
    source: "Binance USD-M REST",
    retrievedAt: new Date().toISOString(),
    sha256: createHash("sha256")
      .update(JSON.stringify({ raw, funding }))
      .digest("hex"),
  };
  payload.contentHash = contentHash(payload);
  fs.writeFileSync(file, JSON.stringify(payload));
  return { file, ...payload };
}
async function main() {
  const start = Date.parse("2025-10-01T00:00:00Z"),
    end = Date.parse("2026-10-01T00:00:00Z");
  const plan = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "LINKUSDT",
    "AVAXUSDT",
  ].flatMap((symbol) =>
    ["1h", "4h"].map((timeframe) => ({
      symbol,
      timeframe,
      start,
      end,
      purpose: "research",
    })),
  );
  const base = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, "../baseline.json")),
  );
  const comparisonStart =
    Math.floor(
      Math.min(...base.trades.map((t) => Date.parse(t.opened_at))) / 14400000,
    ) *
      14400000 -
    100 * 14400000;
  const comparisonEnd =
    Math.ceil(
      Math.max(...base.trades.map((t) => Date.parse(t.closed_at))) / 14400000,
    ) * 14400000;
  for (const symbol of [...new Set(base.trades.map((t) => t.symbol))].sort())
    plan.push({
      symbol,
      timeframe: "1h",
      start: comparisonStart,
      end: comparisonEnd,
      purpose: "comparison",
    });
  const manifest = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    universePolicy:
      "Eight predefined liquid assets, no ranking on subsequent profit. Historical survivor bias remains; no automatic promotion.",
    datasets: [],
    rejected: [],
  };
  for (const p of plan) {
    try {
      const d = await dataset(p.symbol, p.timeframe, p.start, p.end);
      manifest.datasets.push({
        ...p,
        file: path.relative(path.dirname(ROOT), d.file),
        sha256: d.sha256,
        bars: d.bars.length,
      });
      console.log("OK", p.purpose, p.symbol, p.timeframe, d.bars.length);
    } catch (e) {
      manifest.rejected.push({ ...p, reason: e.message });
      console.log("REJECTED", p.symbol, p.timeframe, e.message);
    }
    fs.writeFileSync(
      path.resolve(ROOT, "../manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { dataset, get, intervals, contentHash };
