"use strict";

// Closed-candle, direction-normalized inputs. No future bar is read here.
const NAMES = Object.freeze(["ret1", "ret3", "ret12", "body", "closeLocation",
  "relativeVolume", "volumeAcceleration", "rangeExpansion", "compression",
  "vwapGap", "breakout", "btcRelative", "btcTrend", "marketVolatility", "shortSide"]);
const clip = (x, limit = 5) => Math.max(-limit, Math.min(limit, x));
function features(bars, index, side, btcBars = bars) {
  if (index < 48 || !["LONG", "SHORT"].includes(side)) return null;
  const sign = side === "LONG" ? 1 : -1, b = bars[index], btc = btcBars[index];
  if (!b || !btc || !(b.close > 0) || !(btc.close > 0)) return null;
  let volume20 = 0, recent5 = 0, range20 = 0, range5 = 0,
    high20 = -Infinity, low20 = Infinity, vwapNumerator = 0, vwapDenominator = 0;
  for (let j = index - 19; j <= index; j++) {
    const x = bars[j];
    if (!x || !(x.close > 0)) return null;
    volume20 += x.quoteVolume;
    range20 += (x.high - x.low) / x.close;
    if (j >= index - 4) { recent5 += x.quoteVolume; range5 += (x.high - x.low) / x.close; }
    vwapNumerator += x.close * x.quoteVolume;
    vwapDenominator += x.quoteVolume;
    if (j < index) { high20 = Math.max(high20, x.high); low20 = Math.min(low20, x.low); }
  }
  const ref = bars[index - 3], prior12 = bars[index - 12],
    meanRange = range20 / 20, span = Math.max(1e-12, b.high - b.low),
    volMean = volume20 / 20,
    own3 = Math.log(b.close / ref.close) * 100,
    btc3 = Math.log(btc.close / btcBars[index - 3].close) * 100,
    btc12 = Math.log(btc.close / btcBars[index - 12].close) * 100;
  const v = [
    sign * Math.log(b.close / bars[index - 1].close) * 100,
    sign * own3, sign * Math.log(b.close / prior12.close) * 100,
    sign * (b.close - b.open) / span,
    sign * ((b.close - b.low) / span - .5) * 2,
    Math.log(Math.max(1e-9, b.quoteVolume / Math.max(1e-9, volMean))),
    Math.log(Math.max(1e-9, recent5 / Math.max(1e-9, volume20 / 4))),
    Math.log(Math.max(1e-9, ((b.high - b.low) / b.close) / Math.max(1e-9, meanRange))),
    Math.log(Math.max(1e-9, (range5 / 5) / Math.max(1e-9, meanRange))),
    sign * (b.close / (vwapNumerator / vwapDenominator) - 1) * 100,
    sign * ((b.close - (sign > 0 ? high20 : low20)) / b.close) * 100,
    sign * (own3 - btc3), sign * btc12,
    Math.log(Math.max(1e-9, meanRange * 1000)),
    sign < 0 ? 1 : 0,
  ].map(x => clip(x));
  return v.every(Number.isFinite) ? v : null;
}
function probability(values, model) {
  if (!values || model.weights.length !== NAMES.length) return null;
  let z = model.bias;
  for (let i = 0; i < values.length; i++) z += model.weights[i] * values[i];
  return 1 / (1 + Math.exp(-clip(z, 30)));
}
function assess(bars, index, btcBars, model, threshold) {
  const choices = ["LONG", "SHORT"].map(side => {
    const values = features(bars, index, side, btcBars);
    const p = probability(values, model);
    return p === null ? null : { side, probability: p, score: p,
      inputs: Object.fromEntries(NAMES.map((name, i) => [name, values[i]])) };
  }).filter(Boolean).sort((a, b) => b.probability - a.probability);
  return choices[0]?.probability >= threshold ? choices[0] : null;
}
module.exports = { NAMES, features, probability, assess };
