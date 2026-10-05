"use strict";
// All values at index i use closed bars <= i. Warm-up is never backfilled.
const CATEGORIES = Object.freeze({
  EMA: "TREND",
  SUPERTREND: "TREND",
  ADX: "TREND",
  MACD: "TREND",
  RSI: "MOMENTUM",
  STOCH_RSI: "MOMENTUM",
  ATR: "VOLATILITY",
  BOLLINGER: "VOLATILITY",
  VWAP: "VOLUME",
  RVOL: "VOLUME",
});
const DIRECTIONAL = Object.freeze([
  "EMA", "SUPERTREND", "ADX", "MACD", "RSI", "STOCH_RSI", "BOLLINGER", "VWAP",
]);
const CONTEXTUAL = Object.freeze(["ATR", "RVOL"]);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function smooth(a, n, wilder = false) {
  const out = Array(a.length).fill(null),
    k = wilder ? 1 / n : 2 / (n + 1);
  let seed = [];
  let prev = null;
  a.forEach((x, i) => {
    if (!Number.isFinite(x)) return;
    if (prev === null) {
      seed.push(x);
      if (seed.length === n) prev = mean(seed);
    } else prev += k * (x - prev);
    out[i] = prev;
  });
  return out;
}
function validateBars(bars, intervalMs) {
  if (!Array.isArray(bars) || bars.length < 60)
    throw Error("INSUFFICIENT_HISTORY");
  bars.forEach((b, i) => {
    if (
      !["time", "open", "high", "low", "close", "volume", "quoteVolume"].every(
        (k) => Number.isFinite(b[k]),
      ) ||
      b.low <= 0 ||
      b.volume < 0 ||
      b.quoteVolume < 0 ||
      b.high < Math.max(b.open, b.close) ||
      b.low > Math.min(b.open, b.close) ||
      b.high < b.low ||
      (i &&
        (b.time <= bars[i - 1].time ||
          (intervalMs && b.time - bars[i - 1].time !== intervalMs)))
    )
      throw Error("INVALID_MARKET_DATA");
  });
}
function calculate(bars, scale = 1, { adxThreshold = 25, bollingerSigma = 2 } = {}) {
  validateBars(bars);
  const p = (n) => Math.max(2, Math.round(n * scale)),
    c = bars.map((b) => b.close),
    n = p(14);
  const tr = bars.map((b, i) =>
    i
      ? Math.max(
          b.high - b.low,
          Math.abs(b.high - c[i - 1]),
          Math.abs(b.low - c[i - 1]),
        )
      : b.high - b.low,
  );
  const atr = smooth(tr, n, true),
    fast = smooth(c, p(8)),
    slow = smooth(c, p(21));
  const gains = c.map((v, i) => (i ? Math.max(0, v - c[i - 1]) : null)),
    losses = c.map((v, i) => (i ? Math.max(0, c[i - 1] - v) : null));
  const g = smooth(gains, n, true),
    l = smooth(losses, n, true),
    rsi = g.map((v, i) =>
      v === null
        ? null
        : v === 0 && l[i] === 0
          ? 50
          : l[i] === 0
            ? 100
            : 100 - 100 / (1 + v / l[i]),
    );
  const plus = smooth(
    bars.map((b, i) => {
      if (!i) return 0;
      const up = b.high - bars[i - 1].high,
        down = bars[i - 1].low - b.low;
      return up > down && up > 0 ? up : 0;
    }),
    n,
    true,
  );
  const minus = smooth(
    bars.map((b, i) => {
      if (!i) return 0;
      const up = b.high - bars[i - 1].high,
        down = bars[i - 1].low - b.low;
      return down > up && down > 0 ? down : 0;
    }),
    n,
    true,
  );
  const dx = plus.map((v, i) =>
      v === null
        ? null
        : v + minus[i] === 0
          ? 0
          : (100 * Math.abs(v - minus[i])) / (v + minus[i]),
    ),
    adx = smooth(dx, n, true);
  const mfast = smooth(c, p(12)),
    mslow = smooth(c, p(26)),
    macd = mfast.map((v, i) =>
      v === null || mslow[i] === null ? null : v - mslow[i],
    ),
    msig = smooth(macd, p(9));
  let upper = null,
    lower = null,
    st = null;
  return bars.map((b, i) => {
    const window = bars.slice(Math.max(0, i - p(20) + 1), i + 1),
      prices = window.map((x) => x.close),
      mid = mean(prices),
      sd = Math.sqrt(mean(prices.map((x) => (x - mid) ** 2)));
    const vw =
      window.reduce(
        (s, x) => s + ((x.high + x.low + x.close) / 3) * x.volume,
        0,
      ) / window.reduce((s, x) => s + x.volume, 0);
    const prior = bars.slice(Math.max(0, i - p(20)), i),
      avgVol = prior.length ? mean(prior.map((x) => x.volume)) : 0;
    const rs = rsi.slice(Math.max(0, i - n + 1), i + 1).filter(Number.isFinite),
      rmin = Math.min(...rs),
      rmax = Math.max(...rs);
    const stochastic =
      rs.length === n
        ? rmax === rmin
          ? 50
          : (100 * (rsi[i] - rmin)) / (rmax - rmin)
        : null;
    if (atr[i] !== null) {
      const bu = (b.high + b.low) / 2 + 3 * atr[i],
        bl = (b.high + b.low) / 2 - 3 * atr[i];
      const pu = upper,
        pl = lower;
      upper = pu === null || bu < pu || c[i - 1] > pu ? bu : pu;
      lower = pl === null || bl > pl || c[i - 1] < pl ? bl : pl;
      st =
        st === null
          ? upper
          : st === pu
            ? b.close > upper
              ? lower
              : upper
            : b.close < lower
              ? upper
              : lower;
    }
    const directional = (v) => (v > 0 ? "LONG" : v < 0 ? "SHORT" : "NEUTRAL");
    const atrPrior = atr.slice(Math.max(0, i - 20), i).filter(Number.isFinite),
      atrRatio = atrPrior.length ? atr[i] / mean(atrPrior) : null;
    const signals = {
      EMA: {
        value: { fast: fast[i], slow: slow[i] },
        signal:
          fast[i] === null || slow[i] === null
            ? "NEUTRAL"
            : directional(fast[i] - slow[i]),
      },
      SUPERTREND: {
        value: st,
        signal: st === null ? "NEUTRAL" : directional(b.close - st),
      },
      ADX: {
        value: { adx: adx[i], plus: plus[i], minus: minus[i] },
        signal:
          adx[i] !== null && adx[i] >= adxThreshold
            ? directional(plus[i] - minus[i])
            : "NEUTRAL",
      },
      MACD: {
        value: macd[i] === null || msig[i] === null ? null : macd[i] - msig[i],
        signal:
          macd[i] === null || msig[i] === null
            ? "NEUTRAL"
            : directional(macd[i] - msig[i]),
      },
      RSI: {
        value: rsi[i],
        signal:
          rsi[i] === null
            ? "NEUTRAL"
            : rsi[i] > 55
              ? "LONG"
              : rsi[i] < 45
                ? "SHORT"
                : "NEUTRAL",
      },
      STOCH_RSI: {
        value: stochastic,
        signal:
          stochastic === null
            ? "NEUTRAL"
            : stochastic > 60
              ? "LONG"
              : stochastic < 40
                ? "SHORT"
                : "NEUTRAL",
      },
      ATR: { value: atr[i], signal: atrRatio >= 1 ? "ACTIVE" : "NEUTRAL" },
      BOLLINGER: {
        value: { mid, upper: mid + 2 * sd, lower: mid - 2 * sd },
        signal:
          b.close > mid + bollingerSigma * sd
            ? "LONG"
            : b.close < mid - bollingerSigma * sd
              ? "SHORT"
              : "NEUTRAL",
      },
      VWAP: {
        value: Number.isFinite(vw) ? vw : null,
        signal: Number.isFinite(vw) ? directional(b.close - vw) : "NEUTRAL",
      },
      RVOL: {
        value: avgVol ? b.volume / avgVol : 0,
        signal: avgVol && b.volume / avgVol >= 1.2 ? "ACTIVE" : "NEUTRAL",
      },
    };
    const range = prior.length
      ? Math.max(...prior.map((x) => x.high)) -
        Math.min(...prior.map((x) => x.low))
      : 0;
    const efficiency = range
      ? Math.abs(b.close - (prior[0]?.close || b.close)) / range
      : 0;
    const regime =
      atrRatio > 2
        ? "HIGH_VOLATILITY"
        : prior.length &&
            (b.close > Math.max(...prior.map((x) => x.high)) ||
              b.close < Math.min(...prior.map((x) => x.low)))
          ? "BREAKOUT"
          : efficiency > 0.6
            ? "TRENDING"
            : "RANGE";
    return {
      time: b.time,
      atr: atr[i],
      regime,
      signals,
      ready: i >= Math.max(60, p(60)),
    };
  });
}
function pairs() {
  const keys = Object.keys(CATEGORIES),
    out = [];
  keys.forEach((a, i) =>
    keys.slice(i + 1).forEach((b) => {
      if (CATEGORIES[a] !== CATEGORIES[b] || (a === "EMA" && b === "ADX"))
        out.push([a, b]);
    }),
  );
  return out;
}
function signal(feature, pair) {
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    pair[0] === pair[1] ||
    pair.some((x) => !CATEGORIES[x])
  )
    throw Error("EXACTLY_TWO_INDICATORS_REQUIRED");
  if (!feature?.ready) return "NO_TRADE";
  const s = pair.map((k) => feature.signals[k].signal),
    direction = s.find((x) => x === "LONG" || x === "SHORT");
  return direction && s.every((x) => x === direction || x === "ACTIVE")
    ? direction
    : "NO_TRADE";
}
function consensus(feature, minVotes = 5) {
  if (!Number.isInteger(minVotes) || minVotes < 5 || minVotes > DIRECTIONAL.length)
    throw Error("INVALID_CONSENSUS_THRESHOLD");
  const votes = { LONG: 0, SHORT: 0 };
  for (const name of DIRECTIONAL) {
    const side = feature?.signals?.[name]?.signal;
    if (side === "LONG" || side === "SHORT") votes[side]++;
  }
  const confirmations = CONTEXTUAL.filter(
    (name) => feature?.signals?.[name]?.signal === "ACTIVE",
  ).length;
  const direction = feature?.ready && Math.max(votes.LONG, votes.SHORT) >= minVotes
    ? votes.LONG > votes.SHORT ? "LONG" : votes.SHORT > votes.LONG ? "SHORT" : "NO_TRADE"
    : "NO_TRADE";
  const supporting = direction === "NO_TRADE" ? Math.max(votes.LONG, votes.SHORT) : votes[direction];
  const opposing = direction === "NO_TRADE" ? Math.min(votes.LONG, votes.SHORT) : votes[direction === "LONG" ? "SHORT" : "LONG"];
  return { direction, votes, supporting, opposing, confirmations,
    score: supporting * 100 - opposing * 20 + confirmations * 10 };
}
module.exports = {
  CATEGORIES,
  DIRECTIONAL,
  CONTEXTUAL,
  mean,
  smooth,
  validateBars,
  calculate,
  pairs,
  signal,
  consensus,
};
