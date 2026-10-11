"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { load, promotion } = require("./policy"),
  { calculate, signal, consensus, validateBars, DIRECTIONAL, CONTEXTUAL } = require("./indicators"),
  { assess: assessOpportunity } = require("./opportunity_model"),
  { select: selectRelative } = require("./relative_model"),
  { inputs: scalpInputs, assess: assessScalp } = require("./scalp_model"),
  { breaker } = require("./risk"),
  { filtersFor } = require("../jev_capacity"),
  store = require("./store");
const candleCache = new Map();
function minimumLotRisk(symbolInfo, price, atr, policy) {
  const rules = filtersFor(symbolInfo);
  if (!(price > 0 && atr > 0)) return Infinity;
  const minQuantity = Math.max(rules.minQty || 0, (rules.minNotional || 0) / price);
  const minStopDistance = 1.2 * atr;
  const costs = (Math.max(0, 2 * price - minStopDistance) *
    (policy.feeRate + (policy.slippageBps + (policy.spreadBps ?? 0) / 2) / 10000)) +
    price * policy.fundingReserve;
  return minQuantity * (minStopDistance + costs);
}
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
function compareCandidates(a, b, entryMode) {
  // Give liquid candidates priority, then ask JEV about the strongest model
  // signal in that tier. Low depth remains a soft rejection for opportunistic
  // fallback only after the liquid tier has been considered.
  const depthTier = entryMode === "new_opportunistic"
    ? Number(Boolean(a.softReasons?.includes("LOW_DEPTH"))) -
      Number(Boolean(b.softReasons?.includes("LOW_DEPTH"))) : 0;
  const signal = entryMode === "new_opportunistic"
    ? b.votes.score - a.votes.score : 0;
  return depthTier || signal || b.rankScore - a.rankScore ||
    b.depthQuote - a.depthQuote || a.item.symbol.localeCompare(b.item.symbol);
}
function executionReferencePrice(entryMode, signalClose, shortLast) {
  // The new model scores a closed 1h candle, but JEV checks drift against a
  // live Binance quote. Use the latest closed 5m close for that timing check.
  // The 1h close is a signal input, not a current executable price.
  if (entryMode !== "new_opportunistic") return signalClose;
  const price = Number(shortLast?.[4]);
  if (!Number.isFinite(price) || price <= 0)
    throw Error("STALE_SHORT_TERM_DATA");
  return price;
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
      // JEV's request identity and the execution path require an ASCII
      // exchange symbol. Reject Binance's non-ASCII listings before the scan.
      if (!/^[A-Z0-9_]{3,24}$/.test(s.symbol))
        reasons.push("JEV_UNSUPPORTED_SYMBOL");
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
      entryMode: policy.entryMode,
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
    const symbolInfo = new Map(info.symbols.map((symbol) => [symbol.symbol, symbol]));
    await store.record(db, `universe:${id}`, "UNIVERSE", { cycleId: id, rows });
    const allowed = rows.filter((r) => r.status === "SELECTED" &&
      (!["relative", "scalp"].includes(policy.entryMode) ||
        policy.opportunityUniverse.includes(r.symbol)));
    let relativeMarket = null;
    let newOpportunityBtc = null;
    if (policy.entryMode === "new_opportunistic") {
      const interval = { "5m": 300000, "15m": 900000,
        "1h": 3600000, "4h": 14400000 }[policy.timeframe];
      const raw = await get(`${base}/klines?symbol=BTCUSDT&interval=${policy.timeframe}&limit=240`);
      newOpportunityBtc = raw.filter(r => Number(r[6]) < now()).map(r => ({
        time: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
        low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]),
        quoteVolume: Number(r[7]),
      }));
      validateBars(newOpportunityBtc, interval);
      if (now() - (newOpportunityBtc.at(-1).time + interval) > interval)
        throw Error("STALE_MARKET_DATA");
    }
    if (policy.entryMode === "relative") {
      const raw = await get(`${base}/klines?symbol=BTCUSDT&interval=1h&limit=800`);
      const btc = raw.filter(r => Number(r[6]) < now());
      const horizon = policy.relative.horizon;
      const macroBars = policy.relative.regime === "MACRO_30D" ? 720 :
        policy.relative.regime === "MACRO_7D" ? 168 : 0;
      if (btc.length < Math.max(49, horizon + 1, macroBars + 1))
        throw Error("RELATIVE_REFERENCE_INCOMPLETE");
      const last = Number(btc.at(-1)[4]);
      relativeMarket = { time: Number(btc.at(-1)[0]),
        reference: last / Number(btc.at(-horizon - 1)[4]) - 1,
        regime48h: last / Number(btc.at(-49)[4]) - 1,
        macro: macroBars ? last / Number(btc.at(-macroBars - 1)[4]) - 1 : 0 };
      if (Object.values(relativeMarket).some(x => !Number.isFinite(x)))
        throw Error("RELATIVE_REFERENCE_INVALID");
    }
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
    const checkedBySymbol = new Map();
    const note = (item, reasons, detail = {}) => {
      const list = Array.isArray(reasons) ? reasons : [reasons];
      let checked = checkedBySymbol.get(item.symbol);
      if (!checked) {
        checked = { symbol: item.symbol, reasons: [] };
        checkedBySymbol.set(item.symbol, checked);
        result.universeSummary.checked.push(checked);
      }
      Object.assign(checked, detail);
      for (const reason of list) {
        if (checked.reasons.includes(reason)) continue;
        checked.reasons.push(reason);
        result.universeSummary.reasons[reason] =
          (result.universeSummary.reasons[reason] || 0) + 1;
      }
      result.universeSummary.scanned = result.universeSummary.checked.length;
    };
    const technicalCandidates = [];
    for (const item of batch) {
      if (positions.some((p) => p.symbol === item.symbol)) {
        item.status = "REJECTED";
        item.reasons.push("ALREADY_OPEN");
        note(item, "ALREADY_OPEN");
        continue;
      }
      const interval = { "5m": 300000, "15m": 900000,
        "1h": 3600000, "4h": 14400000 }[policy.timeframe];
      const cacheKey = `${policy.timeframe}:${item.symbol}`;
      const bucket = Math.floor(now() / interval);
      let bars = candleCache.get(cacheKey)?.bucket === bucket
        ? candleCache.get(cacheKey).bars : null;
      const cached = Boolean(bars);
      if (!bars) {
        const raw = await get(
          `${base}/klines?symbol=${item.symbol}&interval=${policy.timeframe}&limit=240`,
        );
        bars = raw
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
        validateBars(bars, interval);
      }
      if (now() - (bars.at(-1).time + interval) > interval)
        throw Error("STALE_MARKET_DATA");
      if (policy.entryMode === "relative" && bars.at(-1).time !== relativeMarket.time)
        throw Error("RELATIVE_MARKET_TIME_MISMATCH");
      if (policy.entryMode === "new_opportunistic" &&
        bars.at(-1).time !== newOpportunityBtc.at(-1).time)
        throw Error("NEW_OPPORTUNITY_REFERENCE_TIME_MISMATCH");
      if (!cached) candleCache.set(cacheKey, { bucket, bars });
      const featureRows = calculate(bars, policy.scale, policy),
        scalpRow = policy.entryMode === "scalp"
          ? scalpInputs(bars, featureRows).at(-1) : null,
        f = featureRows.at(-1),
        price = bars.at(-1).close;
      const votes = policy.entryMode === "consensus10"
        ? consensus(f, policy.minVotes)
        : policy.entryMode === "opportunistic"
          ? assessOpportunity(bars, bars.length - 1, f, policy.opportunity)
          : policy.entryMode === "new_opportunistic"
          ? require("./new_opportunity_model").assess(bars, bars.length - 1, newOpportunityBtc)
          : policy.entryMode === "scalp"
            ? (() => { const proposal = assessScalp(scalpRow, policy.scalp);
              return { direction: proposal?.side || "NO_TRADE",
                score: proposal?.score || 0,
                inputs: proposal ? { model: policy.scalp.model,
                  ...scalpRow } : null }; })()
          : policy.entryMode === "relative"
            ? { direction: "PENDING", score: 0 }
          : { direction: signal(f, policy.pair), score: 0 };
      const direction = votes.direction;
      const failed = [];
      if (f.atr / price > policy.maxAtrFraction * 1.5)
        failed.push("ABNORMAL_VOLATILITY");
      const minimumRisk = minimumLotRisk(symbolInfo.get(item.symbol), price, f.atr, policy);
      if (minimumRisk > equity * policy.riskFraction)
        failed.push("MIN_LOT_RISK");
      if (policy.entryMode === "relative") {
        if (bars.length < policy.relative.horizon + 1)
          failed.push("RELATIVE_HISTORY_SHORT");
      } else if (direction === "NO_TRADE") failed.push(
        policy.entryMode === "consensus10" ? "INSUFFICIENT_VOTES" :
          policy.entryMode === "opportunistic" ? "NO_OPPORTUNISTIC_EDGE" :
          policy.entryMode === "new_opportunistic" ? "NO_NEW_OPPORTUNITY_SIGNAL" :
          policy.entryMode === "scalp" ? "NO_SCALP_EDGE" :
          "NO_TWO_INDICATOR_SIGNAL",
      );
      else if (!policy.directions.includes(direction))
        failed.push("DIRECTION_DISABLED");
      const detail = {
        indicators: (policy.entryMode === "consensus10"
          ? [...DIRECTIONAL, ...CONTEXTUAL] : policy.pair).map((name) => ({
          name,
          signal: f.signals[name]?.signal || "UNAVAILABLE",
        })),
        votes: votes.votes || null,
        opportunity: ["opportunistic", "scalp"].includes(policy.entryMode) ? votes.inputs : null,
        score: votes.score,
        minimumLotRisk: Number(minimumRisk.toFixed(6)),
      };
      if (failed.length) {
        const softReasons = failed.filter((reason) =>
          ["ABNORMAL_VOLATILITY", "MIN_LOT_RISK", "LOW_DEPTH"].includes(reason),
        );
        if (softReasons.length === failed.length) {
          item.status = "SOFT_REJECTED";
          item.reasons.push(...failed);
          note(item, failed, detail);
          technicalCandidates.push({
            item,
            bars,
            f,
            price,
            direction,
            votes,
            detail,
            softReasons: failed,
          });
          continue;
        }
        item.status = "REJECTED";
        item.reasons.push(...failed);
        note(item, failed, detail);
        continue;
      }
      technicalCandidates.push({ item, bars, f, price, direction, votes, detail });
      note(item, "TECHNICAL_CANDIDATE", detail);
    }
    let selectedCandidates = technicalCandidates;
    if (policy.entryMode === "relative") {
      if (Math.floor(relativeMarket.time / 3600000) %
        (policy.relative.selectionIntervalHours ?? 1) !== 0) {
        for (const c of technicalCandidates) {
          c.item.status = "REJECTED";
          c.item.reasons.push("RELATIVE_SELECTION_INTERVAL");
          note(c.item, "RELATIVE_SELECTION_INTERVAL", c.detail);
        }
        selectedCandidates = [];
      }
      const observations = technicalCandidates.map(c => ({
        symbol: c.item.symbol,
        own: c.price / c.bars.at(-policy.relative.horizon - 1).close - 1,
      }));
      const selected = new Map(selectRelative(observations, relativeMarket, policy.relative)
        .map(x => [x.symbol, x]));
      selectedCandidates = selectedCandidates.filter(c => {
        const proposal = selected.get(c.item.symbol);
        if (!proposal || !policy.directions.includes(proposal.side)) {
          c.item.status = "REJECTED";
          c.item.reasons.push("NO_RELATIVE_EDGE");
          note(c.item, "NO_RELATIVE_EDGE", c.detail);
          return false;
        }
        c.direction = proposal.side;
        c.votes = { direction: proposal.side, score: proposal.score,
          evidence: proposal.evidence };
        c.detail.opportunity = proposal.evidence;
        return true;
      });
    }
    const requiredDepthQuote = Math.max(
      policy.minDepthQuote,
      equity * (policy.maxMarginFractionPerPosition ?? 0.9) *
        (policy.maxLeverage ?? 10) * (policy.depthNotionalMultiple ?? 5),
    );
    const ranked = [];
    for (const candidate of selectedCandidates) {
      const { item, price, detail } = candidate;
      const depth = await get(`${base}/depth?symbol=${item.symbol}&limit=100`);
      const bestBid = Number(depth.bids?.[0]?.[0]);
      const bestAsk = Number(depth.asks?.[0]?.[0]);
      if (!(bestBid > 0 && bestAsk >= bestBid)) {
        item.status = "REJECTED";
        item.reasons.push("LOW_DEPTH");
        note(item, "LOW_DEPTH", detail);
        continue;
      }
      const depthReference = (bestBid + bestAsk) / 2;
      const depthQuote = Math.min(
        ...["bids", "asks"].map((side) =>
          (depth[side] || [])
            .filter(([p]) => Math.abs(Number(p) / depthReference - 1) <= 0.005)
            .reduce((s, [p, q]) => s + Number(p) * Number(q), 0),
        ),
      );
      if (
        !Number.isFinite(depthQuote)
      )
        throw Error("INVALID_MARKET_DATA");
      detail.depthQuote = Number(depthQuote.toFixed(2));
      detail.requiredDepthQuote = Number(requiredDepthQuote.toFixed(2));
      const relaxedDepthThreshold = Math.max(policy.minDepthQuote, requiredDepthQuote * 0.5);
      if (depthQuote < relaxedDepthThreshold) {
        item.status = "SOFT_REJECTED";
        item.reasons.push("LOW_DEPTH");
        note(item, "LOW_DEPTH", detail);
        candidate.softReasons = [...(candidate.softReasons || []), "LOW_DEPTH"];
      }
      candidate.depthQuote = depthQuote;
      const depthPenalty = Math.max(0, requiredDepthQuote - depthQuote) / Math.max(1, requiredDepthQuote) * 40;
      const volatilityPenalty = Math.max(0, (candidate.f.atr / price) - policy.maxAtrFraction) /
        Math.max(0.0001, policy.maxAtrFraction) * 15;
      candidate.rankScore = candidate.votes.score +
        Math.log10(Math.max(1, item.quoteVolume)) * 2 - item.spreadBps * 2 +
        Math.log10(Math.max(1, depthQuote / Math.max(1, relaxedDepthThreshold))) * 10 -
        depthPenalty - volatilityPenalty;
      note(item, [], { ...detail, rankScore: Number(candidate.rankScore.toFixed(2)) });
      ranked.push(candidate);
    }
    ranked.sort((a, b) => compareCandidates(a, b, policy.entryMode));
    result.universeSummary.technicalCandidates = technicalCandidates.length;
    result.universeSummary.marketQualified = ranked.length;
    let invalidJevCandidates = 0;
    for (const [rankIndex, candidate] of ranked.entries()) {
      const { item, bars, f, price, direction, votes, detail } = candidate;
      if (["relative", "scalp"].includes(policy.entryMode)) {
        const [previousSignals] = await db.execute(
          "SELECT id FROM trades WHERE symbol=? AND policy_version=? AND opened_at>=FROM_UNIXTIME(?) LIMIT 1",
          [item.symbol, policy.entryMode === "relative" ? "relative-reversal-v1" :
            "scalp-research-v1", bars.at(-1).time / 1000],
        );
        if (previousSignals.length) {
          item.status = "REJECTED";
          item.reasons.push("CLOSED_BAR_ALREADY_TRADED");
          note(item, "CLOSED_BAR_ALREADY_TRADED", detail);
          continue;
        }
      }
      const [funding, higher, shortBars] = await Promise.all([
        get(`${base}/premiumIndex?symbol=${item.symbol}`),
        get(`${base}/klines?symbol=${item.symbol}&interval=1d&limit=8`),
        get(`${base}/klines?symbol=${item.symbol}&interval=5m&limit=25`),
      ]);
      if (!Number.isFinite(Number(funding.lastFundingRate)))
        throw Error("INVALID_MARKET_DATA");
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
      const closedShort = shortBars.filter((r) => Number(r[6]) < now());
      const shortLast = closedShort.at(-1);
      const shortReference = closedShort.at(-7);
      const priorVolume = closedShort.slice(-21, -1).reduce((sum, row) => sum + Number(row[5]), 0) / 20;
      const shortCandles = closedShort.map((row) => ({
        time: Number(row[0]), high: Number(row[2]), low: Number(row[3]),
        close: Number(row[4]), volume: Number(row[5]),
      }));
      const trueRanges = shortCandles.slice(1).map((bar, index) =>
        Math.max(bar.high - bar.low,
          Math.abs(bar.high - shortCandles[index].close),
          Math.abs(bar.low - shortCandles[index].close)));
      const shortAtr = trueRanges.length >= 14
        ? trueRanges.slice(-14).reduce((sum, value) => sum + value, 0) / 14 : null;
      const shortTerm = shortLast && shortReference ? {
        momentum30mPct: (Number(shortLast[4]) / Number(shortReference[4]) - 1) * 100,
        relativeVolume: priorVolume > 0 ? Number(shortLast[5]) / priorVolume : null,
        lastRangePct: (Number(shortLast[2]) - Number(shortLast[3])) / Number(shortLast[4]) * 100,
        spreadBps: item.spreadBps,
        closedAt: Number(shortLast[6]),
        atr: shortAtr,
        recentCandles: shortCandles.slice(-8),
      } : null;
      const d = {
        symbol: item.symbol,
        timeframe: policy.timeframe,
        opportunityCycleId: id,
        marketDataAt: now(),
        indicators: {
          currentPrice: executionReferencePrice(policy.entryMode, price, shortLast),
          atr: f.atr,
        },
        passRisk: true,
        strategy: {
          version: policy.entryMode === "new_opportunistic" ? "new-opportunistic-v1" :
            policy.entryMode === "scalp" ? "scalp-research-v1" :
            policy.entryMode === "relative" ? "relative-reversal-v1" :
            policy.entryMode === "opportunistic" ? "opportunistic-v1" :
            policy.entryMode === "consensus10" ? "consensus-10-v1" : "two-indicator-v1",
          timeframe: policy.timeframe,
          reportId: report?.reportId ?? null,
          pair: policy.pair,
          directions: [direction],
          indicators: (policy.entryMode === "consensus10"
            ? [...DIRECTIONAL, ...CONTEXTUAL] : policy.pair)
            .map((name) => ({ name, ...f.signals[name] })),
          voteSummary: votes,
          opportunity: policy.entryMode === "new_opportunistic"
            ? { model: "INVERSE_MARKET_LOGIT", evidence: votes.inputs,
              probability: votes.probability, score: votes.score,
              params: { timeframe: policy.timeframe, maxHoldingBars: policy.maxHoldingBars } }
            : policy.entryMode === "scalp"
            ? { model: policy.scalp.model, evidence: votes.inputs,
              score: votes.score, params: policy.scalp }
            : policy.entryMode === "opportunistic"
            ? { model: policy.opportunity.model, evidence: votes.inputs,
              score: votes.score, params: policy.opportunity }
            : policy.entryMode === "relative"
              ? { model: policy.relative.mode, evidence: votes.evidence,
                score: votes.score, params: policy.relative } : null,
          candidateRank: rankIndex + 1,
          candidateCount: ranked.length,
          regime: f.regime,
          recentCandles: bars.slice(-60),
          volume: { last: bars.at(-1).volume, quote24h: item.quoteVolume },
          shortTerm,
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
      let jev = await evaluateJev(d);
      if (jev.reason === "JEV_INVALID_RESPONSE") jev = await evaluateJev(d);
      if (policy.mode === "shadow" && policy.entryMode === "scalp") {
        (result.shadowComparison ||= []).push({
          symbol: item.symbol, signalCandleTime: bars.at(-1).time,
          technicalSide: direction, technicalScore: votes.score,
          referencePrice: price, atr: f.atr,
          technicalPolicy: policy.scalp,
          jevSide: jev.decision, jevReason: jev.reason || null,
          jevProposal: jev.proposal || null,
        });
      }
      if (jev.decision !== direction || !jev.risk) {
        const reason = String(jev.reason || "JEV_NO_TRADE");
        item.status = "REJECTED";
        item.reasons.push("JEV_NO_TRADE");
        note(item, "JEV_NO_TRADE", { ...detail, jevReason: reason,
          jevExplanationCode: jev.explanationCode || null,
          jevConfidence: Number.isFinite(jev.confidence) ? jev.confidence : null });
        if (["JEV_INVALID_RESPONSE", "JEV_LEVERAGE_POLICY_DATA_UNAVAILABLE", "JEV_CAPACITY_UNAVAILABLE"].includes(reason)) {
          invalidJevCandidates++;
          if (invalidJevCandidates < 3) continue;
        }
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
        policyVersion: d.strategy.version,
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
module.exports = { cycle, universe, logDecision, readReport, batchOffset,
  minimumLotRisk, compareCandidates, executionReferencePrice };
