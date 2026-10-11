"use strict";
// Two-stage search: cheap closed-candle entry/exit screen on training only,
// then full portfolio replay on validation. Holdout is read once after freeze.
const fs = require("node:fs");
const path = require("node:path");
const { prepare, run } = require("../../services/strategy/backtest");
const { inputs, assess, MODELS } = require("../../services/strategy/scalp_model");
const { contentHash } = require("./download");
const root = path.resolve(__dirname, "../../.local/strategy-v2");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scalping-six-month-manifest.json")));
if (manifest.datasets.length !== 12 || manifest.rejected.length)
  throw Error("SIX_MONTH_MARKET_DATA_INCOMPLETE");
const day = 86400000, start = manifest.start;
const splits = { train: [start, start + 100 * day],
  validation: [start + 100 * day, start + 140 * day],
  holdout: [start + 140 * day, manifest.end] };
const policy = { ...require("../../config/strategy-v2.json"), initialCapital: 1000,
  maxPositions: 3, maxDrawdown: .15, riskFraction: .22,
  maxPortfolioRisk: .44, feeRate: .0005, slippageBps: 5,
  spreadBps: 2, fundingReserve: .001, latencyBars: 0,
  minQuoteVolume: 5e6 };
const data = manifest.datasets.map(m => {
  const d = JSON.parse(fs.readFileSync(path.join(root, m.file)));
  if (d.contentHash !== m.contentHash || contentHash(d) !== m.contentHash)
    throw Error(`SCALPING_CHECKSUM_${m.symbol}`);
  const prepared = prepare(d, .8, { adxThreshold: 22, bollingerSigma: 1.8 });
  prepared.scalpInputs = inputs(prepared.bars, prepared.features);
  return prepared;
});

const entries = [];
const extended = process.env.SCALP_HORIZON === "extended";
for (const model of MODELS)
  for (const threshold of [.5, 1, 1.5])
    for (const volumeMin of [.8, 1.2, 1.8])
      for (const regime of ["ALL", "TRENDING", "RANGE"])
        for (const session of ["ALL", "EUROPE", "US"])
          entries.push({ model, threshold, volumeMin, regime, session });
const exits = [];
for (const stopAtr of extended ? [1.5, 2.5] : [1, 1.5])
  for (const targetR of extended ? [2, 3, 4] : [1.5, 2, 3])
    for (const maxBars of extended ? [12, 36, 72] : [6, 12, 24])
      exits.push({ stopAtr, targetR, maxBars });
const maxLookaheadBars = Math.max(...exits.map(x => x.maxBars)) + 3;

function candidateSignals(entry, interval) {
  return data.map(d => {
    const list = [];
    for (let i = 100; i < d.bars.length - maxLookaheadBars; i++) {
      const time = d.bars[i].time;
      if (time < interval[0] || time + maxLookaheadBars * 300000 >= interval[1]) continue;
      const proposal = assess(d.scalpInputs[i], entry);
      if (proposal) list.push({ i, sign: proposal.side === "LONG" ? 1 : -1,
        score: proposal.score, regime: d.scalpInputs[i].regime });
    }
    return list;
  });
}

// Fixed-notional training proxy. Not a portfolio return: full replay below
// enforces simultaneous slots, compounding, margin, drawdown and liquidation.
function screen(signals, exit) {
  let trades = 0, net = 0, wins = 0, profit = 0, loss = 0;
  const fee = policy.feeRate, slip = (policy.slippageBps + policy.spreadBps / 2) / 10000;
  for (let a = 0; a < data.length; a++) {
    const bars = data[a].bars, rows = data[a].scalpInputs;
    let available = -1;
    for (const s of signals[a]) {
      if (s.i < available) continue;
      const entryIndex = s.i + 1, first = bars[entryIndex];
      const entry = first.open * (1 + s.sign * slip);
      const distance = rows[s.i].atr * exit.stopAtr;
      const stop = entry - s.sign * distance;
      const costs = entry * (2 * (fee + slip) + policy.fundingReserve);
      const target = entry + s.sign * Math.max(distance * exit.targetR,
        distance * 1.1 + costs * 2.1);
      let realized = null, last = entryIndex;
      for (let j = entryIndex; j < Math.min(bars.length, entryIndex + exit.maxBars); j++) {
        const bar = bars[j]; last = j;
        const hitStop = s.sign > 0 ? bar.low <= stop : bar.high >= stop;
        const hitTarget = s.sign > 0 ? bar.high >= target : bar.low <= target;
        if (hitStop) { realized = s.sign > 0 ? Math.min(bar.open, stop) : Math.max(bar.open, stop); break; }
        if (hitTarget) { realized = target; break; }
      }
      if (realized === null) realized = bars[last].close;
      const exitPrice = realized * (1 - s.sign * slip);
      const ret = (s.sign * (exitPrice - entry) - fee * (entry + exitPrice)) / entry;
      net += ret; trades++;
      if (ret > 0) { profit += ret; wins++; } else loss -= ret;
      available = last + 1;
    }
  }
  return { trades, netNotional: net, meanNetBps: trades ? 10000 * net / trades : null,
    winRate: trades ? wins / trades : null,
    profitFactor: loss ? profit / loss : profit ? Infinity : 0 };
}
const screenScore = m => m.trades >= 40 ?
  m.netNotional / Math.sqrt(m.trades) + .00001 * Math.min(m.trades, 200) : -Infinity;

