"use strict";
// Cross-sectional selection from observations available at one closed candle.
function select(observations, market, options) {
  if (!Array.isArray(observations) || observations.length < 5 ||
    !Number.isFinite(market?.reference) || !Number.isFinite(market?.regime48h))
    return [];
  const { mode, threshold, regime } = options;
  if (!["MOMENTUM", "REVERSAL"].includes(mode) || !(threshold > 0))
    throw Error("RELATIVE_MODEL_INVALID");
  const ranked = observations.filter(x => Number.isFinite(x.own))
    .map(x => ({ ...x, residual: x.own - market.reference }))
    .sort((a, b) => b.residual - a.residual || a.symbol.localeCompare(b.symbol));
  const high = ranked.find(x => x.symbol !== "BTCUSDT" && x.residual >= threshold &&
    (mode === "REVERSAL" || x.own > 0));
  const low = [...ranked].reverse().find(x => x.symbol !== "BTCUSDT" &&
    x.residual <= -threshold && (mode === "REVERSAL" || x.own < 0));
  const inRange = Math.abs(market.regime48h) < .03;
  const macroBars = regime === "MACRO_30D" ? 720 : regime === "MACRO_7D" ? 168 : 0;
  if (macroBars && !Number.isFinite(market.macro)) return [];
  const allowed = highSide => regime === "NONE" ||
    (regime === "BTC_48H" && (highSide ? market.regime48h > 0 : market.regime48h < 0)) ||
    (regime === "RANGE" && inRange) ||
    (regime === "TREND" && !inRange) ||
    (macroBars > 0 && (highSide
      ? mode === "REVERSAL" ? market.macro < 0 : market.macro > 0
      : mode === "REVERSAL" ? market.macro > 0 : market.macro < 0));
  const result = [];
  if (high && allowed(true)) result.push({ symbol: high.symbol,
    side: mode === "REVERSAL" ? "SHORT" : "LONG",
    score: Math.abs(high.residual) / threshold,
    evidence: { own: high.own, reference: market.reference,
      residual: high.residual, regime48h: market.regime48h } });
  if (low && allowed(false)) result.push({ symbol: low.symbol,
    side: mode === "REVERSAL" ? "LONG" : "SHORT",
    score: Math.abs(low.residual) / threshold,
    evidence: { own: low.own, reference: market.reference,
      residual: low.residual, regime48h: market.regime48h } });
  return result;
}
module.exports = { select };
