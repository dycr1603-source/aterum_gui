"use strict";
// Descriptive exposure only; never a third entry indicator or scoring gate.
function exposure(candidate, positions) {
  const returns = (bars) =>
    new Map(bars.slice(1).map((b, i) => [b.time, b.close / bars[i].close - 1]));
  const a = returns(candidate);
  return positions.map((p) => {
    const b = returns(p.bars),
      keys = [...a.keys()].filter((k) => b.has(k)),
      x = keys.map((k) => a.get(k)),
      y = keys.map((k) => b.get(k));
    let correlation = null;
    if (keys.length >= 20) {
      const mx = x.reduce((s, v) => s + v, 0) / x.length,
        my = y.reduce((s, v) => s + v, 0) / y.length;
      let cov = 0,
        vx = 0,
        vy = 0;
      x.forEach((v, i) => {
        cov += (v - mx) * (y[i] - my);
        vx += (v - mx) ** 2;
        vy += (y[i] - my) ** 2;
      });
      if (vx * vy > 0) correlation = cov / Math.sqrt(vx * vy);
    }
    return {
      symbol: p.symbol,
      side: p.direction,
      notional: p.notional,
      observations: keys.length,
      correlation,
      directionalExposureCorrelation:
        correlation === null
          ? null
          : correlation * (p.direction === "SHORT" ? -1 : 1),
    };
  });
}
module.exports = { exposure };
