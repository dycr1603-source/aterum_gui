"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { run } = require("../../services/strategy/backtest");
const { data, policy, periods, signals } = require("./relative-research");
const candidate = require("../../config/strategy-relative-candidate.json").relative;
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const signalMaps = signals(candidate);
function evaluate(cap, riskFraction, period) {
  const r = run(data, { policy: { ...policy, riskFraction },
    start: period[0], end: period[1], entrySignalsBySymbol: signalMaps,
    fast: { stopAtr: candidate.stopAtr, targetR: candidate.targetR,
      maxHours: candidate.maxHours, structureBars: 12, minNetR: 1.1,
      reversal: 0, earlyLoss: false, staleHours: 0 },
    management: "fixed", leverage: 5,
    maxMarginFractionPerPosition: cap, directions: ["LONG", "SHORT"] });
  return { ...r.metrics, halted: r.halted,
    weeksWithEntries: new Set(r.trades.map(t =>
      Math.floor((t.entryTime - period[0]) / (7 * 86400000)))).size };
}
const variants = [];
for (const cap of [.1, .2, .25, .35])
  for (const riskFraction of [.05, .1, .22])
    variants.push({ cap, riskFraction,
      train: evaluate(cap, riskFraction, periods.train),
      validation: evaluate(cap, riskFraction, periods.validation) });
const score = x => {
  if (x.train.trades < 12 || x.validation.trades < 8) return -Infinity;
  const t = x.train, v = x.validation;
  return .25 * t.netProfit + v.netProfit +
    50 * Math.log(Math.max(.01, v.profitFactor)) -
    500 * (Math.max(0, t.maxDrawdown - .15) +
      Math.max(0, v.maxDrawdown - .15));
};
variants.sort((a, b) => score(b) - score(a));
const chosen = variants[0];
const holdout = evaluate(chosen.cap, chosen.riskFraction, periods.holdout);
const out = { generatedAt: new Date().toISOString(), tested: variants.length,
  variants, selected: { cap: chosen.cap,
    riskFraction: chosen.riskFraction }, holdout,
  holdoutPreviouslyInspected: true };
fs.writeFileSync(path.join(root, "relative-sizing-results.json"),
  JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ tested: variants.length,
  top: variants.slice(0, 6).map(x => ({ cap: x.cap,
    riskFraction: x.riskFraction,
    train: { n: x.train.trades, net: x.train.netProfit,
      dd: x.train.maxDrawdown },
    validation: { n: x.validation.trades,
      net: x.validation.netProfit, dd: x.validation.maxDrawdown } })),
  selected: out.selected,
  holdout: { n: holdout.trades, net: holdout.netProfit,
    pf: holdout.profitFactor, dd: holdout.maxDrawdown,
    weeksWithEntries: holdout.weeksWithEntries } }, null, 2));
