"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { pairs } = require("../../services/strategy/indicators"),
  {
    prepare,
    run,
    unitTrades,
    portfolio,
  } = require("../../services/strategy/backtest"),
  {
    metrics,
    breakdown,
    monteCarlo,
  } = require("../../services/strategy/metrics");
const root = path.resolve(__dirname, "../../.local/strategy-v2"),
  policy = require("../../config/strategy-v2.json");
const { contentHash } = require("./download");
function readDataset(file) {
  const d = JSON.parse(fs.readFileSync(file));
  if (d.contentHash && d.contentHash !== contentHash(d))
    throw Error("HISTORY_CHECKSUM_MISMATCH");
  return d;
}
const compact = (r) => ({
  metrics: r.metrics,
  breakdown: r.breakdown,
  halted: r.halted,
  skipped: r.skipped,
});
function eligible(r, p = policy) {
  const m = r.metrics,
    s = Object.values(r.breakdown.symbol),
    periods = Object.values(r.breakdown.period);
  return {
    passed:
      m.trades >= p.minTrades &&
      m.expectancy > 0 &&
      (m.profitFactor > 1 || m.profitFactorUnbounded) &&
      m.maxDrawdown < p.maxDrawdown &&
      m.returnFraction > m.maxDrawdown &&
      m.topTwoWinnerShare <= p.maxWinnerConcentration &&
      s.length >= 3 &&
      s.filter((x) => x.expectancy > 0).length / s.length >=
        p.minProfitableSymbolFraction &&
      periods.length >= 2 &&
      periods.filter((x) => x.netProfit > 0).length / periods.length >= 0.6 &&
      !r.halted,
    criteria: {
      sample: m.trades >= p.minTrades,
      netEdge:
        m.expectancy > 0 && (m.profitFactor > 1 || m.profitFactorUnbounded),
      drawdown:
        m.maxDrawdown < p.maxDrawdown && m.returnFraction > m.maxDrawdown,
      concentration: m.topTwoWinnerShare <= p.maxWinnerConcentration,
      assets:
        s.length >= 3 &&
        s.filter((x) => x.expectancy > 0).length / s.length >=
          p.minProfitableSymbolFraction,
      periods:
        periods.length >= 2 &&
        periods.filter((x) => x.netProfit > 0).length / periods.length >= 0.6,
      breaker: !r.halted,
    },
  };
}
const score = (r) =>
  r.metrics.trades >= policy.minTrades
    ? r.metrics.netProfit / (1 + r.metrics.maxDrawdown * 10)
    : -1e100;
