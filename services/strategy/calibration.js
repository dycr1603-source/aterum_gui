"use strict";
const { metrics, random } = require("./metrics");
// Confidence cannot be called predictive without both adequate samples and a
// chronological validation result. The model's own probabilities are not labels.
function calibrate(trades, { minTrades = 30, seed = 20261003 } = {}) {
  const rows = trades
      .filter(
        (t) =>
          t.accountingComplete &&
          Number.isFinite(t.confidence) &&
          Number.isFinite(t.r),
      )
      .sort((a, b) => a.entryTime - b.entryTime),
    cut = Math.floor(rows.length * 0.7),
    train = rows.slice(0, cut),
    validation = rows.slice(cut),
    rng = random(seed);
  const bands = [50, 60, 70, 80, 90].map((min) => {
    const a = train.filter((t) => t.confidence >= min),
      b = validation.filter((t) => t.confidence >= min);
    let lowerMeanR = null;
    if (a.length >= minTrades) {
      const means = [];
      for (let k = 0; k < 1000; k++) {
        let total = 0;
        for (let i = 0; i < a.length; i++)
          total += a[Math.floor(rng() * a.length)].r;
        means.push(total / a.length);
      }
      means.sort((a, b) => a - b);
      lowerMeanR = means[49];
    }
    const tm = metrics(a),
      vm = metrics(b);
    return {
      minimumConfidence: min,
      train: tm,
      validation: vm,
      lowerMeanR,
      passed:
        a.length >= minTrades &&
        b.length >= minTrades &&
        lowerMeanR > 0 &&
        vm.expectancy > 0 &&
        (vm.profitFactor > 1 || vm.profitFactorUnbounded),
    };
  });
  const accepted = bands
    .filter((b) => b.passed)
    .sort((a, b) => b.validation.expectancy - a.validation.expectancy)[0];
  return {
    status: accepted
      ? "CANDIDATE_REQUIRES_NEW_OOS"
      : "INSUFFICIENT_OR_NONPREDICTIVE",
    records: rows.length,
    minimumConfidence: accepted?.minimumConfidence ?? null,
    bands,
    leverageThresholds: null,
    reason:
      "Leverage groups are observational and confounded by margin, symbol and stop distance; no causal leverage uplift assumed.",
  };
}
module.exports = { calibrate };
