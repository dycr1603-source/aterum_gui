"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const { replay, splits } = require("./six-month-scalping-research");
const source = JSON.parse(fs.readFileSync(path.join(root,
  "scalping-six-month-results-extended.json")));
const base = source.top.filter(x => ["TREND_PULLBACK", "RANGE_REVERSION"].includes(x.entry.model));
if (base.length !== 2) throw Error("SIZING_CANDIDATES_INCOMPLETE");
const results = [];
for (const original of base) {
  for (const maxMarginFractionPerPosition of [.1, .2, .35])
    for (const leverage of [5, 7, 10])
      for (const riskFraction of [.05, .1, .22]) {
        const candidate = { entry: original.entry, exit: original.exit,
          management: original.management, maxMarginFractionPerPosition,
          leverage, riskFraction };
        const train = replay(candidate, splits.train, { riskFraction });
        const validation = replay(candidate, splits.validation, { riskFraction });
        results.push({ candidate, train: train.metrics, validation: validation.metrics });
      }
  console.log("FAMILY_DONE", original.entry.model, results.length);
}
const score = row => row.train.trades < 20 || row.validation.trades < 8 ? -Infinity :
  row.validation.netProfit - row.validation.maxDrawdownAmount +
  .5 * (row.train.netProfit - row.train.maxDrawdownAmount);
results.sort((a,b) => score(b) - score(a));
const selected = results[0];
const holdout = selected && replay(selected.candidate, splits.holdout,
  { riskFraction: selected.candidate.riskFraction });
const stress = selected && replay(selected.candidate, splits.holdout,
  { riskFraction: selected.candidate.riskFraction,
    feeRate: .001, slippageBps: 10, spreadBps: 4 });
const out = { schema: 1, generatedAt: new Date().toISOString(),
  source: "scalping-six-month-results-extended.json",
  count: results.length, selected, holdout: holdout?.metrics,
  stress: stress?.metrics, ranked: results };
fs.writeFileSync(path.join(root, "scalping-sizing-results.json"),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ count: out.count, selected,
  holdout: out.holdout, stress: out.stress }, null, 2));