function replay(candidate, interval, extra = {}) {
  const fast = { stopAtr: candidate.exit.stopAtr, targetR: candidate.exit.targetR,
    maxHours: candidate.exit.maxBars / 12, structureBars: 6,
    minNetR: 1.1, reversal: 0, earlyLoss: false, staleHours: 0 };
  const r = run(data, { policy: { ...policy, ...extra }, start: interval[0],
    end: interval[1], entryMode: "scalp", scalp: candidate.entry,
    management: candidate.management || "fixed", fast,
    directions: ["LONG", "SHORT"],
    leverage: candidate.leverage || 5,
    maxMarginFractionPerPosition: candidate.maxMarginFractionPerPosition ?? .35 });
  const durations = r.trades.map(t => (t.exitTime - t.entryTime) / 60000).sort((a,b) => a-b);
  return { metrics: { ...r.metrics, meanMinutes: durations.length ?
    durations.reduce((a,b) => a+b, 0) / durations.length : null,
    medianMinutes: durations.length ? durations[Math.floor(durations.length/2)] : null,
    halted: r.halted, skipped: r.skipped },
    bySymbol: r.breakdown?.symbol || null,
    byMonth: r.breakdown?.period || null,
    byRegime: r.breakdown?.regime || null };
}

function main() {
  console.log("DATA", data.length, data[0].bars.length,
    new Date(start).toISOString(), new Date(manifest.end).toISOString());
  const screened = [];
  for (const [index, entry] of entries.entries()) {
    const signals = candidateSignals(entry, splits.train);
    for (const exit of exits) {
      const train = screen(signals, exit);
      screened.push({ entry, exit, train, score: screenScore(train) });
    }
    if ((index + 1) % 81 === 0) console.log("SCREEN", index + 1, entries.length);
  }
  screened.sort((a,b) => b.score - a.score);
  const shortlist = [];
  const byModel = new Map();
  for (const row of screened) {
    if (!Number.isFinite(row.score)) break;
    const n = byModel.get(row.entry.model) || 0;
    if (n >= 3) continue;
    shortlist.push(row); byModel.set(row.entry.model, n+1);
    if (shortlist.length === 24) break;
  }
  const variants = shortlist.flatMap(row => [
    { ...row, management: "fixed" },
    { ...row, management: "existing" },
  ]);
  for (const row of variants) {
    row.fullTrain = replay(row, splits.train);
    row.validation = replay(row, splits.validation);
    console.log("VALIDATION", row.entry.model, row.management, row.entry.threshold,
      row.exit.targetR, row.validation.metrics.netProfit);
  }
  const rank = x => {
    const train = x.fullTrain.metrics, val = x.validation.metrics;
    if (train.trades < 20 || val.trades < 8) return -Infinity;
    return val.netProfit - 1.5 * val.maxDrawdownAmount +
      .2 * (train.netProfit - train.maxDrawdownAmount);
  };
  variants.sort((a,b) => rank(b) - rank(a));
  const seenModels = new Set(), top = [];
  for (const row of variants) {
    if (seenModels.has(row.entry.model)) continue;
    top.push(row); seenModels.add(row.entry.model);
    if (top.length === 5) break;
  }
  for (const row of top) {
    row.holdout = replay(row, splits.holdout);
    row.stress = replay(row, splits.holdout,
      { feeRate: .001, slippageBps: 10, spreadBps: 4 });
    row.delayed = replay(row, splits.holdout, { latencyBars: 1 });
  }
  const result = { schema: 1, generatedAt: new Date().toISOString(),
    sourceManifest: "scalping-six-month-manifest.json", splits,
    horizon: extended ? "extended" : "fast",
    assumptions: { initialCapital: 1000, feePerSide: .0005,
      slippageBpsPerLeg: 5, spreadBpsRoundTrip: 2,
      funding: "historical in full replay; reserve in screen",
      leverage: 5, maxPositions: 3, maxMarginFraction: .9,
      maxPerPosition: .35, selection: "training screen then validation full portfolio; holdout after freeze",
      latencyBars: 0, delayedStressBars: 1,
      historicalJev: "unavailable; not reproduced", historicalSpread: "not available" },
    counts: { entryVariants: entries.length, exitVariants: exits.length,
      screened: screened.length, fullValidation: variants.length,
      finalHoldout: top.length },
    screeningTop: screened.slice(0, 100), shortlist: variants, top,
    selected: top[0] || null,
    robust: Boolean(top[0]?.holdout.metrics.netProfit > 0 &&
      top[0]?.stress.metrics.netProfit > 0 &&
      top[0]?.holdout.metrics.profitFactor > 1 &&
      top[0]?.holdout.metrics.maxDrawdown < .15 &&
      top[0]?.holdout.metrics.trades >= 20) };
  fs.writeFileSync(path.join(root, extended ?
    "scalping-six-month-results-extended.json" : "scalping-six-month-results.json"),
    JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ counts: result.counts, robust: result.robust,
    top: top.map(x => ({ entry: x.entry, exit: x.exit,
      management: x.management,
      train: x.fullTrain.metrics, validation: x.validation.metrics,
      holdout: x.holdout.metrics, stress: x.stress.metrics,
      delayed: x.delayed.metrics })) }, null, 2));
}
if (require.main === module) main();
module.exports = { candidateSignals, screen, splits, replay, data, policy };
