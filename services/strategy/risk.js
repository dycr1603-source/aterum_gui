"use strict";
function positive(x) {
  return Number.isFinite(x) && x > 0;
}
function levels({
  bars,
  entry,
  side,
  atr,
  stopAtr = 1.5,
  targetAtr = 3,
  tick = 0,
}) {
  if (
    !["LONG", "SHORT"].includes(side) ||
    !positive(entry) ||
    !positive(atr) ||
    !bars?.length
  )
    throw Error("INVALID_STRUCTURE");
  const sign = side === "LONG" ? 1 : -1,
    recent = bars.slice(-10);
  // Stop beyond the recent swing, with a volatility buffer; target at structure
  // when reachable, otherwise at a volatility projection. No fixed price percent.
  const swing =
    sign === 1
      ? Math.min(...recent.map((b) => b.low))
      : Math.max(...recent.map((b) => b.high));
  let stop =
    sign === 1
      ? Math.min(swing - atr * 0.25, entry - stopAtr * atr)
      : Math.max(swing + atr * 0.25, entry + stopAtr * atr);
  const objectives = bars
    .slice(-40)
    .map((b) => (sign === 1 ? b.high : b.low))
    .filter((x) => sign * (x - entry) >= atr);
  let target = objectives.length
    ? sign === 1
      ? Math.max(...objectives)
      : Math.min(...objectives)
    : entry + sign * targetAtr * atr;
  if (tick) {
    stop =
      (sign === 1 ? Math.floor(stop / tick) : Math.ceil(stop / tick)) * tick;
    target =
      (sign === 1 ? Math.floor(target / tick) : Math.ceil(target / tick)) *
      tick;
  }
  validateLevels({ entry, stop, target, side });
  return { stop, target };
}
function validateLevels({ entry, stop, target, side }) {
  if (
    !["LONG", "SHORT"].includes(side) ||
    ![entry, stop, target].every(positive) ||
    (side === "LONG"
      ? stop >= entry || target <= entry
      : stop <= entry || target >= entry)
  )
    throw Error("INVALID_LEVELS");
}
function size({
  entry,
  stop,
  target,
  side,
  allowedRisk,
  availableMargin,
  leverage,
  feeRate,
  slippageBps,
  fundingReserve = 0,
  step = 0.00000001,
  minQty = 0,
  minNotional = 0,
  maxQty = Infinity,
  maintenanceRate = 0.01,
}) {
  validateLevels({ entry, stop, target, side });
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 10)
    throw Error("INVALID_LEVERAGE");
  if (
    ![allowedRisk, availableMargin, step].every(positive) ||
    ![
      feeRate,
      slippageBps,
      fundingReserve,
      maintenanceRate,
      minQty,
      minNotional,
    ].every((x) => Number.isFinite(x) && x >= 0) ||
    !(maxQty === Infinity || positive(maxQty)) ||
    feeRate > 0.01 ||
    slippageBps > 500
  )
    throw Error("INVALID_RISK_INPUT");
  const riskPerUnit =
    Math.abs(entry - stop) +
    (entry + stop) * (feeRate + slippageBps / 10000) +
    entry * fundingReserve;
  const qtyRaw = Math.min(
    allowedRisk / riskPerUnit,
    availableMargin /
      (entry / leverage + entry * (feeRate + slippageBps / 10000)),
    maxQty,
  );
  const quantity = Number(
    (Math.floor(qtyRaw / step + 1e-10) * step).toPrecision(14),
  );
  const margin = (quantity * entry) / leverage,
    riskAtStop = quantity * riskPerUnit,
    netReward =
      quantity *
      (Math.abs(target - entry) -
        (entry + target) * (feeRate + slippageBps / 10000) -
        entry * fundingReserve);
  if (
    ![quantity, margin, riskAtStop, riskPerUnit, netReward].every(
      Number.isFinite,
    ) ||
    quantity <= 0 ||
    quantity < minQty ||
    quantity * entry < minNotional ||
    netReward <= 0
  )
    throw Error("UNTRADEABLE_SIZE");
  if (margin - riskAtStop <= quantity * stop * maintenanceRate + margin * 0.1)
    throw Error("LIQUIDATION_BEFORE_STOP");
  if (riskAtStop > allowedRisk + 1e-8) throw Error("RISK_BUDGET_EXCEEDED");
  return {
    quantity,
    margin,
    riskAtStop,
    riskPerUnit,
    expectedR: netReward / riskAtStop,
    leverage,
    notional: quantity * entry,
  };
}
function pnl({ side, entry, exit, quantity, feeRate, funding = 0 }) {
  if (
    !["LONG", "SHORT"].includes(side) ||
    ![entry, exit, quantity].every(positive) ||
    !Number.isFinite(feeRate) ||
    feeRate < 0 ||
    !Number.isFinite(funding)
  )
    throw Error("INVALID_PNL");
  const gross = (side === "LONG" ? 1 : -1) * (exit - entry) * quantity,
    fees = (entry + exit) * quantity * feeRate;
  return { gross, fees, funding, net: gross - fees - funding };
}
function breaker(
  {
    drawdown,
    lossStreak,
    apiHealthy,
    jevHealthy,
    dataValid,
    reconciled,
    executionMatched,
  },
  policy,
) {
  const reasons = [];
  for (const [key, value] of Object.entries({
    API_PROBLEMS: apiHealthy,
    JEV_UNAVAILABLE: jevHealthy,
    DATA_CORRUPTION: dataValid,
    BINANCE_INCONSISTENCIES: reconciled,
    EXECUTION_MISMATCH: executionMatched,
  }))
    if (value !== true) reasons.push(key);
  if (
    !Number.isFinite(drawdown) ||
    !Number.isInteger(lossStreak) ||
    lossStreak < 0
  )
    reasons.push("PERFORMANCE_UNAVAILABLE");
  if (drawdown >= policy.maxDrawdown) reasons.push("DRAWDOWN_LIMIT");
  if (lossStreak >= policy.maxLossStreak) reasons.push("LOSING_STREAK");
  return { allowed: !reasons.length, reasons, manageOpenPositions: true };
}
module.exports = { levels, validateLevels, size, pnl, breaker };
