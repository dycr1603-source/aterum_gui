"use strict";
// Independent long-horizon hypothesis: relative strength after removing BTC's
// market move, selected cross-sectionally from only earlier closed hourly bars.
const fs = require("node:fs");
const path = require("node:path");
const { prepare, run } = require("../../services/strategy/backtest");
const { select } = require("../../services/strategy/relative_model");
const { contentHash } = require("./download");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const files = manifest.datasets.filter(x => x.purpose === "research" && x.timeframe === "1h");
if (files.length !== 8) throw Error("INCOMPLETE_HOURLY_DATA");
const data = files.map(x => {
  const d = JSON.parse(fs.readFileSync(path.join(root, x.file)));
  if (d.contentHash !== contentHash(d)) throw Error(`CHECKSUM_${x.symbol}`);
  return prepare(d, .8, { adxThreshold: 22, bollingerSigma: 1.8 });
});
const btc = data.find(x => x.symbol === "BTCUSDT");
const start = Date.parse("2025-10-01T00:00:00Z"), day = 86400000;
const periods = { train: [start, start + 180 * day],
  validation: [start + 180 * day, start + 270 * day],
  holdout: [start + 270 * day, start + 365 * day] };
const base = require("../../config/strategy-v2.json");
const policy = { ...base, initialCapital: 1000, maxPositions: 3,
  maxDrawdown: .15, riskFraction: .22, maxPortfolioRisk: .44,
  feeRate: .001, slippageBps: 5, spreadBps: 2, fundingReserve: .001,
  minQuoteVolume: 5e6, latencyBars: 1 };
function signals(c) {
  const maps = new Map(data.map(d => [d.symbol, new Map()]));
  const horizon = c.horizon;
  const macroBars = c.regime === "MACRO_30D" ? 720 :
    c.regime === "MACRO_7D" ? 168 : 0;
  for (let i = Math.max(64, horizon + 2, macroBars); i < btc.bars.length - 2; i++) {
    if (c.selectionIntervalHours &&
      Math.floor(btc.bars[i].time / 3600000) % c.selectionIntervalHours !== 0) continue;
    const reference = btc.bars[i].close / btc.bars[i - horizon].close - 1;
    const regime = btc.bars[i].close / btc.bars[i - 48].close - 1;
    const macro = macroBars ? btc.bars[i].close / btc.bars[i - macroBars].close - 1 : 0;
    const ranked = [];
    for (const d of data) {
      const b = d.bars[i], prior = d.bars[i - horizon];
      if (!b || b.time !== btc.bars[i].time || !d.features[i]?.ready ||
          !(d.features[i].atr > 0)) continue;
      const quote24h = d.bars.slice(i - 23, i + 1)
        .reduce((sum, x) => sum + x.quoteVolume, 0);
      if (quote24h < policy.minQuoteVolume ||
          d.features[i].atr / b.close > policy.maxAtrFraction) continue;
      const own = b.close / prior.close - 1;
      const residual = own - reference;
      ranked.push({ symbol: d.symbol, residual, own });
    }
    if (ranked.length < 5) continue;
    const time = btc.bars[i + 2].time;
    for (const proposal of select(ranked, { reference, regime48h: regime, macro }, c))
      maps.get(proposal.symbol).set(time, proposal);
  }
  return maps;
}
const signalCache = new Map();
function cachedSignals(c) {
  const key = [c.mode, c.horizon, c.threshold, c.regime,
    c.selectionIntervalHours || 1].join(":");
  if (!signalCache.has(key)) signalCache.set(key, signals(c));
  return signalCache.get(key);
}
function evaluate(c, interval, overrides = {}) {
  const r = run(data, { policy: { ...policy, ...overrides },
    start: interval[0], end: interval[1], entrySignalsBySymbol: cachedSignals(c),
    fast: { stopAtr: c.stopAtr, targetR: c.targetR, maxHours: c.maxHours,
      structureBars: 12, minNetR: 1.1, reversal: c.reversal ? .75 : 0,
      earlyLoss: false, staleHours: 0 },
    management: c.reversal ? "existing" : "fixed",
    leverage: 5, maxMarginFractionPerPosition: .35,
    directions: ["LONG", "SHORT"] });
  const hours = r.trades.map(t => (t.exitTime - t.entryTime) / 3600000);
  return { ...r.metrics, meanHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    symbols: new Set(r.trades.map(t => t.symbol)).size,
    halted: r.halted, skipped: r.skipped };
}
const score = m => m.trades < 12 ? -Infinity :
  m.netProfit - 1.5 * m.maxDrawdownAmount + 5 * Math.min(m.profitFactor, 3);
