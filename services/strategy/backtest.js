"use strict";
const { calculate, signal, consensus } = require("./indicators"),
  { assess: assessOpportunity } = require("./opportunity_model"),
  { inputs: scalpInputs, assess: assessScalp } = require("./scalp_model"),
  { assess: assessNew } = require("./new_opportunity_model"),
  { levels, size, pnl } = require("./risk"),
  { metrics, breakdown } = require("./metrics"),
  { planProtection } = require("./trailing");
function prepare(dataset, scale = 1, signalPolicy = {}) {
  const fundingByBar = new Map();
  for (const f of dataset.funding) {
    const time =
      dataset.start +
      Math.floor((f.time - dataset.start) / dataset.intervalMs) *
        dataset.intervalMs;
    (fundingByBar.get(time) || fundingByBar.set(time, []).get(time)).push(f);
  }
  return { ...dataset, features: calculate(dataset.bars, scale, signalPolicy), fundingByBar };
}
function researchRule(feature,bars,index,rule) {
  const s=feature.signals,b=bars[index],rsi=Number(s.RSI.value),
    rvol=Number(s.RVOL.value),adx=Number(s.ADX.value?.adx),
    agree=(side,names)=>names.every(name=>s[name].signal===side);
  if(rule==='TREND') {
    if(adx<22||rvol<.8)return 'NO_TRADE';
    if(agree('LONG',['EMA','MACD','VWAP']))return 'LONG';
    if(agree('SHORT',['EMA','MACD','VWAP']))return 'SHORT';
  }
  if(rule==='BREAKOUT'&&index>=20&&rvol>=1.2&&adx>=22) {
    const previous=bars.slice(index-20,index);
    if(b.close>Math.max(...previous.map(x=>x.high)))return 'LONG';
    if(b.close<Math.min(...previous.map(x=>x.low)))return 'SHORT';
  }
  if(rule==='PULLBACK'&&rvol>=.8&&Number.isFinite(s.VWAP.value)) {
    if(s.EMA.signal==='LONG'&&rsi>=30&&rsi<45&&b.close<=s.VWAP.value)return 'LONG';
    if(s.EMA.signal==='SHORT'&&rsi>55&&rsi<=70&&b.close>=s.VWAP.value)return 'SHORT';
  }
  if(rule==='REVERSAL'&&rvol>=1) {
    if(rsi<=30&&s.BOLLINGER.signal==='SHORT')return 'LONG';
    if(rsi>=70&&s.BOLLINGER.signal==='LONG')return 'SHORT';
  }
  if(rule==='EMA_RSI'&&rvol>=1) {
    if(agree('LONG',['EMA','RSI']))return 'LONG';
    if(agree('SHORT',['EMA','RSI']))return 'SHORT';
  }
  if(rule==='MACD_RSI'&&rvol>=1) {
    if(agree('LONG',['MACD','RSI']))return 'LONG';
    if(agree('SHORT',['MACD','RSI']))return 'SHORT';
  }
  return 'NO_TRADE';
}
// Entry at the open AFTER latencyBars complete bars have elapsed. OHLC ambiguity:
// stop before target, adverse gap fills, no use of bar high to move its own stop.
function unitTrades(
  data,
  {
    pair,
    scale = 1,
    management = "existing",
    directions = ["LONG", "SHORT"],
    start,
    end,
    policy,
    entrySignals = null,
    entryMode = "pair",
    fast = null,
    opportunity = null,
    scalp = null,
  },
) {
  const { bars, features, intervalMs, funding } = data,
    output = [];
  if (entryMode === "new_opportunistic" &&
    (!Array.isArray(data.btcBars) || data.btcBars.length !== bars.length ||
      data.btcBars.some((bar, index) => bar.time !== bars[index].time)))
    throw Error("NEW_OPPORTUNITY_REFERENCE_TIME_MISMATCH");
  const scalpRows = entryMode === "scalp" ?
    (data.scalpInputs || scalpInputs(bars, features)) : null;
  let pos = null;
  const executionBps = policy.slippageBps + (policy.spreadBps ?? 0) / 2;
  const slip = executionBps / 10000,
    fee = policy.feeRate,
    close = (price, time, reason) => {
      const exit = price * (1 - pos.sign * slip),
        result = pnl({
          side: pos.side,
          entry: pos.entry,
          exit,
          quantity: pos.remaining,
          feeRate: fee,
          funding: 0,
        });
      // Entry commission for partial legs is accounted proportionally in each pnl call.
      const costs = pos.funding;
      const gross = pos.gross + result.gross,
        fees = pos.fees + result.fees,
        net = gross - fees - costs;
      output.push({
        ...pos,
        exit,
        exitTime: time,
        exitReason: reason,
        gross,
        fees,
        funding: costs,
        net,
        r: net / pos.riskPerUnit,
      });
      pos = null;
    };
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.time < start || b.time >= end) continue;
    if (!pos) {
      const si = i - 1 - policy.latencyBars;
      if (si < 0) continue;
      const f = features[si];
      if (!f?.ready || bars[si].time < start) continue;
      let side, provided, vote = null;
      if (entrySignals) {
        provided = entrySignals.get(b.time);
        side = provided?.side || "NO_TRADE";
      } else if (entryMode === "consensus10") {
        vote = consensus(f, fast?.minVotes ?? policy.minVotes ?? 5);
        side = vote.direction;
      } else if (entryMode === 'rule') {
        side=researchRule(f,bars,si,fast?.rule);
        vote=consensus(f,5);
      } else if (entryMode === "opportunistic") {
        vote = assessOpportunity(bars, si, f, opportunity || {});
        side = vote.direction;
      } else if (entryMode === "new_opportunistic") {
        vote = assessNew(bars, si, data.btcBars);
        side = vote.direction;
      } else if (entryMode === "scalp") {
        vote = assessScalp(scalpRows[si], scalp || {});
        side = vote?.side || "NO_TRADE";
      } else side = signal(f, pair);
      if (!directions.includes(side)) continue;
      const recent = bars.slice(
          Math.max(0, si - Math.ceil(86400000 / intervalMs) + 1),
          si + 1,
        ),
        quote = recent.reduce((s, x) => s + x.quoteVolume, 0);
      if (
        !entrySignals &&
        (quote < policy.minQuoteVolume ||
          f.atr / bars[si].close > policy.maxAtrFraction ||
          bars[si].volume <= 0)
      )
        continue;
      const sign = side === "LONG" ? 1 : -1,
        entry = b.open * (1 + sign * slip);
      let stop, target;
      try {
        const history = bars.slice(Math.max(0, si - 200), si + 1);
        ({ stop, target } =
          provided?.stop && provided?.target
            ? provided
            : levels({
                bars: fast ? history.slice(-(fast.structureBars ?? 6)) : history,
                entry: bars[si].close,
                side,
                atr: f.atr,
                stopAtr: fast ? fast.stopAtr : 1.5 * scale,
                targetAtr: 3 * scale,
              }));
        if (fast && !provided) {
          const distance = Math.abs(entry - stop);
          const cost = entry * (2 * (fee + slip) + policy.fundingReserve);
          target = entry + sign * Math.max(distance * fast.targetR,
            distance * (fast.minNetR ?? 1) + cost * (1 + (fast.minNetR ?? 1)));
        }
        size({
          entry,
          stop,
          target,
          side,
          allowedRisk: 100,
          availableMargin: 100000,
          leverage: 1,
          feeRate: fee,
          slippageBps: executionBps,
        });
      } catch {
        continue;
      }
      pos = {
        symbol: data.symbol,
        timeframe: data.timeframe,
        pair,
        side,
        sign,
        entry,
        stop,
        initialStop: stop,
        target,
        entryTime: b.time,
        signalTime: bars[si].time + intervalMs,
        regime: f.regime,
        indicators: pair?.map((name) => ({ name, ...f.signals[name] })),
        atr: f.atr,
        remaining: 1,
        gross: 0,
        fees: 0,
        funding: 0,
        mae: 0,
        mfe: 0,
        stage: "INITIAL",
        riskPerUnit:
          Math.abs(entry - stop) +
          (entry + stop) * (fee + slip) +
          entry * policy.fundingReserve,
        management,
        leverage: 1,
        rankScore: provided?.score ?? vote?.score ?? 0,
        pendingExit: null,
        highWaterR: 0,
        closes: [],
      };
    }
    if (!pos) continue;
    if (pos.pendingExit) {
      close(b.open,b.time,pos.pendingExit);
      continue;
    }
    const adverse = pos.sign === 1 ? b.low : b.high,
      favorable = pos.sign === 1 ? b.high : b.low;
    pos.mae = Math.max(pos.mae, -pos.sign * (adverse - pos.entry));
    pos.mfe = Math.max(pos.mfe, pos.sign * (favorable - pos.entry));
    const stopHit = pos.sign === 1 ? b.low <= pos.stop : b.high >= pos.stop,
      targetHit = pos.sign === 1 ? b.high >= pos.target : b.low <= pos.target;
    // Unknown intrabar exit time: reserve debits for the exit bar, but never
    // award credits that may have occurred after an intrabar exit or before entry.
    for (const f of data.fundingByBar.get(b.time) || []) {
      if (f.time < pos.entryTime) continue;
      const cost = pos.sign * pos.remaining * f.rate * f.markPrice;
      const definitelyHeld =
        f.time > pos.entryTime &&
        ((!stopHit && !targetHit) || f.time === b.time);
      if (cost > 0 || definitelyHeld) pos.funding += cost;
    }
    if (stopHit) {
      close(
        pos.sign === 1
          ? Math.min(b.open, pos.stop)
          : Math.max(b.open, pos.stop),
        b.time + intervalMs,
        "STOP",
      );
      continue;
    }
    if (targetHit) {
      close(pos.target, b.time + intervalMs, "TARGET");
      continue;
    }
    const distance = Math.abs(pos.entry - pos.initialStop);
    pos.highWaterR = Math.max(pos.highWaterR,
      pos.sign * (favorable - pos.entry) / distance);
    pos.closes.push(b.close);
    if (pos.closes.length > 4) pos.closes.shift();
    if (fast && b.time + intervalMs < end) {
      const hours = (b.time + intervalMs - pos.entryTime) / 3600000;
      const currentR = pos.sign * (b.close - pos.entry) / distance;
      const momentumR = pos.closes.length >= 4
        ? pos.sign * (pos.closes.at(-1) - pos.closes[0]) / distance : 0;
      const netPerUnit = pos.sign * (b.close - pos.entry) -
        (pos.entry + b.close) * fee;
      if (hours >= fast.maxHours) pos.pendingExit = 'MAX_HOLD';
      else if (fast.reversal && hours >= .75 && pos.highWaterR >= fast.reversal &&
        currentR <= Math.max(.2, pos.highWaterR - .4) && momentumR < 0)
        pos.pendingExit = 'REVERSAL';
      else if (fast.earlyLoss && hours >= 1.5 && currentR <= -.35 && momentumR <= -.1)
        pos.pendingExit = 'EARLY_LOSS';
      else if (fast.staleHours && hours >= fast.staleHours && netPerUnit <= 0)
        pos.pendingExit = 'STALE_LOSS';
      if (pos.pendingExit) continue;
    }
    if (
      (!fast && (b.time - pos.entryTime) / intervalMs >= policy.maxHoldingBars - 1) ||
      b.time + intervalMs >= end
    ) {
      close(
        b.close,
        b.time + intervalMs,
        b.time + intervalMs >= end ? "SEGMENT_END" : "TIME_EXIT",
      );
      continue;
    }
    const r = (pos.sign * (b.close - pos.entry)) / distance,
      be =
        pos.side === "LONG"
          ? (pos.entry * (1 + fee + slip)) / (1 - fee - slip)
          : (pos.entry * (1 - fee - slip)) / (1 + fee + slip);
    if (management === "partial" && r >= 1 && pos.remaining === 1) {
      const price = b.close * (1 - pos.sign * slip),
        partial = pnl({
          side: pos.side,
          entry: pos.entry,
          exit: price,
          quantity: 0.5,
          feeRate: fee,
        });
      pos.gross += partial.gross;
      pos.fees += partial.fees;
      pos.remaining = 0.5;
      pos.partialTime = b.time + intervalMs;
      pos.partialPrice = price;
    }
    let next = null;
    if (management === "existing") {
      const plan = planProtection({
        positionSide: pos.side,
        entryPrice: pos.entry,
        initialRisk: distance,
        slPrice: pos.stop,
        price: b.close,
        tick: pos.entry * 1e-8,
        atr: features[i].atr,
        tp: pos.target,
        hoursOpen: (b.time + intervalMs - pos.entryTime) / 3600000,
        stage: pos.stage,
      });
      next = plan.chosen?.stop;
      pos.stage = plan.newStage;
    } else if (["breakeven", "partial"].includes(management) && r >= 1)
      next = be;
    else if (management === "trail" && r >= 2)
      next = b.close - pos.sign * features[i].atr;
    else if (management === "lock" && r >= 1.5)
      next = pos.entry + pos.sign * distance * 0.5;
    if (
      Number.isFinite(next) &&
      pos.sign * (next - pos.stop) > 0 &&
      pos.sign * (b.close - next) > features[i].atr * 0.5
    )
      pos.stop = next;
  }
  return output;
}
function portfolio(unit, datasets, { policy, start, end, leverage = 1,
  maxMarginFractionPerPosition = 1 }) {
  const sorted = [...unit].sort(
      (a, b) => a.entryTime - b.entryTime || (b.rankScore || 0) - (a.rankScore || 0) ||
        a.symbol.localeCompare(b.symbol),
    ),
    completed = [],
    open = [];
  let cash = policy.initialCapital,
    peak = cash,
    halt = false,
    streak = 0;
  const equity = [{ time: start, equity: cash }],
    bySymbol = new Map(datasets.map((d) => [d.symbol, d]));
  const fundingPrefix = new Map(datasets.map((d) => {
    const sums=[0];
    for(const f of d.funding) sums.push(sums.at(-1)+f.rate*f.markPrice);
    return [d.symbol,{events:d.funding,sums}];
  }));
  function fundingBetween(symbol,from,to) {
    const {events,sums}=fundingPrefix.get(symbol);
    const lower=(time)=>{let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;
      if(events[mid].time<time)lo=mid+1;else hi=mid;}return lo;};
    return sums[lower(to)]-sums[lower(from)];
  }
  let index = 0,
    skipped = 0;
  const times = new Set([start, end]);
  for (const d of datasets)
    for (const b of d.bars)
      if (b.time >= start && b.time < end) times.add(b.time + d.intervalMs);
  for (const t of sorted) {
    times.add(t.entryTime);
    times.add(t.exitTime);
  }
  function unreal(t, time) {
    const d = bySymbol.get(t.symbol),
      i = Math.max(
        0,
        Math.min(
          d.bars.length - 1,
          Math.floor((time - d.bars[0].time) / d.intervalMs) - 1,
        ),
      ),
      price = d.bars[i].close;
    const partial = t.partialTime && t.partialTime <= time,
      remaining = partial ? 0.5 : 1;
    const realized = partial
      ? 0.5 *
        (t.sign * (t.partialPrice - t.entry) -
          (t.entry + t.partialPrice) * policy.feeRate)
      : 0;
    const funding = t.sign * (fundingBetween(t.symbol,t.entryTime,time) -
      (t.partialTime && t.partialTime < time
        ? .5 * fundingBetween(t.symbol,t.partialTime,time) : 0));
    return (
      t.quantity *
      (realized +
        remaining *
          (t.sign * (price - t.entry) - (t.entry + price) * policy.feeRate) -
        funding)
    );
  }

  for (const time of [...times].sort((a, b) => a - b)) {
    for (let j = open.length - 1; j >= 0; j--)
      if (open[j].exitTime <= time) {
        const t = open.splice(j, 1)[0];
        cash += t.net;
        completed.push(t);
        streak = t.net < 0 ? streak + 1 : 0;
      }
    const marked = cash + open.reduce((s, t) => s + unreal(t, time), 0);
    peak = Math.max(peak, marked);
    equity.push({ time, equity: marked });
    if (
      marked <= 0 ||
      (peak - marked) / peak >= policy.maxDrawdown ||
      streak >= policy.maxLossStreak
    )
      halt = true;
    while (index < sorted.length && sorted[index].entryTime <= time) {
      const t = sorted[index++];
      if (
        halt ||
        t.entryTime !== time ||
        open.length >= policy.maxPositions ||
        open.some((p) => p.symbol === t.symbol)
      ) {
        skipped++;
        continue;
      }
      const usedRisk = open.reduce((s, t) => s + t.risk, 0),
        usedMargin = open.reduce((s, t) => s + t.margin, 0),
        risk = Math.min(
          marked * policy.riskFraction,
          marked * policy.maxPortfolioRisk - usedRisk,
        ),
        margin = Math.max(0, Math.min(marked * 0.9 - usedMargin,
          marked * maxMarginFractionPerPosition));
      const qty = Math.min(
        risk / t.riskPerUnit,
        margin / (t.entry / leverage + t.entry * policy.feeRate),
      );
      const initialMargin=qty*t.entry/leverage;
      const stopRisk=qty*t.riskPerUnit;
      if (!(qty > 0) || initialMargin-stopRisk <=
        qty*t.stop*(policy.maintenanceRate ?? .01)+initialMargin*.1) {
        skipped++;
        continue;
      }
      open.push({
        ...t,
        quantity: qty,
        risk: stopRisk,
        margin: initialMargin,
        leverage,
        gross: t.gross * qty,
        fees: t.fees * qty,
        funding: t.funding * qty,
        net: t.net * qty,
        mae: t.mae * qty,
        mfe: t.mfe * qty,
      });
    }
  }
  return {
    metrics: metrics(completed, policy.initialCapital, equity, start, end),
    breakdown: breakdown(completed, policy.initialCapital),
    trades: completed,
    equity,
    halted: halt,
    skipped,
  };
}
function run(datasets, options) {
  return portfolio(
    datasets.flatMap((d) => unitTrades(d, {
      ...options,
      entrySignals: options.entrySignalsBySymbol?.get(d.symbol) || options.entrySignals || null,
    })),
    datasets,
    options,
  );
}
module.exports = { prepare, researchRule, unitTrades, portfolio, run };
