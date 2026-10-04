"use strict";
const store = require("./store");
function account({
  fills,
  funding,
  side,
  quantity,
  entryTime,
  exitTime,
  entryOrderId,
  hedged = false,
  fundingCoverageVerified = true,
}) {
  const entryFills = fills.filter(
    (f) =>
      String(f.orderId) === String(entryOrderId) &&
      f.positionSide === side &&
      f.side === (side === "LONG" ? "BUY" : "SELL"),
  );
  if (entryFills.length)
    entryTime = Math.min(...entryFills.map((f) => Number(f.time)));
  funding = funding.filter(
    (f) =>
      !Number.isFinite(Number(f.time)) ||
      (Number(f.time) >= entryTime && Number(f.time) <= exitTime),
  );
  const relevant = fills.filter(
    (f) =>
      Number(f.time) >= entryTime &&
      Number(f.time) <= exitTime &&
      f.positionSide === side,
  );
  const buys = relevant.filter(
      (f) => f.side === (side === "LONG" ? "BUY" : "SELL"),
    ),
    sells = relevant.filter(
      (f) => f.side === (side === "LONG" ? "SELL" : "BUY"),
    );
  const qty = (rows) => rows.reduce((s, f) => s + Number(f.qty), 0),
    gross = relevant.reduce((s, f) => s + Number(f.realizedPnl), 0),
    fees = relevant.reduce((s, f) => s + Number(f.commission), 0),
    fundingCost = -funding.reduce((s, f) => s + Number(f.income), 0);
  const complete =
    Number.isFinite(quantity) && quantity > 0 &&
    [gross,fees,fundingCost].every(Number.isFinite) &&
    !hedged &&
    fundingCoverageVerified &&
    relevant.length > 0 &&
    fills.length < 1000 &&
    funding.length < 1000 &&
    relevant.every(
      (f) =>
        f.commissionAsset === "USDT" &&
        [f.qty, f.realizedPnl, f.commission].every((v) =>
          Number.isFinite(Number(v)),
        ),
    ) &&
    funding.every(
      (f) => f.asset === "USDT" && Number.isFinite(Number(f.income)),
    ) &&
    buys.every((f) => String(f.orderId) === String(entryOrderId)) &&
    Math.abs(qty(buys) - quantity) < Math.max(1e-8, quantity * 1e-6) &&
    Math.abs(qty(sells) - quantity) < Math.max(1e-8, quantity * 1e-6);
  return {
    accountingComplete: complete,
    gross: complete ? gross : null,
    fees: complete ? fees : null,
    funding: complete ? fundingCost : null,
    net: complete ? gross - fees - fundingCost : null,
    accountingReason: complete
      ? "BINANCE_FILLS_AND_INCOME_VERIFIED"
      : "INCOMPLETE_OR_AMBIGUOUS_EXCHANGE_LEDGER",
  };
}
async function capture({ db, binance, trade, original, close }) {
  const context = original.tradeContext,
    exitTime = close.closedAt;
  let entryTime = Date.parse(trade.opened_at);
  let filledQuantity = Number(original.quantity);
  let accounting = {
    accountingComplete: false,
    gross: null,
    fees: null,
    funding: null,
    net: null,
    accountingReason: "EXCHANGE_ACCOUNTING_UNAVAILABLE",
  };
  try {
    const entryFills = await binance.request("GET", "/fapi/v1/userTrades", {
      symbol: trade.symbol,
      orderId: trade.market_order_id,
      limit: 1000,
    });
    const linked = entryFills.filter(
      (f) => String(f.orderId) === String(trade.market_order_id),
    );
    if (!linked.length) throw Error("ENTRY_FILLS_MISSING");
    entryTime = Math.min(...linked.map((f) => Number(f.time)));
    filledQuantity = linked.reduce((sum, f) => sum + Number(f.qty), 0);
    if (
      !(filledQuantity > 0) ||
      filledQuantity > Number(original.quantity) + 1e-8
    )
      throw Error("ENTRY_QUANTITY_MISMATCH");
    if (exitTime - entryTime > 7 * 86400000)
      throw Error("ACCOUNTING_WINDOW_TOO_LARGE");
    const [fills, funding] = await Promise.all([
      binance.userTrades(trade.symbol, entryTime),
      binance.request("GET", "/fapi/v1/income", {
        symbol: trade.symbol,
        incomeType: "FUNDING_FEE",
        startTime: entryTime,
        endTime: exitTime,
        limit: 1000,
      }),
    ]);
    const [opposite] = await db.execute(
      "SELECT id FROM trades WHERE symbol=? AND direction<>? AND opened_at<=FROM_UNIXTIME(?/1000) AND updated_at>=FROM_UNIXTIME(?/1000)",
      [trade.symbol, trade.direction, exitTime, entryTime],
    );
    accounting = account({
      fills,
      funding,
      side: trade.direction,
      quantity: filledQuantity,
      entryTime,
      exitTime,
      entryOrderId: trade.market_order_id,
      hedged: opposite.length > 0,
    });
  } catch {
    /* Leave unknown costs unknown; closing must never depend on analytics. */
  }
  const risk = context.strategyRisk?.riskAtStop || Number(context.maxLoss),
    feedback = {
      ...accounting,
      tradeId: trade.id,
      executionId: original.executionId,
      symbol: trade.symbol,
      side: trade.direction,
      timeframe: context.strategy.timeframe || "1h",
      pair: context.strategy.pair,
      indicators: context.strategy.indicators,
      jevDecision: trade.direction,
      confidence: context.strategyConfidence ?? null,
      leverage: original.leverage,
      regime: context.strategy.regime,
      entry: Number(trade.entry_price),
      stop: Number(original.stopLoss),
      target: Number(original.takeProfit),
      entryTime,
      exitTime,
      exit: close.exitPrice,
      exitReason: close.closeReason,
      r:
        accounting.accountingComplete && risk > 0
          ? accounting.net / risk
          : null,
      mae: null,
      mfe: null,
      excursionSource: "UNAVAILABLE",
      risk,
    };
  // Candle extrema describe excursions, not a fabricated tick-by-tick path.
  try {
    const interval = "1m",
      startTime = Math.floor(entryTime / 60000) * 60000;
    if (exitTime - startTime <= 1000 * 60000) {
      const rows = await binance.request(
        "GET",
        "/fapi/v1/klines",
        {
          symbol: trade.symbol,
          interval,
          startTime,
          endTime: exitTime,
          limit: 1000,
        },
        false,
      );
      const contained = rows.filter(
        (r) => Number(r[0]) >= entryTime && Number(r[6]) <= exitTime,
      );
      if (contained.length) {
        const high = Math.max(...contained.map((r) => Number(r[2]))),
          low = Math.min(...contained.map((r) => Number(r[3]))),
          sign = trade.direction === "LONG" ? 1 : -1;
        feedback.mae =
          Math.max(0, -sign * ((sign === 1 ? low : high) - feedback.entry)) *
          filledQuantity;
        feedback.mfe =
          Math.max(0, sign * ((sign === 1 ? high : low) - feedback.entry)) *
          filledQuantity;
        feedback.excursionSource = "INTERIOR_1M_CANDLES_PARTIAL_COVERAGE";
      }
    }
  } catch {}
  await store.ensure(db);
  await store.record(db, `close:${trade.id}`, "CLOSE", feedback);
  if (!accounting.accountingComplete)
    await store.halt(db, "ACCOUNTING_PENDING");
  return feedback;
}
module.exports = { account, capture };
