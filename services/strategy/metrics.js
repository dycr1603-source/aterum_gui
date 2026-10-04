"use strict";
const sum = (a) => a.reduce((s, x) => s + x, 0),
  avg = (a) => (a.length ? sum(a) / a.length : 0);
function drawdown(equity) {
  let peak = equity[0] || 0,
    max = 0,
    amount = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    amount = Math.max(amount, peak - e);
    max = Math.max(max, peak > 0 ? (peak - e) / peak : 0);
  }
  return { fraction: max, amount };
}
function metrics(
  trades,
  initialCapital = 1000,
  equityPoints = null,
  start = null,
  end = null,
) {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime),
    nets = sorted.map((t) => t.net),
    wins = nets.filter((x) => x > 0),
    losses = nets.filter((x) => x < 0);
  const curve = [initialCapital];
  for (const n of nets) curve.push(curve.at(-1) + n);
  const dd = drawdown(equityPoints ? equityPoints.map((p) => p.equity) : curve);
  let dailyReturns = [];
  if (start !== null && end !== null) {
    const daily = new Map();
    for (const p of equityPoints || [])
      daily.set(Math.floor((p.time - 1) / 86400000), p.equity);
    let previous = initialCapital,
      idx = 0,
      closed = initialCapital;
    for (
      let day = Math.floor(start / 86400000);
      day <= Math.floor((end - 1) / 86400000);
      day++
    ) {
      while (
        idx < sorted.length &&
        sorted[idx].exitTime <= (day + 1) * 86400000
      )
        closed += sorted[idx++].net;
      const value = daily.get(day) ?? closed;
      dailyReturns.push(previous > 0 ? value / previous - 1 : 0);
      previous = value;
    }
  }
  const m = avg(dailyReturns),
    sd =
      dailyReturns.length > 1
        ? Math.sqrt(
            sum(dailyReturns.map((x) => (x - m) ** 2)) /
              (dailyReturns.length - 1),
          )
        : 0,
    down = Math.sqrt(avg(dailyReturns.map((x) => Math.min(0, x) ** 2)));
  const grossProfit = sum(sorted.map((t) => Math.max(0, t.gross))),
    grossLoss = -sum(sorted.map((t) => Math.min(0, t.gross))),
    netProfit = sum(nets),
    netLoss = -sum(losses);
  return {
    available: trades.length > 0,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: nets.filter((x) => x === 0).length,
    winRate: trades.length ? wins.length / trades.length : 0,
    grossProfit,
    grossLoss,
    netProfit,
    fees: sum(sorted.map((t) => t.fees)),
    funding: sum(sorted.map((t) => t.funding || 0)),
    profitFactor: netLoss ? sum(wins) / netLoss : null,
    profitFactorUnbounded: !netLoss && wins.length > 0,
    expectancy: avg(nets),
    averageR: sorted.some((t) => Number.isFinite(t.r))
      ? avg(sorted.map((t) => t.r).filter(Number.isFinite))
      : null,
    maxDrawdown: dd.fraction,
    maxDrawdownAmount: dd.amount,
    drawdownBasis: equityPoints ? "marked equity" : "closed trades",
    sharpe: sd ? (m / sd) * Math.sqrt(365) : null,
    sortino: down ? (m / down) * Math.sqrt(365) : null,
    returnFraction: netProfit / initialCapital,
    topTwoWinnerShare:
      sum([...wins].sort((a, b) => b - a).slice(0, 2)) / (sum(wins) || 1),
  };
}
function groups(trades, key, capital = 1000) {
  const out = {};
  for (const t of trades) {
    const k = String(
      typeof key === "function" ? key(t) : (t[key] ?? "UNKNOWN"),
    );
    (out[k] ??= []).push(t);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, metrics(v, capital)]),
  );
}
function confidenceBucket(t) {
  if (!Number.isFinite(t.confidence)) return "UNRECORDED";
  const c = t.confidence;
  return c < 50
    ? "below 50"
    : c >= 90
      ? "90+"
      : `${Math.floor(c / 10) * 10}-${Math.floor(c / 10) * 10 + 10}`;
}
function breakdown(trades, capital) {
  return {
    side: groups(trades, "side", capital),
    symbol: groups(trades, "symbol", capital),
    timeframe: groups(trades, "timeframe", capital),
    regime: groups(trades, "regime", capital),
    period: groups(
      trades,
      (t) => new Date(t.exitTime).toISOString().slice(0, 7),
      capital,
    ),
    confidence: groups(trades, confidenceBucket, capital),
    leverage: groups(trades, "leverage", capital),
    combination: groups(
      trades,
      (t) => t.pair?.join(" + ") || "LEGACY",
      capital,
    ),
  };
}
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function monteCarlo(
  trades,
  {
    initialCapital = 1000,
    iterations = 1000,
    seed = 1,
    riskFraction = 0.005,
    streak = 10,
  } = {},
) {
  const rng = random(seed),
    dds = [],
    finals = [];
  let extended = 0;
  const rs = trades.map((t) => t.r);
  if (!rs.length) return { available: false, reason: "NO_TRADES" };
  for (let k = 0; k < iterations; k++) {
    const ordered = [...rs];
    for (let j = ordered.length - 1; j > 0; j--) {
      const i = Math.floor(rng() * (j + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
    let eq = initialCapital,
      run = 0,
      longest = 0;
    const curve = [eq];
    for (const r of ordered) {
      eq *= Math.max(0, 1 + r * riskFraction);
      curve.push(eq);
      run = r < 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    dds.push(drawdown(curve).fraction);
    finals.push(eq);
    if (longest >= streak) extended++;
  }
  const quant = (a, q) =>
    [...a].sort((x, y) => x - y)[
      Math.min(a.length - 1, Math.floor(q * (a.length - 1)))
    ];
  const p95 = quant(dds, 0.95);
  return {
    available: true,
    method:
      "seeded permutation of net R; compounded fixed fractional risk; no independence claim",
    iterations,
    seed,
    riskFraction,
    expectedDrawdown: avg(dds),
    p95Drawdown: p95,
    worstDrawdown: Math.max(...dds),
    extendedLosingStreak: streak,
    probabilityExtendedLosingStreak: extended / iterations,
    equityDistribution: {
      p05: quant(finals, 0.05),
      median: quant(finals, 0.5),
      p95: quant(finals, 0.95),
    },
    equityDistributionNote:
      "Permutation preserves terminal compounded equity; distribution is degenerate by construction. Drawdown and streaks change.",
  };
}
module.exports = {
  metrics,
  groups,
  breakdown,
  drawdown,
  monteCarlo,
  random,
  confidenceBucket,
};
