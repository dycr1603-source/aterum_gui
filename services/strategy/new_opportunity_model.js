"use strict";

// The frozen weights and 15 feature names come from
// scripts/strategy/inverse-market-research.js and its local result artifact.
// That research used 5-minute candles. The live one-hour application remains
// experimental: this score is not a calibrated probability of net profit.
const { features, probability, NAMES } = require("./inverse_model");

const FROZEN_MODEL = Object.freeze({
  weights: Object.freeze([
    -0.08689235547778795, 0.10071745110337615, -0.17948353793756766,
    0.04947540920549553, -0.12984965559883152, 0.11904809538204823,
    0.1051502408187013, 0.11989895184820967, 0.33833774127740646,
    -0.08765257966359094, 0.41755942037778493, -0.24476538435801778,
    0.062381567481855076, 1.6160799413064575, -0.06339065295268334,
  ]),
  bias: -3.011362006688174,
});
const THRESHOLD = 0.55;

function assess(bars, index, btcBars = bars, model = FROZEN_MODEL) {
  const choices = ["LONG", "SHORT"].map((side) => {
    const values = features(bars, index, side, btcBars);
    const p = probability(values, model);
    return p === null ? null : {
      side, probability: p, score: p,
      inputs: Object.fromEntries(NAMES.map((name, i) => [name, values[i]])),
    };
  }).filter(Boolean).sort((a, b) => b.probability - a.probability);
  const best = choices[0];
  return best && best.probability >= THRESHOLD
    ? { direction: best.side, probability: best.probability,
      score: best.score, inputs: best.inputs }
    : { direction: "NO_TRADE", probability: 0, score: 0, inputs: {} };
}

module.exports = { features, probability, assess, NAMES, FROZEN_MODEL, THRESHOLD };
