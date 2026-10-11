"use strict";
// Closed-candle, cost-aware hypotheses shared by offline research and the live scanner.
// No Binance/JEV call and no future candle is read here.
function assess(bars, index, feature, options = {}) {
  const span = options.span ?? 16;
  if (!Number.isInteger(span) || span < 4 || index < span * 4 + 1)
    return { direction: "NO_TRADE", score: 0, sides: [] };
  const b = bars[index], previous = bars[index - 1];
  const atr = Number(feature?.atr), price = b.close;
  if (!(atr > 0 && price > 0 && Number.isFinite(b.volume)))
    return { direction: "NO_TRADE", score: 0, sides: [] };
  const recent = bars.slice(index - span, index);
  const earlier = bars.slice(index - span * 4, index - span);
  const average = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
  const avgVolume = average(recent.map(x => x.volume));
  const rvol = avgVolume > 0 ? b.volume / avgVolume : 0;
  const priorHigh = Math.max(...recent.map(x => x.high));
  const priorLow = Math.min(...recent.map(x => x.low));
  const slowClose = bars[index - span * 4].close;
  const trend = (previous.close - slowClose) / atr;
  const impulse = (b.close - bars[index - span].close) / atr;
  const body = (b.close - b.open) / atr;
  const priorRange = average(earlier.map(x => x.high - x.low));
  const recentRange = average(recent.map(x => x.high - x.low));
  const compression = priorRange > 0 ? recentRange / priorRange : Infinity;
  const costFraction = Math.max(0, options.roundTripCostFraction ?? .0032);
  const potential = Math.abs(impulse) * atr / price;
  const minPotential = costFraction * (options.costMultiple ?? 2);
  const model = options.model ?? "COMPRESSION_BREAKOUT";
  const volumeMin = options.volumeMin ?? 1;
  const trendMin = options.trendMin ?? .5;
  const impulseMin = options.impulseMin ?? .5;
  const inputs = { rvol, trend, impulse, body, compression, potential, minPotential };
  let long = false, short = false;
  if (model === "COMPRESSION_BREAKOUT") {
    const valid = compression <= (options.compressionMax ?? .9) &&
      rvol >= volumeMin && potential >= minPotential;
    long = valid && b.close > priorHigh && trend >= trendMin && body > 0;
    short = valid && b.close < priorLow && trend <= -trendMin && body < 0;
  } else if (model === "MOMENTUM_ACCELERATION") {
    const valid = rvol >= volumeMin && potential >= minPotential;
    long = valid && impulse >= impulseMin && trend >= trendMin &&
      body >= (options.bodyMin ?? .15) && b.close > previous.close;
    short = valid && impulse <= -impulseMin && trend <= -trendMin &&
      body <= -(options.bodyMin ?? .15) && b.close < previous.close;
  } else if (model === "LIQUIDITY_RECLAIM") {
    const range = b.high - b.low;
    const valid = range > 0 && rvol >= volumeMin && range / atr >= (options.rangeMin ?? 1.2);
    long = valid && b.low < priorLow && b.close > priorLow &&
      (b.close - b.low) / range >= (options.reclaimFraction ?? .65);
    short = valid && b.high > priorHigh && b.close < priorHigh &&
      (b.high - b.close) / range >= (options.reclaimFraction ?? .65);
  } else if (model === "TREND_PULLBACK") {
    const mid = (priorHigh + priorLow) / 2;
    const valid = rvol >= volumeMin && Math.abs(trend) >= trendMin;
    long = valid && trend > 0 && previous.close < mid && b.close > previous.close &&
      b.close > b.open && b.close < priorHigh;
    short = valid && trend < 0 && previous.close > mid && b.close < previous.close &&
      b.close < b.open && b.close > priorLow;
  } else throw Error("UNKNOWN_OPPORTUNITY_MODEL");
  const strength = Math.min(5, Math.abs(trend)) + Math.min(4, Math.abs(impulse)) +
    Math.min(3, rvol) + Math.min(2, Math.abs(body)) +
    (model === "COMPRESSION_BREAKOUT" ? Math.max(0, 1 - compression) * 2 : 0);
  return { direction: long ? "LONG" : short ? "SHORT" : "NO_TRADE",
    sides: [...(long ? ["LONG"] : []), ...(short ? ["SHORT"] : [])],
    score: long || short ? strength : 0, model, inputs };
}
module.exports = { assess };
