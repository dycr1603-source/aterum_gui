"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { contentHash } = require("./download");
const { features, probability, NAMES } = require("../../services/strategy/inverse_model");
const { prepare, run } = require("../../services/strategy/backtest");

const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scalping-six-month-manifest.json")));
const datasets = manifest.datasets.map(row => {
  const value = JSON.parse(fs.readFileSync(path.join(root, row.file)));
  if (contentHash(value) !== row.contentHash) throw Error(`CHECKSUM_${row.symbol}`);
  return value;
});
const btc = datasets.find(d => d.symbol === "BTCUSDT").bars;
const starts = { train: manifest.start, validation: manifest.start + 100 * 86400000,
  holdout: manifest.start + 140 * 86400000, end: manifest.end };
const thresholds = [.003, .005, .0075, .01, .015, .02];
const horizons = [1, 2, 3, 6, 9, 12, 24];
const labelSpec = { target: .0075, stop: .005, horizon: 12 };
const labelSummary = {};
const rows = { train: [], validation: [], holdout: [] };

function outcomes(bars, i, sign, horizon) {
  const entry = bars[i + 1].open;
  let mfe = 0, mae = 0, targetAt = Infinity, stopAt = Infinity;
  for (let j = i + 1; j <= i + horizon; j++) {
    const bar = bars[j];
    const favorable = sign > 0 ? bar.high / entry - 1 : 1 - bar.low / entry;
    const adverse = sign > 0 ? 1 - bar.low / entry : bar.high / entry - 1;
    mfe = Math.max(mfe, favorable);
    mae = Math.max(mae, adverse);
    if (targetAt === Infinity && favorable >= labelSpec.target) targetAt = j - i;
    if (stopAt === Infinity && adverse >= labelSpec.stop) stopAt = j - i;
  }
  return { mfe, mae, targetAt, stopAt,
    win: targetAt < stopAt && targetAt <= horizon ? 1 : 0 };
}
function discover() {
  for (const d of datasets) {
    for (let i = 48; i < d.bars.length - 24; i++) {
      const segment = d.bars[i].time < starts.validation ? "train" :
        d.bars[i].time < starts.holdout ? "validation" : "holdout";
      const segmentEnd = segment === "train" ? starts.validation :
        segment === "validation" ? starts.holdout : starts.end;
      if (d.bars[i].time + 25 * 300000 >= segmentEnd) continue;
      for (const side of ["LONG", "SHORT"]) {
        const sign = side === "LONG" ? 1 : -1;
        const entry = d.bars[i + 1].open;
        let mfe = 0, mae = 0;
        const first = thresholds.map(() => Infinity);
        for (let step = 1; step <= 24; step++) {
          const bar = d.bars[i + step];
          mfe = Math.max(mfe, sign > 0 ? bar.high / entry - 1 : 1 - bar.low / entry);
          mae = Math.max(mae, sign > 0 ? 1 - bar.low / entry : bar.high / entry - 1);
          thresholds.forEach((t, k) => { if (first[k] === Infinity && mfe >= t) first[k] = step; });
          if (horizons.includes(step)) thresholds.forEach((t, k) => {
            const key = `${segment}:${side}:${step * 5}m:${t * 100}%`;
            const cell = labelSummary[key] ||= { observations: 0, favorable: 0,
              mfeSum: 0, maeSum: 0, minutesSum: 0 };
            cell.observations++;
            cell.mfeSum += mfe; cell.maeSum += mae;
            if (first[k] <= step) { cell.favorable++; cell.minutesSum += first[k] * 5; }
          });
        }
        // Sample non-adjacent decisions for model fitting; full universe is
        // retained above for the opportunity census.
        if (i % 3 !== 0) continue;
        const x = features(d.bars, i, side, btc);
        if (!x) continue;
        const outcome = outcomes(d.bars, i, sign, labelSpec.horizon);
        rows[segment].push({ symbol: d.symbol, time: d.bars[i].time,
          side, x, y: outcome.win, mfe: outcome.mfe, mae: outcome.mae });
      }
    }
    console.log("LABELED", d.symbol);
  }
}
function fit(training) {
  training.sort((a, b) => a.time - b.time || a.symbol.localeCompare(b.symbol));
  const weights = Array(NAMES.length).fill(0);
  const positive = training.reduce((s, r) => s + r.y, 0) / training.length;
  let bias = Math.log(positive / (1 - positive));
  const lambda = .0005;
  // Deterministic online logistic regression, time-ordered input, L2 shrinkage.
  for (let epoch = 0; epoch < 4; epoch++) {
    const lr = .006 / (epoch + 1);
    for (const r of training) {
      const p = probability(r.x, { weights, bias });
      const delta = lr * (r.y - p);
      bias += delta;
      for (let j = 0; j < weights.length; j++)
        weights[j] += delta * r.x[j] - lr * lambda * weights[j];
    }
  }
  return { weights, bias, trainingBaseRate: positive };
}
function diagnostics(data, model, cutoff) {
  let count = 0, hit = 0, mfe = 0, mae = 0, brier = 0, predicted = 0;
  const bySymbol = {};
  for (const r of data) {
    const p = probability(r.x, model);
    brier += (p - r.y) ** 2;
    if (p < cutoff) continue;
    count++; hit += r.y; mfe += r.mfe; mae += r.mae; predicted += p;
    const c = bySymbol[r.symbol] ||= { count: 0, wins: 0 };
    c.count++; c.wins += r.y;
  }
  return { observations: data.length, selected: count,
    selectedHitRate: count ? hit / count : null,
    selectedMeanMfe: count ? mfe / count : null,
    selectedMeanMae: count ? mae / count : null,
    meanPredicted: count ? predicted / count : null,
    brier: brier / data.length, bySymbol };
}
function signals(data, model, cutoff, interval, latencyBars = 0) {
  const result = new Map();
  for (const d of data) {
    const map = new Map();
    for (let i = 48; i < d.bars.length - 1; i++) {
      const bar = d.bars[i];
      if (bar.time < interval[0] || bar.time >= interval[1] - 3600000) continue;
      let best = null;
      for (const side of ["LONG", "SHORT"]) {
        const x = features(d.bars, i, side, btc);
        const p = probability(x, model);
        if (p >= cutoff && (!best || p > best.score)) best = { side, score: p };
      }
      if (!best) continue;
      const sign = best.side === "LONG" ? 1 : -1;
      const entryIndex = i + 1 + latencyBars;
      if (!d.bars[entryIndex] || d.bars[entryIndex].time >= interval[1]) continue;
      const entry = d.bars[entryIndex].open;
      map.set(d.bars[entryIndex].time, { ...best,
        stop: entry * (1 - sign * labelSpec.stop),
        target: entry * (1 + sign * labelSpec.target) });
    }
    result.set(d.symbol, map);
  }
  return result;
}
function replay(data, model, cutoff, interval, extra = {}) {
  const policy = { ...require("../../config/strategy-scalp-candidate.json"),
    initialCapital: 1000, riskFraction: .22, maxPortfolioRisk: .44,
    maxPositions: 3, maxDrawdown: .15, maxLossStreak: 10,
    feeRate: .0005, slippageBps: 5, spreadBps: 2, latencyBars: 0,
    ...extra };
  const result = run(data, { policy, start: interval[0], end: interval[1],
    entrySignalsBySymbol: signals(data, model, cutoff, interval, policy.latencyBars),
    management: "fixed", directions: ["LONG", "SHORT"],
    leverage: 5, maxMarginFractionPerPosition: .35 });
  return { metrics: result.metrics, trades: result.trades.length,
    skipped: result.skipped, halted: result.halted,
    bySymbol: result.breakdown.symbol, byMonth: result.breakdown.period,
    meanMinutes: result.trades.length ? result.trades.reduce((s, t) =>
      s + (t.exitTime - t.entryTime) / 60000, 0) / result.trades.length : null };
}
function main() {
  discover();
  const model = fit(rows.train);
  const cutoff = .62;
  const prepared = datasets.map(d => prepare(d, .8, { adxThreshold: 22,
    bollingerSigma: 1.8 }));
  const spans = { train: [starts.train, starts.validation],
    validation: [starts.validation, starts.holdout],
    holdout: [starts.holdout, starts.end] };
  const result = { schema: 1, sourceManifest: "scalping-six-month-manifest.json",
    generatedAt: new Date().toISOString(), labelSpec, cutoff,
    costs: { feeRate: .0005, slippageBps: 5, spreadBps: 2,
      note: "historical funding in replay; historical spread/depth unavailable" },
    sampleEveryBars: 3, splits: spans, featureNames: NAMES,
    model, labels: labelSummary, diagnostics: {}, replay: {} };
  for (const segment of Object.keys(spans)) {
    console.log("REPLAY", segment);
    result.diagnostics[segment] = diagnostics(rows[segment], model, cutoff);
    result.replay[segment] = replay(prepared, model, cutoff, spans[segment]);
  }
  result.replay.stress = replay(prepared, model, cutoff, spans.holdout,
    { feeRate: .001, slippageBps: 10, spreadBps: 4 });
  result.replay.delay = replay(prepared, model, cutoff, spans.holdout,
    { latencyBars: 1 });
  fs.writeFileSync(path.join(root, "inverse-market-results.json"),
    JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ model, diagnostics: result.diagnostics,
    replay: Object.fromEntries(Object.entries(result.replay).map(([k,v]) =>
      [k, { metrics: v.metrics, trades: v.trades, meanMinutes: v.meanMinutes }])) }, null, 2));
}
if (require.main === module) main();
module.exports = { outcomes, fit, diagnostics, replay };