function main() {
const grid = [];
for (const mode of ["MOMENTUM", "REVERSAL"])
  for (const horizon of [6, 24, 48])
    for (const threshold of [.005, .015])
      for (const regime of ["NONE", "BTC_48H", "RANGE", "TREND",
        "MACRO_7D", "MACRO_30D"])
        grid.push({ mode, horizon, threshold, regime,
          stopAtr: 2, targetR: 2, maxHours: 24, reversal: false });
const initial = grid.map(candidate => ({ candidate, train: evaluate(candidate, periods.train) }));
initial.sort((a, b) => score(b.train) - score(a.train));
const refined = [...initial];
for (const x of initial.slice(0, 8))
  for (const stopAtr of [1.5, 3])
    for (const targetR of [1.5, 2.5])
      for (const maxHours of [12, 48]) {
        const candidate = { ...x.candidate, stopAtr, targetR, maxHours };
        refined.push({ candidate, train: evaluate(candidate, periods.train) });
      }
refined.sort((a, b) => score(b.train) - score(a.train));
const shortlist = [];
const familyCount = new Map();
for (const x of refined.filter(x => Number.isFinite(score(x.train)))) {
  const key = [x.candidate.mode, x.candidate.horizon,
    x.candidate.threshold, x.candidate.regime].join(":");
  const n = familyCount.get(key) || 0;
  if (n >= 2) continue;
  shortlist.push(x);
  familyCount.set(key, n + 1);
  if (shortlist.length === 12) break;
}
for (const x of shortlist) x.validation = evaluate(x.candidate, periods.validation);
shortlist.sort((a, b) => score(b.validation) + .25 * score(b.train) -
  score(a.validation) - .25 * score(a.train));
const selected = shortlist[0] || initial[0] || null;
const holdout = selected && evaluate(selected.candidate, periods.holdout);
const stress = selected && evaluate(selected.candidate, periods.holdout,
  { feeRate: .0015, slippageBps: 10, spreadBps: 4 });
const out = { schema: 1, generatedAt: new Date().toISOString(), periods,
  counts: { initial: initial.length, refined: refined.length - initial.length,
    validation: shortlist.length, evaluations: refined.length + shortlist.length + 2 },
  assumptions: { ...policy, historicalJev: "not reproduced" },
  initialBest: initial.slice(0, 12), refinedBest: refined.slice(0, 12),
  shortlist, selected: selected?.candidate || null,
  train: selected?.train || null, validation: selected?.validation || null,
  holdout, stress,
  validated: Boolean(selected && selected.train.netProfit > 0 &&
    selected.validation?.netProfit > 0 && holdout?.netProfit > 0 &&
    holdout?.profitFactor > 1 && stress?.netProfit > 0 &&
    holdout?.maxDrawdown < .15 && holdout?.trades >= 15) };
fs.writeFileSync(path.join(root, "relative-research.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ counts: out.counts, selected: out.selected,
  train: out.train && { trades: out.train.trades, net: out.train.netProfit,
    pf: out.train.profitFactor, dd: out.train.maxDrawdown },
  validation: out.validation && { trades: out.validation.trades,
    net: out.validation.netProfit, pf: out.validation.profitFactor,
    dd: out.validation.maxDrawdown },
  holdout: out.holdout && { trades: out.holdout.trades,
    net: out.holdout.netProfit, pf: out.holdout.profitFactor,
    dd: out.holdout.maxDrawdown }, validated: out.validated }, null, 2));
}
if (require.main === module) main();
module.exports = { evaluate, periods, data, policy, signals };
