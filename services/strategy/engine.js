"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { load, promotion } = require("./policy"),
  { calculate, signal, validateBars } = require("./indicators"),
  { breaker } = require("./risk"),
  store = require("./store");
function readReport() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../docs/strategy/results.json")),
    );
  } catch {
    return null;
  }
}
function batchOffset(nowMs, eligibleCount, batchSize = 24) {
  // Main Schedule runs every fifteen minutes.
  return (Math.floor(nowMs / 900000) * batchSize) % Math.max(1, eligibleCount);
}
function universe({ info, tickers, books, now, policy }) {
  const byTicker = new Map(tickers.map((t) => [t.symbol, t])),
    byBook = new Map(books.map((b) => [b.symbol, b]));
  return info.symbols
    .filter((s) => s.quoteAsset === "USDT" && s.contractType === "PERPETUAL")
    .map((s) => {
      const t = byTicker.get(s.symbol),
        b = byBook.get(s.symbol),
        bid = Number(b?.bidPrice),
        ask = Number(b?.askPrice),
        quote = Number(t?.quoteVolume),
        spread = ((ask - bid) / ((ask + bid) / 2)) * 10000;
      const reasons = [];
      if (s.status !== "TRADING") reasons.push("SYMBOL_NOT_TRADING");
      if (!Number.isFinite(quote) || quote < policy.minQuoteVolume)
        reasons.push("LOW_VOLUME");
      if (
        !(bid > 0 && ask >= bid) ||
        !Number.isFinite(spread) ||
        spread > policy.maxSpreadBps
      )
        reasons.push("SPREAD");
      if (
        !Number.isFinite(Number(s.onboardDate)) ||
        now - Number(s.onboardDate) < 90 * 86400000
      )
        reasons.push("SHORT_HISTORY");
      return {
        symbol: s.symbol,
        status: reasons.length ? "REJECTED" : "SELECTED",
        reasons,
        quoteVolume: quote || 0,
        spreadBps: Number.isFinite(spread) ? spread : null,
      };
    })
    .sort(
      (a, b) =>
        b.quoteVolume - a.quoteVolume || a.symbol.localeCompare(b.symbol),
    );
}
function logDecision(d) {
  const s = d.strategy,
    inds = s?.indicators || [],
    p = d.jev?.proposal;
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "🧠 ATERUM DECISION",
    `SYMBOL: ${d.symbol || "UNIVERSE"}`,
    ...inds.map(
      (i, n) =>
        `Indicator ${n + 1}: ${i.name} = ${JSON.stringify(i.value)} / ${i.signal}`,
    ),
    `JEV: ${d.jev?.decision || "NOT_CALLED"} / confidence ${d.jev?.confidence ?? "N/A"} / leverage ${p?.leverage ?? "N/A"}`,
    `Market: ${s?.regime || "UNKNOWN"}`,
    `Risk: ${d.jev?.risk?.riskAtStop ?? "N/A"} USDT`,
    `Entry: ${p?.entry ?? "N/A"} / SL: ${p?.sl ?? "N/A"} / TP: ${p?.tp ?? "N/A"}`,
    `Expected R: ${d.jev?.risk?.expectedR ?? "N/A"}`,
    `Decision: ${d.passAI ? "EXECUTE " + d.direction : "NO_TRADE"}`,
    `Reason: ${d.skipReason || d.jev?.explanation || d.jev?.reason}`,
    "━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}
async function cycle({
  db,
  fetchImpl = fetch,
  evaluateJev,
  policy = load(),
  report = readReport(),
  now = Date.now,
} = {}) {
  const id = randomUUID(),
    result = {
      strategyV2: true,
      opportunityCycleId: id,
      passAI: false,
      allocationAllowed: false,
      skipReason: "NO_OPPORTUNITY",
    };
  await store.ensure(db);
  const finish = async () => {
    await store.record(db, `decision:${id}`, "DECISION", result);
    console.log(logDecision(result));
    return result;
  };
  try {
    const approval = promotion(policy, report);
    if (
      policy.mode === "research" ||
      !policy.pair ||
      (policy.mode === "enforce" && !approval.allowed)
    ) {
      result.skipReason = approval.reasons.join(", ") || "RESEARCH_ONLY";
      return finish();
    }
    const get = async (url, internal = false) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetchImpl(url, {
          headers: internal
            ? { authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN}` }
            : {},
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) return r.json();
        const endpoint = new URL(url).pathname.split("/").at(-1);
        if (r.status !== 429 || internal || attempt === 2)
          throw Error(`API_HTTP_${r.status}_${endpoint}`);
        const retryAfter = Number(r.headers?.get?.("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter * 1000)
          : 61000 - (Date.now() % 60000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      throw Error("API_PROBLEMS");
    };
    const base = "https://fapi.binance.com/fapi/v1",
      capacity = await get(
        process.env.JEV_CAPACITY_URL ||
          "http://position_guard:3091/portfolio-capacity",
        true,
      );
    if (
      !Number.isFinite(Date.parse(capacity.checkedAt)) ||
      now() - Date.parse(capacity.checkedAt) > 120000 ||
      Date.parse(capacity.checkedAt) > now()
    )
      throw Error("STALE_ACCOUNT");
    const equity = Number(capacity.account?.equity),
      state = await store.status(db, equity),
      perf = await store.performance(db, policy.initialCapital);
    if (state.halted) {
      result.skipReason = `CIRCUIT_BREAKER: ${state.reason}`;
      return finish();
    }
    const [local] = await db.execute(
      "SELECT symbol,direction,qty FROM trades WHERE status='OPEN'",
    );
    const positions = capacity.positions || [],
      reconciled =
        local.length === positions.length &&
        local.every((t) =>
          positions.some(
            (p) =>
              p.symbol === t.symbol &&
              p.direction === t.direction &&
              Math.abs(Number(t.qty) - Number(p.quantity)) <=
                Math.max(1e-8, Number(t.qty) * 1e-6),
          ),
        );
    if (
      capacity.allowed !== true &&
      reconciled &&
      !(capacity.blockers || []).some((b) => b.code === "UNPROTECTED_POSITION")
    ) {
      result.skipReason = "PORTFOLIO_CAPACITY_FULL";
      return finish();
    }
    const b = breaker(
      {
        drawdown:
          state.peak_equity > 0
            ? Math.max(0, 1 - equity / state.peak_equity)
            : NaN,
        lossStreak: perf.lossStreak,
        apiHealthy: capacity.allowed === true,
        jevHealthy: true,
        dataValid: perf.accountingPending === 0,
        reconciled,
        executionMatched: true,
      },
      policy,
    );
    if (!b.allowed) {
      await store.halt(db, b.reasons.join(","));
      result.skipReason = b.reasons.join(",");
      return finish();
    }
    const [info, tickers, books] = await Promise.all([
      get(`${base}/exchangeInfo`),
      get(`${base}/ticker/24hr`),
      get(`${base}/ticker/bookTicker`),
    ]);
    const rows = universe({ info, tickers, books, now: now(), policy });
    await store.record(db, `universe:${id}`, "UNIVERSE", { cycleId: id, rows });
    const allowed = rows.filter((r) => r.status === "SELECTED");
    const offset = batchOffset(now(), allowed.length);
    // Preserve a rotating starting point, but examine the entire eligible
    // universe until a candidate is approved or every symbol is exhausted.
    const batch = [
      ...allowed.slice(offset),
      ...allowed.slice(0, offset),
    ];
    result.universeSummary = {
      eligible: allowed.length,
      scanned: 0,
      reasons: {},
      checked: [],
    };
    const note = (item, reasons, detail = {}) => {
      const list = Array.isArray(reasons) ? reasons : [reasons];
      result.universeSummary.checked.push({ symbol: item.symbol, reasons: list, ...detail });
      result.universeSummary.scanned = result.universeSummary.checked.length;
      for (const reason of list)
        result.universeSummary.reasons[reason] =
          (result.universeSummary.reasons[reason] || 0) + 1;
    };
    for (const item of batch) {
      if (positions.some((p) => p.symbol === item.symbol)) {
        item.status = "REJECTED";
        item.reasons.push("ALREADY_OPEN");
        note(item, "ALREADY_OPEN");
        continue;
      }
      const raw = await get(
        `${base}/klines?symbol=${item.symbol}&interval=${policy.timeframe}&limit=240`,
      );
      const bars = raw
        .filter((r) => Number(r[6]) < now())
        .map((r) => ({
          time: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
          quoteVolume: Number(r[7]),
        }));
      const interval = policy.timeframe === "1h" ? 3600000 : 14400000;
      validateBars(bars, interval);
      if (now() - (bars.at(-1).time + interval) > interval)
        throw Error("STALE_MARKET_DATA");
      const f = calculate(bars, policy.scale, policy).at(-1),
        price = bars.at(-1).close;
      const direction = signal(f, policy.pair);
      const failed = [];
      if (f.atr / price > policy.maxAtrFraction)
        failed.push("ABNORMAL_VOLATILITY");
      if (direction === "NO_TRADE") failed.push("NO_TWO_INDICATOR_SIGNAL");
      else if (!policy.directions.includes(direction))
        failed.push("DIRECTION_DISABLED");
      const detail = {
        indicators: policy.pair.map((name) => ({
          name,
          signal: f.signals[name]?.signal || "UNAVAILABLE",
        })),
      };
      if (failed.length) {
        item.status = "REJECTED";
        item.reasons.push(...failed);
        note(item, failed, detail);
        continue;
      }
      const [depth, funding, higher] = await Promise.all([
        get(`${base}/depth?symbol=${item.symbol}&limit=100`),
        get(`${base}/premiumIndex?symbol=${item.symbol}`),
        get(`${base}/klines?symbol=${item.symbol}&interval=1d&limit=8`),
      ]);
      const depthQuote = Math.min(
        ...["bids", "asks"].map((side) =>
          (depth[side] || [])
            .filter(([p]) => Math.abs(Number(p) / price - 1) <= 0.005)
            .reduce((s, [p, q]) => s + Number(p) * Number(q), 0),
        ),
      );
      if (
        !Number.isFinite(depthQuote) ||
        !Number.isFinite(Number(funding.lastFundingRate))
      )
        throw Error("INVALID_MARKET_DATA");
      detail.depthQuote = Number(depthQuote.toFixed(2));
      detail.requiredDepthQuote = policy.minDepthQuote;
      if (depthQuote < policy.minDepthQuote) {
        item.status = "REJECTED";
        item.reasons.push("LOW_DEPTH");
        note(item, "LOW_DEPTH", detail);
        continue;
      }
      const correlationPositions = [];
      for (const position of positions) {
        const rows = await get(
          `${base}/klines?symbol=${position.symbol}&interval=${policy.timeframe}&limit=60`,
        );
        correlationPositions.push({
          ...position,
          bars: rows
            .filter((r) => Number(r[6]) < now())
            .map((r) => ({ time: Number(r[0]), close: Number(r[4]) })),
        });
      }
      const closedHigher = higher.filter((r) => Number(r[6]) < now());
      const d = {
        symbol: item.symbol,
        timeframe: policy.timeframe,
        opportunityCycleId: id,
        marketDataAt: now(),
        indicators: { currentPrice: price, atr: f.atr },
        passRisk: true,
        strategy: {
          version: "two-indicator-v1",
          timeframe: policy.timeframe,
          reportId: report.reportId,
          pair: policy.pair,
          directions: policy.directions,
          indicators: policy.pair.map((name) => ({ name, ...f.signals[name] })),
          regime: f.regime,
          recentCandles: bars.slice(-60),
          volume: { last: bars.at(-1).volume, quote24h: item.quoteVolume },
          higherTimeframeTrend:
            closedHigher.length > 1
              ? Number(closedHigher.at(-1)[4]) > Number(closedHigher[0][4])
                ? "UP"
                : "DOWN"
              : "UNKNOWN",
          correlationExposure: require("./correlation").exposure(
            bars.slice(-60),
            correlationPositions,
          ),
          funding: {
            rate: Number(funding.lastFundingRate),
            nextTime: Number(funding.nextFundingTime),
          },
          recentSystemPerformance: perf.metrics,
          riskPolicy: policy,
        },
      };
      const jev = await evaluateJev(d);
      if (!["LONG", "SHORT"].includes(jev.decision) || !jev.risk) {
        const reason = String(jev.reason || "JEV_NO_TRADE");
        item.status = "REJECTED";
        item.reasons.push("JEV_NO_TRADE");
        note(item, "JEV_NO_TRADE", { ...detail, jevReason: reason });
        if (/UNAVAILABLE|INVALID|TIMEOUT/.test(reason)) {
          await store.halt(db, reason);
          result.skipReason = reason;
          break;
        }
        continue;
      }
      note(item, "APPROVED", { ...detail, jevDecision: jev.decision });
      Object.assign(result, d, { jev, direction: jev.decision });
      await db.execute(
        "INSERT INTO jev_decisions (id,symbol,result) VALUES (?,?,?)",
        [jev.id, d.symbol, JSON.stringify(jev)],
      );
      const p = jev.proposal,
        r = jev.risk;
      Object.assign(result, {
        passAI: policy.mode === "enforce" && jev.mode === "enforce",
        allocationAllowed: policy.mode === "enforce" && jev.mode === "enforce",
        skipReason: policy.mode === "enforce" ? null : "SHADOW_ONLY",
        side: jev.decision === "LONG" ? "BUY" : "SELL",
        qty: r.quantity,
        leverage: p.leverage,
        entryPrice: p.entry,
        sl: p.sl,
        tp: p.tp,
        initialSL: p.sl,
        marginRequired: r.margin,
        maxLoss: r.riskAtStop,
        maxGain: r.riskAtStop * r.expectedR,
        rrRatio: r.expectedR,
        riskPct: (r.riskAtStop / equity) * 100,
        sizingInfo: r,
        policyVersion: "two-indicator-v1",
        aiResult: { regime: f.regime, reasoning: jev.explanation },
      });
      break;
    }
    if (result.skipReason === "NO_OPPORTUNITY") {
      console.log("[Strategy] NO_OPPORTUNITY", JSON.stringify(result.universeSummary));
    }
    await store.record(db, `universe:${id}`, "UNIVERSE", { cycleId: id, rows });
    return finish();
  } catch (e) {
    await store.halt(db, e.message);
    result.passAI = false;
    result.allocationAllowed = false;
    result.skipReason = e.message;
    return finish();
  }
}
module.exports = { cycle, universe, logDecision, readReport, batchOffset };
