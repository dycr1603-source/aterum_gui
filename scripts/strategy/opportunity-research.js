"use strict";
// Offline candidate selection. Research results never change the deployed policy.
const fs = require("node:fs");
const path = require("node:path");
const { prepare, run } = require("../../services/strategy/backtest");
const { contentHash } = require("./download");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "fast-manifest.json")));
const hourly = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const base = require("../../config/strategy-v2.json");
const start = Date.parse("2026-07-03T00:00:00Z"), day = 86400000;
const train = [start, start + 54 * day];
const validation = [train[1], start + 72 * day];
const holdout = [validation[1], start + 90 * day];
const policy = { ...base, initialCapital: 1000, maxPositions: 3,
  maxDrawdown: .15, maxPortfolioRisk: .44, riskFraction: .22,
  feeRate: .001, slippageBps: 5, spreadBps: 2,
  fundingReserve: .001, minQuoteVolume: 5e6, latencyBars: 1 };
const cache = new Map();
function dataFor(tf) {
  if (cache.has(tf)) return cache.get(tf);
  const source = tf === "1h" ? hourly.datasets.filter(x => x.purpose === "research" && x.timeframe === tf)
    : manifest.datasets.filter(x => x.timeframe === tf);
  if (source.length !== 8) throw Error(`INCOMPLETE_${tf}`);
  const data = source.map(x => {
    const d = JSON.parse(fs.readFileSync(path.join(root, x.file)));
    if (d.contentHash !== contentHash(d)) throw Error(`CHECKSUM_${tf}_${x.symbol}`);
    return prepare(d, .8, { adxThreshold: 22, bollingerSigma: 1.8 });
  });
  cache.set(tf, data);
  return data;
}
function evaluate(c, period, overrides = {}) {
  const r = run(dataFor(c.timeframe), { policy: { ...policy, ...overrides },
    start: period[0], end: period[1], entryMode: "opportunistic",
    opportunity: c.opportunity, management: c.management || "existing",
    fast: { stopAtr: c.stopAtr, targetR: c.targetR, maxHours: c.maxHours,
      structureBars: c.structureBars || 6, minNetR: 1.1,
      reversal: c.management === "fixed" ? 0 : .75,
      earlyLoss: false, staleHours: 0 },
    leverage: c.leverage || 5, maxMarginFractionPerPosition: .35,
    directions: ["LONG", "SHORT"] });
  const hours = r.trades.map(t => (t.exitTime - t.entryTime) / 3600000);
  const m = r.metrics;
  return { ...m, meanHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    symbols: new Set(r.trades.map(t => t.symbol)).size,
    sides: { LONG: r.trades.filter(t => t.side === "LONG").length,
      SHORT: r.trades.filter(t => t.side === "SHORT").length },
    halted: r.halted, skipped: r.skipped };
}
function score(m) {
  if (!m || m.trades < 8 || m.symbols < 2) return -Infinity;
  return m.netProfit - 1.5 * m.maxDrawdownAmount +
    10 * Math.min(2, m.profitFactor) + Math.min(20, m.trades) * .1;
}
const models = ["COMPRESSION_BREAKOUT", "MOMENTUM_ACCELERATION",
  "LIQUIDITY_RECLAIM", "TREND_PULLBACK"];
const stageOne = [];
for (const timeframe of ["15m", "5m", "1h"])
  for (const model of models)
    for (const span of [8, 16, 24])
      for (const volumeMin of [.8, 1.2]) {
        const opportunity = { model, span, volumeMin, trendMin: .5,
          impulseMin: .5, compressionMax: .9, bodyMin: .15,
          rangeMin: 1.2, reclaimFraction: .65,
          roundTripCostFraction: .0032, costMultiple: 1.5 };
        stageOne.push({ timeframe, opportunity,
          stopAtr: 1.5, targetR: 1.8, maxHours: 6,
          management: "existing", leverage: 5 });
      }
const first = stageOne.map(candidate => ({ candidate, train: evaluate(candidate, train) }));
first.sort((a, b) => score(b.train) - score(a.train));
const finalists = [];
for (const timeframe of ["15m", "5m", "1h"])
  finalists.push(...first.filter(x => x.candidate.timeframe === timeframe).slice(0, 3));
const refined = [];
for (const x of finalists)
  for (const stopAtr of [1.25, 2])
    for (const targetR of [1.5, 2.2])
      for (const maxHours of [3, 9]) {
        const candidate = { ...x.candidate, stopAtr, targetR, maxHours };
        refined.push({ candidate, train: evaluate(candidate, train) });
      }
refined.sort((a, b) => score(b.train) - score(a.train));
const shortlisted = refined.filter(x => Number.isFinite(score(x.train))).slice(0, 12);
for (const x of shortlisted) x.validation = evaluate(x.candidate, validation);
const validationScore = x => score(x.validation) + .25 * score(x.train);
shortlisted.sort((a, b) => validationScore(b) - validationScore(a));
const selected = shortlisted[0] || first[0] || null;
const finalTest = selected ? evaluate(selected.candidate, holdout) : null;
const stress = selected ? evaluate(selected.candidate, holdout,
  { feeRate: .0015, slippageBps: 10, spreadBps: 4 }) : null;
const out = { schema: 1, generatedAt: new Date().toISOString(),
  periods: { train, validation, holdout },
  assumptions: { symbols: 8, initialCapital: 1000, feePerSide: .001,
    slippageBpsPerSide: 5, spreadBpsTotal: 2,
    funding: "historical", maxPositions: 3, maxTotalMarginFraction: .9,
    maxPositionMarginFraction: .35, leverage: 5, latencyBars: 1,
    historicalJev: "unavailable; technical proxy only" },
  counts: { families: models.length, initial: first.length, refined: refined.length,
    selectedForValidation: shortlisted.length, totalEvaluations: first.length + refined.length + shortlisted.length + (selected ? 2 : 0) },
  bestInitial: first.slice(0, 12), bestTraining: refined.slice(0, 12),
  shortlisted, selected: selected?.candidate || null,
  selectedTrain: selected?.train || null,
  selectedValidation: selected?.validation || null,
  holdout: finalTest, stressHoldout: stress,
  validated: Boolean(selected && selected.train.netProfit > 0 &&
    selected.validation?.netProfit > 0 && finalTest?.netProfit > 0 &&
    finalTest?.profitFactor > 1 && finalTest?.trades >= 15 &&
    finalTest?.maxDrawdown < .15 && stress?.netProfit > 0) };
fs.writeFileSync(path.join(root, "opportunity-research.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ counts: out.counts, selected: out.selected,
  train: out.selectedTrain && { trades: out.selectedTrain.trades,
    net: out.selectedTrain.netProfit, pf: out.selectedTrain.profitFactor,
    dd: out.selectedTrain.maxDrawdown, hours: out.selectedTrain.meanHours },
  validation: out.selectedValidation && { trades: out.selectedValidation.trades,
    net: out.selectedValidation.netProfit, pf: out.selectedValidation.profitFactor,
    dd: out.selectedValidation.maxDrawdown, hours: out.selectedValidation.meanHours },
  holdout: finalTest && { trades: finalTest.trades, net: finalTest.netProfit,
    pf: finalTest.profitFactor, dd: finalTest.maxDrawdown,
    hours: finalTest.meanHours },
  stress: stress && { trades: stress.trades, net: stress.netProfit,
    pf: stress.profitFactor, dd: stress.maxDrawdown }, validated: out.validated }, null, 2));