async function main() {
  const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "manifest.json")),
    ),
    raw = manifest.datasets
      .filter((d) => d.purpose === "research")
      .map((d) => readDataset(path.join(root, d.file)));
  if (raw.length < 6) throw Error("INSUFFICIENT_RESEARCH_DATA");
  const start = Math.max(...raw.map((d) => d.start)),
    end = Math.min(...raw.map((d) => d.end)),
    span = end - start,
    cut = (f) => Math.floor((start + span * f) / 14400000) * 14400000;
  const splits = {
    train: [start, cut(0.6)],
    validation: [cut(0.6), cut(0.8)],
    outOfSample: [cut(0.8), end],
  };
  const prepared = new Map();
  function datasets(tf, scale = 1) {
    const key = `${tf}:${scale}`;
    if (!prepared.has(key))
      prepared.set(
        key,
        raw.filter((d) => d.timeframe === tf).map((d) => prepare(d, scale)),
      );
    return prepared.get(key);
  }
  function evaluate(candidate, range, costPolicy = policy) {
    return run(datasets(candidate.timeframe, candidate.scale), {
      ...candidate,
      policy: costPolicy,
      start: range[0],
      end: range[1],
    });
  }
  const candidates = [];
  for (const timeframe of ["1h", "4h"])
    for (const pair of pairs()) {
      const c = {
          pair,
          timeframe,
          scale: 1,
          management: "existing",
          directions: ["LONG", "SHORT"],
        },
        r = evaluate(c, splits.train);
      candidates.push({
        ...c,
        train: compact(r),
        trainAcceptance: eligible(r),
      });
    }
  candidates.sort((a, b) => score(b.train) - score(a.train));
  console.log("Pair screening complete:", candidates.length);
  // All optimizations are confined to TRAIN. Validation only checks frozen candidates.
  const shortlist = [];
  for (const candidate of candidates.slice(0, 5)) {
    const variants = [];
    for (const scale of [0.8, 1, 1.2])
      for (const management of [
        "fixed",
        "breakeven",
        "partial",
        "trail",
        "lock",
        "existing",
      ]) {
        const c = {
            pair: candidate.pair,
            timeframe: candidate.timeframe,
            scale,
            management,
            directions: ["LONG", "SHORT"],
          },
          r = evaluate(c, splits.train);
        variants.push({
          ...c,
          train: compact(r),
          trainAcceptance: eligible(r),
        });
      }
    variants.sort((a, b) => score(b.train) - score(a.train));
    const best = variants[0];
    // Direction exclusion is learned on train only; no future LONG/SHORT cherry-picking.
    const directions = ["LONG", "SHORT"].filter(
      (s) =>
        best.train.breakdown.side[s]?.trades >= policy.minTrades &&
        best.train.breakdown.side[s]?.expectancy > 0,
    );
    if (directions.length) best.directions = directions;
    const train = evaluate(best, splits.train),
      validation = evaluate(best, splits.validation),
      neighbors = [0.8, 1, 1.2].map((scale) => ({
        scale,
        ...compact(evaluate({ ...best, scale }, splits.train)),
      }));
    const plateau =
      neighbors.filter(
        (r) => r.metrics.expectancy > 0 && r.metrics.trades >= policy.minTrades,
      ).length >= 2;
    shortlist.push({
      ...best,
      train: compact(train),
      trainAcceptance: eligible(train),
      validation: compact(validation),
      validationAcceptance: eligible(validation),
      plateau,
      neighbors,
      managementEvaluation: variants.map((v) => ({
        scale: v.scale,
        management: v.management,
        metrics: v.train.metrics,
      })),
    });
  }
  const robust = shortlist
    .filter(
      (c) =>
        c.trainAcceptance.passed && c.validationAcceptance.passed && c.plateau,
    )
    .sort((a, b) => score(b.validation) - score(a.validation));
  // Exactly one candidate reaches untouched OOS. If none qualify, diagnostic winner
  // remains explicitly rejected and cannot become a promoted strategy.
  const frozen = robust[0] || shortlist[0],
    oos = evaluate(frozen, splits.outOfSample),
    wf = [];
  for (let fold = 0; fold < 4; fold++) {
    const trainRange = [start, cut(0.4 + fold * 0.1)],
      testRange = [trainRange[1], cut(0.5 + fold * 0.1)];
    const ranked = candidates
      .map((c) => ({
        candidate: {
          pair: c.pair,
          timeframe: c.timeframe,
          scale: 1,
          management: "existing",
          directions: ["LONG", "SHORT"],
        },
        result: evaluate(c, trainRange),
      }))
      .sort((a, b) => score(b.result) - score(a.result));
    const chosen = ranked.find((c) => eligible(c.result).passed);
    const tested = chosen ? evaluate(chosen.candidate, testRange) : null;
    wf.push({
      fold,
      trainRange,
      testRange,
      selected: chosen?.candidate || null,
      train: chosen ? compact(chosen.result) : null,
      test: tested ? compact(tested) : null,
      trades: tested?.trades || [],
      reason: chosen ? "TRAIN_SELECTED" : "NO_TRAIN_QUALIFIER",
    });
    console.log("Walk-forward fold", fold, chosen?.candidate.pair || "none");
  }
  const wfTrades = wf.flatMap((f) => f.trades),
    mc = monteCarlo(oos.trades, {
      initialCapital: policy.initialCapital,
      iterations: policy.monteCarloIterations,
      seed: policy.seed,
      riskFraction: policy.riskFraction,
      streak: policy.maxLossStreak,
    });
  const stressed = evaluate(frozen, splits.outOfSample, {
    ...policy,
    feeRate: policy.feeRate * 1.5,
    slippageBps: policy.slippageBps * 2,
  });
  const wfPositive =
    wf.every((f) => f.test && f.test.metrics.expectancy > 0) &&
    wfTrades.length >= policy.minTrades;
  const accepted =
    robust.length > 0 &&
    eligible(oos).passed &&
    wfPositive &&
    mc.available &&
    mc.p95Drawdown < policy.maxDrawdown &&
    stressed.metrics.expectancy > 0;
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    policy,
    splits,
    manifest,
    methodology: {
      signal: "Exactly two indicators; closed candles only",
      execution:
        "Next open after one full latency bar; stop first if both barriers touched; adverse gaps and 5 bps per leg",
      costs:
        "0.1% fee each leg conservative existing project floor; actual historical funding at exchange timestamps, exit-bar debits reserved, uncertain credits excluded; fees are assumptions, not verified account commission",
      portfolio:
        "Shared capital, 1x research leverage, risk 0.5%, max three simultaneous positions, margin budget 90%, latched drawdown/loss breaker",
      drawdown:
        "Candle-close marked equity incl estimated exit fees and elapsed funding; intrabar liquidation/orderbook effects not reconstructed",
      management:
        "Production planProtection loaded verbatim for existing; other modes explicit ablations",
      selection:
        "60/20/20 chronological split, flat each boundary, train-only direction/management/scale selection, validation nomination, one OOS evaluation, four expanding walk-forward folds before OOS",
      confidence:
        "Historical JEV is not regenerated; technical experiment does not measure JEV predictive power",
      limitations: [
        "Point-in-time universe/delisted contracts not fully reconstructed",
        "Historical spread and depth unavailable; slippage stress is an assumption",
        "Candle latency is conservative, not a latency calibration",
        "Permutation Monte Carlo cannot model new loss magnitudes or regime shifts",
        "OOS seen once; rerunning selection requires a new untouched holdout",
      ],
    },
    candidates,
    shortlist,
    frozenCandidate: {
      pair: frozen.pair,
      timeframe: frozen.timeframe,
      scale: frozen.scale,
      management: frozen.management,
      directions: frozen.directions,
    },
    selectionStatus: accepted ? "TECHNICAL_CANDIDATE_ONLY" : "REJECTED",
    selected: accepted
      ? {
          pair: frozen.pair,
          timeframe: frozen.timeframe,
          scale: frozen.scale,
          management: frozen.management,
          directions: frozen.directions,
        }
      : null,
    outOfSample: { ...compact(oos), acceptance: eligible(oos) },
    walkForward: {
      folds: wf.map(({ trades, ...r }) => r),
      metrics: metrics(wfTrades, policy.initialCapital),
      positive: wfPositive,
    },
    monteCarlo: mc,
    stress: compact(stressed),
    promotion: {
      allowed: false,
      reasons: accepted
        ? [
            "JEV_OUT_OF_SAMPLE_UNVALIDATED",
            "EXECUTION_COSTS_UNCALIBRATED",
            "POINT_IN_TIME_UNIVERSE_INCOMPLETE",
          ]
        : ["NO_ROBUST_CONFIGURATION"],
    },
  };
  const baseline = JSON.parse(
      fs.readFileSync(path.join(root, "baseline.json")),
    ),
    comparisonData = manifest.datasets
      .filter((d) => d.purpose === "comparison")
      .map((d) => {
        const data = readDataset(path.join(root, d.file));
        if (frozen.timeframe === "4h") {
          const bars = [];
          for (let i = 0; i < data.bars.length; i += 4) {
            const chunk = data.bars.slice(i, i + 4);
            if (chunk.length < 4) break;
            bars.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map((b) => b.high)),
              low: Math.min(...chunk.map((b) => b.low)),
              close: chunk.at(-1).close,
              volume: chunk.reduce((s, b) => s + b.volume, 0),
              quoteVolume: chunk.reduce((s, b) => s + b.quoteVolume, 0),
            });
          }
          data.bars = bars;
          data.timeframe = "4h";
          data.intervalMs = 14400000;
        }
        return prepare(data, frozen.scale);
      });
  const grid = frozen.timeframe === "4h" ? 14400000 : 3600000;
  const cs =
      Math.floor(
        Math.min(...baseline.trades.map((t) => Date.parse(t.opened_at))) / grid,
      ) * grid,
    ce =
      Math.ceil(
        Math.max(...baseline.trades.map((t) => Date.parse(t.closed_at))) / grid,
      ) * grid;
  const oldUnits = [];
  for (const d of comparisonData) {
    const entries = new Map();
    for (const t of baseline.trades.filter((t) => t.symbol === d.symbol)) {
      const time =
        (Math.floor(Date.parse(t.opened_at) / d.intervalMs) +
          1 +
          policy.latencyBars) *
        d.intervalMs;
      entries.set(time, {
        side: t.direction,
        stop: Number(t.initial_sl_price || t.sl_price),
        target: Number(t.tp_price),
      });
    }
    oldUnits.push(
      ...unitTrades(d, {
        ...frozen,
        pair: null,
        entrySignals: entries,
        start: cs,
        end: ce,
        policy,
        management: "existing",
        directions: ["LONG", "SHORT"],
      }),
    );
  }
  const comparisonPolicy = { ...policy },
    old = portfolio(oldUnits, comparisonData, {
      policy: comparisonPolicy,
      start: cs,
      end: ce,
    }),
    next = run(comparisonData, {
      ...frozen,
      policy: comparisonPolicy,
      start: cs,
      end: ce,
    });
  report.comparison = {
    period: [cs, ce],
    symbols: comparisonData.map((d) => d.symbol),
    capital: policy.initialCapital,
    old: compact(old),
    new: compact(next),
    label: `OLD archived entry replay vs NEW technical signal replay; ${frozen.timeframe} common execution grid`,
    fullOldNewValidated: false,
    limitations: [
      "Old replay uses recorded entries and levels, not unavailable historical model calls, vetoes or learning state",
      "New uses diagnostic candidate if none qualify; comparison period overlaps model selection",
      "Both share assets, capital, fees, funding, risk, latency and production trailing only for old; NEW uses frozen management",
      "Missing-history symbols excluded from BOTH sides and listed in manifest",
    ],
    recordedBaseline: {
      trades: baseline.trades.length,
      reportedPnl: baseline.trades.reduce((s, t) => s + Number(t.pnl_usdt), 0),
      netAudited: false,
      reason: "Historical closes have no fee/funding columns",
    },
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(report))
    .digest("hex");
  report.reportId = digest;
  fs.mkdirSync(path.resolve(__dirname, "../../docs/strategy"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(__dirname, "../../docs/strategy/results.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "oos-trades.json"),
    JSON.stringify(oos.trades, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        reportId: digest,
        status: report.selectionStatus,
        candidate: report.frozenCandidate,
        oos: report.outOfSample.metrics,
        comparison: report.comparison.recordedBaseline,
      },
      null,
      2,
    ),
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { eligible };
