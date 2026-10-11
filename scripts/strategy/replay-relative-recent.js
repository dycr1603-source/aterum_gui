"use strict";
// Diagnostic only: recent dates were previously inspected in trade analysis.
const fs = require("node:fs");
const path = require("node:path");
const { prepare, run } = require("../../services/strategy/backtest");
const { select } = require("../../services/strategy/relative_model");
const { contentHash } = require("./download");
const candidate = require("../../config/strategy-relative-candidate.json");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const start = Date.parse("2026-10-01T00:00:00Z");
const end = Date.parse("2026-10-10T00:00:00Z");
const data = candidate.opportunityUniverse.map(symbol => {
  const row = manifest.datasets.find(x => x.symbol === symbol &&
    x.timeframe === "1h" && x.purpose === "research");
  if (!row) throw Error(`MISSING_HISTORY_${symbol}`);
  const old = JSON.parse(fs.readFileSync(path.join(root, row.file)));
  const extra = JSON.parse(fs.readFileSync(path.join(root, "market",
    `${symbol}-1h-${start}-${end}.json`)));
  if (contentHash(old) !== old.contentHash || contentHash(extra) !== extra.contentHash)
    throw Error(`CHECKSUM_${symbol}`);
  return prepare({ ...old, end, bars: [...old.bars, ...extra.bars],
    funding: [...old.funding, ...extra.funding] }, .8,
  { adxThreshold: 22, bollingerSigma: 1.8 });
});
const btc = data.find(x => x.symbol === "BTCUSDT");
const c = candidate.relative;
const marginCap = Number(process.env.RELATIVE_RESEARCH_MARGIN_CAP ?? .35);
const riskFraction = Number(process.env.RELATIVE_RESEARCH_RISK_FRACTION ?? candidate.riskFraction);
if (!(marginCap > 0 && marginCap <= .35 && riskFraction > 0 && riskFraction <= .22))
  throw Error("INVALID_RESEARCH_SIZE");
const maps = new Map(data.map(d => [d.symbol, new Map()]));
for (let i = 64; i < btc.bars.length - 2; i++) {
  const reference = btc.bars[i].close / btc.bars[i - c.horizon].close - 1;
  const regime48h = btc.bars[i].close / btc.bars[i - 48].close - 1;
  const observations = [];
  for (const d of data) {
    if (!d.features[i]?.ready || d.bars[i].time !== btc.bars[i].time) continue;
    const quote = d.bars.slice(i - 23, i + 1)
      .reduce((sum, bar) => sum + bar.quoteVolume, 0);
    if (quote < candidate.minQuoteVolume ||
      d.features[i].atr / d.bars[i].close > candidate.maxAtrFraction) continue;
    observations.push({ symbol: d.symbol,
      own: d.bars[i].close / d.bars[i - c.horizon].close - 1 });
  }
  for (const proposal of select(observations,
    { reference, regime48h, macro: 0 }, c))
    maps.get(proposal.symbol).set(btc.bars[i + 2].time, proposal);
}
const policy = { ...candidate, initialCapital: 1000,
  riskFraction,
  feeRate: .001, slippageBps: 5, spreadBps: 2,
  fundingReserve: .001, latencyBars: 1 };
const result = run(data, { policy, start, end, entrySignalsBySymbol: maps,
  fast: { stopAtr: c.stopAtr, targetR: c.targetR, maxHours: c.maxHours,
    structureBars: 12, minNetR: 1.1, reversal: 0,
    earlyLoss: false, staleHours: 0 },
  management: "fixed", leverage: 5, maxMarginFractionPerPosition: marginCap,
  directions: ["LONG", "SHORT"] });
const hours = result.trades.map(t => (t.exitTime - t.entryTime) / 3600000);
const out = { schema: 1, generatedAt: new Date().toISOString(),
  range: [start, end], inspectedBefore: true,
  candidate: c, marginCap, riskFraction, trades: result.metrics.trades,
  metrics: { ...result.metrics,
    meanHours: hours.length ? hours.reduce((sum, x) => sum + x, 0) / hours.length : null,
    symbols: new Set(result.trades.map(t => t.symbol)).size,
    halted: result.halted, skipped: result.skipped },
  tradeSummary: result.trades.map(t => ({ symbol: t.symbol, side: t.side,
    entryTime: t.entryTime, exitTime: t.exitTime, net: t.net,
    reason: t.exitReason })) };
const suffix = process.env.RELATIVE_RESEARCH_MARGIN_CAP ?
  `-${marginCap}-${riskFraction}` : "";
fs.writeFileSync(path.join(root, `relative-recent${suffix}.json`),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ range: out.range, metrics: out.metrics }, null, 2));
