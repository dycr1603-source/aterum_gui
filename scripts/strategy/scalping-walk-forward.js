"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { MODELS } = require("../../services/strategy/scalp_model");
process.env.SCALP_HORIZON = "extended";
const { candidateSignals, screen, replay, splits } =
  require("./six-month-scalping-research");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const prior = JSON.parse(fs.readFileSync(path.join(root,
  "scalping-six-month-results-extended.json")));
const day = 86400000, start = splits.train[0];
const firstTrain = [start, start + 60 * day];
const firstTest = [start + 60 * day, start + 100 * day];
const entries = [];
for (const model of MODELS)
  for (const threshold of [.5, 1, 1.5])
    for (const volumeMin of [.8, 1.2, 1.8])
      for (const regime of ["ALL", "TRENDING", "RANGE"])
        for (const session of ["ALL", "EUROPE", "US"])
          entries.push({ model, threshold, volumeMin, regime, session });
const exits = [];
for (const stopAtr of [1.5, 2.5])
  for (const targetR of [2, 3, 4])
    for (const maxBars of [12, 36, 72])
      exits.push({ stopAtr, targetR, maxBars });
const rank = m => m.trades >= 20 ? m.netProfit - m.maxDrawdownAmount : -Infinity;
function firstFold() {
  const screened = [];
  for (const [index, entry] of entries.entries()) {
    const signals = candidateSignals(entry, firstTrain);
    for (const exit of exits) {
      const proxy = screen(signals, exit);
      const score = proxy.trades >= 40 ?
        proxy.netNotional / Math.sqrt(proxy.trades) +
        .00001 * Math.min(proxy.trades, 200) : -Infinity;
      screened.push({ entry, exit, score });
    }
    if ((index + 1) % 162 === 0) console.log("FOLD1_SCREEN", index + 1);
  }
  screened.sort((a,b) => b.score - a.score);
  const representatives = [], seen = new Set();
  for (const row of screened) {
    if (!Number.isFinite(row.score)) break;
    if (seen.has(row.entry.model)) continue;
    representatives.push(row); seen.add(row.entry.model);
    if (representatives.length === MODELS.length) break;
  }
  const expanded = representatives.flatMap(x => [
    { ...x, management: "fixed" }, { ...x, management: "existing" },
  ]);
  for (const x of expanded) x.train = replay(x, firstTrain).metrics;
  expanded.sort((a,b) => rank(b.train) - rank(a.train));
  const selected = expanded[0];
  return { train: firstTrain, test: firstTest, screened: screened.length,
    selection: selected && { entry: selected.entry, exit: selected.exit,
      management: selected.management },
    trainMetrics: selected?.train || null,
    testMetrics: selected && replay(selected, firstTest).metrics };
}
function secondFold() {
  const selected = [...prior.shortlist].sort((a,b) =>
    rank(b.fullTrain.metrics) - rank(a.fullTrain.metrics))[0];
  return { train: splits.train, test: splits.validation,
    screened: prior.counts.screened,
    selection: selected && { entry: selected.entry, exit: selected.exit,
      management: selected.management },
    trainMetrics: selected?.fullTrain.metrics || null,
    testMetrics: selected && replay(selected, splits.validation).metrics };
}
const folds = [firstFold(), secondFold()];
const final = { train: [start, splits.validation[1]], test: splits.holdout,
  selection: { entry: prior.selected.entry, exit: prior.selected.exit,
    management: prior.selected.management },
  trainMetrics: { train: prior.selected.fullTrain.metrics,
    validation: prior.selected.validation.metrics },
  testMetrics: prior.selected.holdout.metrics };
const out = { schema: 1, generatedAt: new Date().toISOString(), folds,
  final, warning: "The 2026 holdout was also inspected in earlier Aterum research; this is sequential within this search, not a pristine future sample." };
fs.writeFileSync(path.join(root, "scalping-walk-forward-results.json"),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ folds: folds.map(x => ({ selection: x.selection,
  trainNet: x.trainMetrics?.netProfit, testNet: x.testMetrics?.netProfit,
  testPF: x.testMetrics?.profitFactor,
  testDD: x.testMetrics?.maxDrawdown })),
  final: { selection: final.selection,
    testNet: final.testMetrics.netProfit } }, null, 2));
