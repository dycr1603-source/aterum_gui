"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { evaluate, periods } = require("./relative-research");
const base = require("../../config/strategy-relative-candidate.json").relative;
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const variants = [];
for (const selectionIntervalHours of [1, 3, 6, 12, 24])
  for (const maxHours of [6, 12, 24]) {
    const candidate = { ...base, selectionIntervalHours, maxHours };
    variants.push({ candidate,
      train: evaluate(candidate, periods.train),
      validation: evaluate(candidate, periods.validation) });
  }
// The first two chronological periods choose the diagnostic; holdout is read
// only for the frozen choice. Prior research has already exposed the holdout.
const score = x => {
  const t = x.train, v = x.validation;
  if (t.trades < 12 || v.trades < 8) return -Infinity;
  const riskPenalty = 300 * (Math.max(0, t.maxDrawdown - .15) +
    Math.max(0, v.maxDrawdown - .15));
  return .35 * t.netProfit + v.netProfit +
    50 * Math.log(Math.max(.01, v.profitFactor)) - riskPenalty;
};
variants.sort((a, b) => score(b) - score(a));
const selected = variants[0];
const holdout = evaluate(selected.candidate, periods.holdout);
const stress = evaluate(selected.candidate, periods.holdout,
  { feeRate: .0015, slippageBps: 10, spreadBps: 4 });
const out = { generatedAt: new Date().toISOString(), tested: variants.length,
  variants, selected: selected.candidate, train: selected.train,
  validation: selected.validation, holdout, stress,
  holdoutPreviouslyInspected: true };
fs.writeFileSync(path.join(root, "relative-cadence-results.json"),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ tested: out.tested,
  top: variants.slice(0, 5).map(x => ({ selectionIntervalHours: x.candidate.selectionIntervalHours,
    maxHours: x.candidate.maxHours,
    train: { n: x.train.trades, net: x.train.netProfit, pf: x.train.profitFactor },
    validation: { n: x.validation.trades, net: x.validation.netProfit,
      pf: x.validation.profitFactor } })),
  selected: out.selected,
  holdout: { n: holdout.trades, net: holdout.netProfit,
    pf: holdout.profitFactor, dd: holdout.maxDrawdown,
    hours: holdout.meanHours },
  stress: { n: stress.trades, net: stress.netProfit, pf: stress.profitFactor } }, null, 2));
