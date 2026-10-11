"use strict";

const MODELS = Object.freeze([
  "MOMENTUM", "VOLUME_BREAKOUT", "SWEEP_RECLAIM", "FALSE_BREAKOUT",
  "VWAP_RECLAIM", "TREND_PULLBACK", "EXTREME_REVERSAL", "RANGE_REVERSION",
]);

// Every input at i is known when the i-th five-minute candle closes.
function inputs(bars, features) {
  return bars.map((bar, i) => {
    const f = features[i], prev = bars[i - 1], three = bars[i - 3];
    const previous = bars.slice(Math.max(0, i - 20), i);
    const high = previous.length === 20 ? Math.max(...previous.map(x => x.high)) : null;
    const low = previous.length === 20 ? Math.min(...previous.map(x => x.low)) : null;
    const atr = f?.atr;
    const vwap = f?.signals.VWAP.value;
    const prevVwap = features[i - 1]?.signals.VWAP.value;
    const ema = f?.signals.EMA.value;
    const span = bar.high - bar.low;
    return { time: bar.time, close: bar.close, open: bar.open, high: bar.high,
      low: bar.low, atr, atrPct: atr / bar.close,
      ret3: three ? (bar.close - three.close) / atr : null,
      closeLocation: span ? (bar.close - bar.low) / span : .5,
      body: atr ? (bar.close - bar.open) / atr : null,
      upperWick: atr ? (bar.high - Math.max(bar.open, bar.close)) / atr : null,
      lowerWick: atr ? (Math.min(bar.open, bar.close) - bar.low) / atr : null,
      rvol: f?.signals.RVOL.value,
      rsi: f?.signals.RSI.value,
      emaGap: atr ? (ema.fast - ema.slow) / atr : null,
      vwapGap: atr ? (bar.close - vwap) / atr : null,
      prevVwapGap: prev && prevVwap && atr ? (prev.close - prevVwap) / atr : null,
      priorHigh: high, priorLow: low,
      regime: f?.regime,
      hour: new Date(bar.time).getUTCHours(),
      ready: f?.ready && Number.isFinite(high) && Number.isFinite(low) &&
        atr > 0 && Number.isFinite(vwap),
    };
  });
}

function assess(x, p) {
  if (!x?.ready || !MODELS.includes(p?.model)) return null;
  if (p.regime && p.regime !== "ALL" && x.regime !== p.regime) return null;
  if (p.session === "ASIA" && x.hour >= 8) return null;
  if (p.session === "EUROPE" && (x.hour < 7 || x.hour >= 16)) return null;
  if (p.session === "US" && (x.hour < 13 || x.hour >= 22)) return null;
  if (x.rvol < p.volumeMin || !(x.atrPct > .0004 && x.atrPct < .035)) return null;
  const t = p.threshold;
  const long = (score) => ({ side: "LONG", score });
  const short = (score) => ({ side: "SHORT", score });
  switch (p.model) {
    case "MOMENTUM":
      if (x.ret3 > t && x.emaGap > 0 && x.closeLocation > .7 && x.body > .15)
        return long(x.ret3 + x.rvol);
      if (x.ret3 < -t && x.emaGap < 0 && x.closeLocation < .3 && x.body < -.15)
        return short(-x.ret3 + x.rvol);
      break;
    case "VOLUME_BREAKOUT":
      if (x.close > x.priorHigh + t * x.atr * .2 && x.body > .2 && x.emaGap > 0)
        return long((x.close - x.priorHigh) / x.atr + x.rvol);
      if (x.close < x.priorLow - t * x.atr * .2 && x.body < -.2 && x.emaGap < 0)
        return short((x.priorLow - x.close) / x.atr + x.rvol);
      break;
    case "SWEEP_RECLAIM":
      if (x.low < x.priorLow - t * x.atr * .2 && x.close > x.priorLow &&
        x.lowerWick > .3 && x.closeLocation > .5)
        return long(x.lowerWick + x.rvol);
      if (x.high > x.priorHigh + t * x.atr * .2 && x.close < x.priorHigh &&
        x.upperWick > .3 && x.closeLocation < .5)
        return short(x.upperWick + x.rvol);
      break;
    case "FALSE_BREAKOUT":
      if (x.high > x.priorHigh + t * x.atr * .2 && x.close < x.priorHigh &&
        x.body < -.1 && x.rsi > 55) return short(x.upperWick + x.rvol);
      if (x.low < x.priorLow - t * x.atr * .2 && x.close > x.priorLow &&
        x.body > .1 && x.rsi < 45) return long(x.lowerWick + x.rvol);
      break;
    case "VWAP_RECLAIM":
      if (x.prevVwapGap < -t * .1 && x.vwapGap > t * .1 &&
        x.emaGap > 0 && x.rsi > 50) return long(x.vwapGap + x.rvol);
      if (x.prevVwapGap > t * .1 && x.vwapGap < -t * .1 &&
        x.emaGap < 0 && x.rsi < 50) return short(-x.vwapGap + x.rvol);
      break;
    case "TREND_PULLBACK":
      if (x.emaGap > t * .2 && x.prevVwapGap < 0 && x.vwapGap > 0 &&
        x.rsi >= 45 && x.rsi <= 70) return long(x.emaGap + x.rvol);
      if (x.emaGap < -t * .2 && x.prevVwapGap > 0 && x.vwapGap < 0 &&
        x.rsi >= 30 && x.rsi <= 55) return short(-x.emaGap + x.rvol);
      break;
    case "EXTREME_REVERSAL":
      if (x.ret3 < -t && x.rsi < 35 && x.closeLocation > .55)
        return long(-x.ret3 + x.rvol);
      if (x.ret3 > t && x.rsi > 65 && x.closeLocation < .45)
        return short(x.ret3 + x.rvol);
      break;
    case "RANGE_REVERSION":
      if (x.regime !== "RANGE") return null;
      if (x.vwapGap < -t && x.rsi < 40 && x.closeLocation > .5)
        return long(-x.vwapGap + x.rvol);
      if (x.vwapGap > t && x.rsi > 60 && x.closeLocation < .5)
        return short(x.vwapGap + x.rvol);
      break;
  }
  return null;
}
module.exports = { MODELS, inputs, assess };
