'use strict';

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || '/tmp/quant-audit-input.json';
const outputPath = process.argv[3] || '/tmp/quant-ablation-results.json';
const cacheDir = process.env.QUANT_AUDIT_CACHE || '/tmp/aterum-quant-cache';
const horizonHours = Number(process.env.QUANT_AUDIT_HORIZON_HOURS || 6);
const policyStart = new Date(process.env.QUANT_AUDIT_POLICY_START || '2026-07-01T15:51:08.429Z');
const referenceEquity = Number(process.env.QUANT_AUDIT_REFERENCE_EQUITY || 192.6671);
const riskUnit = referenceEquity * 0.01;
const requestDelayMs = Math.max(500, Number(process.env.QUANT_AUDIT_REQUEST_DELAY_MS || 750));

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function json(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(number(value) * factor) / factor;
}

function component(candidate, name) {
  return candidate.contributions.find(row => row.component === name);
}

function researchMarginal(candidate) {
  return candidate.contributions
    .filter(row => String(row.component || '').startsWith('learning.'))
    .reduce((sum, row) => {
      const weight = number(row.weight, 1);
      const observed = weight * number(row.researchFactor, 1) * number(row.reviewFactor, 1);
      const without = Math.max(-3, Math.min(3, (weight - 1) * 25));
      const withExternal = Math.max(-3, Math.min(3, (observed - 1) * 25));
      return sum + (withExternal - without);
    }, 0);
}

function normalizeCandidate(row) {
  const metrics = json(row.metrics, {});
  return {
    ...row,
    technicalScore: number(row.technical_score),
    learningDelta: number(row.learning_delta),
    finalScore: number(row.final_score),
    threshold: number(row.threshold, 65),
    selected: number(row.selected) === 1,
    contributions: json(row.contributions, []),
    blockers: json(row.blockers, []),
    metrics,
    evaluatedAt: new Date(row.evaluated_at),
    entryPrice: number(metrics?.indicators?.currentPrice),
    atr: number(metrics?.indicators?.atr)
  };
}

const scenarios = {
  baseline: {
    label: 'Sistema completo',
    score: candidate => candidate.finalScore,
    blockers: candidate => candidate.blockers
  },
  noMacro: {
    label: 'Sin Macro',
    score: candidate => candidate.finalScore - number(component(candidate, 'macro')?.value),
    blockers: candidate => candidate.blockers
  },
  noIntelligence: {
    label: 'Sin Intelligence',
    score: candidate => candidate.finalScore - number(component(candidate, 'intelligence')?.value),
    blockers: candidate => candidate.blockers
  },
  noLearning: {
    label: 'Sin Learning',
    score: candidate => candidate.technicalScore,
    blockers: candidate => candidate.blockers.filter(row => row.code !== 'LEARNING_HARD_BLOCK')
  },
  noResearch: {
    label: 'Sin Research/Review',
    score: candidate => candidate.finalScore - researchMarginal(candidate),
    blockers: candidate => candidate.blockers
  },
  noCorrelation: {
    label: 'Sin Correlation Filter',
    score: candidate => candidate.finalScore,
    blockers: candidate => candidate.blockers.filter(row => row.code !== 'PORTFOLIO_CORRELATION')
  },
  noPortfolioCapacity: {
    label: 'Sin Portfolio Capacity',
    score: candidate => candidate.finalScore,
    blockers: candidate => candidate.blockers.filter(row => !['PORTFOLIO_CAPACITY_FULL', 'MAX_PORTFOLIO_POSITIONS'].includes(row.code))
  }
};

function select(candidates, scenario) {
  return candidates
    .map(candidate => ({ ...candidate, scenarioScore: scenario.score(candidate), scenarioBlockers: scenario.blockers(candidate) }))
    .filter(candidate => candidate.direction !== 'NEUTRAL')
    .filter(candidate => candidate.scenarioScore >= candidate.threshold)
    .filter(candidate => candidate.scenarioBlockers.length === 0)
    .sort((left, right) => right.scenarioScore - left.scenarioScore || right.finalScore - left.finalScore)[0] || null;
}

function cacheName(symbol, start, end) {
  return path.join(cacheDir, `${symbol}-${start}-${end}.json`);
}

async function fetchKlines(symbol, start, end) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = cacheName(symbol, start, end);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = [];
  let cursor = start;
  while (cursor < end) {
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '5m');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(end));
    url.searchParams.set('limit', '1500');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (response.status === 418 || response.status === 429) {
      throw new Error(`${symbol}: Binance rate limit ${response.status}; stop audit and wait before retrying`);
    }
    if (!response.ok) throw new Error(`${symbol}: Binance ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch) || !batch.length) break;
    rows.push(...batch);
    const next = number(batch[batch.length - 1][0]) + 300000;
    if (next <= cursor) break;
    cursor = next;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

async function marketDataFor(signals) {
  const windows = new Map();
  const horizonMs = horizonHours * 3600000;
  for (const signal of signals) {
    const timestamp = signal.evaluatedAt.getTime();
    const current = windows.get(signal.symbol) || { start: timestamp, end: timestamp + horizonMs };
    current.start = Math.min(current.start, timestamp);
    current.end = Math.max(current.end, timestamp + horizonMs);
    windows.set(signal.symbol, current);
  }
  const entries = [...windows.entries()];
  const data = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      const [symbol, window] = entries[index];
      try {
        data.set(symbol, await fetchKlines(symbol, window.start, window.end));
      } catch (error) {
        data.set(symbol, { error: error.message, rows: [] });
      }
      await new Promise(resolve => setTimeout(resolve, requestDelayMs));
    }
  }
  // Production shares this public IP. Keep historical downloads serial to leave
  // headroom for position protection and workflow traffic.
  await worker();
  return data;
}

function outcome(signal, marketData) {
  if (!signal || !(signal.entryPrice > 0) || !(signal.atr > 0)) return { available: false, reason: 'missing_entry_or_atr' };
  const source = marketData.get(signal.symbol);
  const rows = Array.isArray(source) ? source : source?.rows || [];
  const start = signal.evaluatedAt.getTime();
  const end = start + horizonHours * 3600000;
  const future = rows.filter(row => number(row[0]) >= start && number(row[0]) < end);
  if (!future.length) return { available: false, reason: source?.error || 'missing_future_klines' };
  const distance = signal.atr * 1.5;
  const long = signal.direction === 'LONG';
  const stop = long ? signal.entryPrice - distance : signal.entryPrice + distance;
  const target = long ? signal.entryPrice + distance * 2 : signal.entryPrice - distance * 2;
  for (const row of future) {
    const high = number(row[2]);
    const low = number(row[3]);
    const stopHit = long ? low <= stop : high >= stop;
    const targetHit = long ? high >= target : low <= target;
    if (stopHit && targetHit) return { available: true, r: -1, result: 'SL_AMBIGUOUS', exitAt: row[0] };
    if (stopHit) return { available: true, r: -1, result: 'SL', exitAt: row[0] };
    if (targetHit) return { available: true, r: 2, result: 'TP', exitAt: row[0] };
  }
  const close = number(future[future.length - 1][4]);
  const r = (long ? close - signal.entryPrice : signal.entryPrice - close) / distance;
  return { available: true, r: round(r, 6), result: 'HORIZON', exitAt: future[future.length - 1][6] };
}

function metrics(rows, totalCycles) {
  const available = rows.filter(row => row.outcome.available);
  const rs = available.map(row => row.outcome.r);
  const wins = rs.filter(value => value > 0).length;
  const losses = rs.filter(value => value < 0).length;
  const grossProfit = rs.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(rs.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of rs) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  return {
    operations: available.length,
    missingOutcomes: rows.length - available.length,
    wins,
    losses,
    winRate: available.length ? round(wins / available.length * 100, 2) : null,
    expectancyR: available.length ? round(rs.reduce((sum, value) => sum + value, 0) / available.length, 4) : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : grossProfit > 0 ? null : 0,
    pnlR: round(equity, 4),
    standardizedPnl: round(equity * riskUnit, 4),
    maxDrawdownR: round(maxDrawdown, 4),
    standardizedDrawdown: round(maxDrawdown * riskUnit, 4),
    selectionRatePct: totalCycles ? round(rows.length / totalCycles * 100, 2) : 0,
    standardizedRiskDeployedPct: totalCycles ? round(available.length / totalCycles, 4) : 0
  };
}

function rng(seed = 271828) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bootstrapDelta(baselineRows, scenarioRows, cycleIds, iterations = 5000) {
  const baseline = new Map(baselineRows.filter(row => row.outcome.available).map(row => [row.cycleId, row.outcome.r]));
  const scenario = new Map(scenarioRows.filter(row => row.outcome.available).map(row => [row.cycleId, row.outcome.r]));
  const ids = cycleIds.filter(id => baseline.has(id) || scenario.has(id));
  if (ids.length < 3) return { cycles: ids.length, deltaExpectancyR: null, ci95: [null, null] };
  const random = rng();
  const values = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let delta = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[Math.floor(random() * ids.length)];
      delta += number(scenario.get(id)) - number(baseline.get(id));
    }
    values.push(delta / ids.length);
  }
  values.sort((left, right) => left - right);
  const actual = ids.reduce((sum, id) => sum + number(scenario.get(id)) - number(baseline.get(id)), 0) / ids.length;
  return {
    cycles: ids.length,
    deltaExpectancyR: round(actual, 4),
    ci95: [round(values[Math.floor(values.length * 0.025)], 4), round(values[Math.floor(values.length * 0.975)], 4)]
  };
}

function actualSizing(data) {
  const closes = new Map(data.closes.map(row => [number(row.trade_id), row]));
  const rows = data.trades.filter(row => closes.has(number(row.id)) && new Date(row.opened_at) >= policyStart).map(trade => {
    const close = closes.get(number(trade.id));
    return {
      pnl: number(close.pnl_usdt),
      r: number(close.r_final),
      riskAmount: number(trade.max_loss),
      fixedPnl: number(close.r_final) * riskUnit
    };
  });
  function summarize(key) {
    const values = rows.map(row => row[key]);
    const wins = values.filter(value => value > 0);
    const losses = values.filter(value => value < 0);
    let equity = 0;
    let peak = 0;
    let drawdown = 0;
    for (const value of values) {
      equity += value;
      peak = Math.max(peak, equity);
      drawdown = Math.min(drawdown, equity - peak);
    }
    return {
      operations: values.length,
      winRate: values.length ? round(wins.length / values.length * 100, 2) : null,
      expectancy: values.length ? round(equity / values.length, 4) : null,
      profitFactor: losses.length ? round(wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)), 4) : null,
      pnl: round(equity, 4),
      maxDrawdown: round(drawdown, 4)
    };
  }
  return { dynamic: summarize('pnl'), fixedOnePct: summarize('fixedPnl'), rows };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const opportunities = data.opportunities.map(normalizeCandidate);
  const cycles = data.cycles.filter(row => number(row.candidate_size) > 0);
  const groups = new Map();
  for (const candidate of opportunities) {
    const list = groups.get(candidate.cycle_id) || [];
    list.push(candidate);
    groups.set(candidate.cycle_id, list);
  }
  const now = Date.now();
  const horizonMs = horizonHours * 3600000;
  const cohorts = {
    exploratoryAll: cycles.filter(row => new Date(row.started_at).getTime() + horizonMs <= now),
    currentPolicy: cycles.filter(row => new Date(row.started_at) >= policyStart && new Date(row.started_at).getTime() + horizonMs <= now)
  };
  const allSignals = [];
  const selections = {};
  for (const [cohortName, cohortCycles] of Object.entries(cohorts)) {
    selections[cohortName] = {};
    for (const [scenarioName, scenario] of Object.entries(scenarios)) {
      selections[cohortName][scenarioName] = cohortCycles.map(cycle => {
        const signal = select(groups.get(cycle.id) || [], scenario);
        if (signal) allSignals.push(signal);
        return { cycleId: cycle.id, cycleAt: cycle.started_at, signal };
      }).filter(row => row.signal);
    }
  }
  const uniqueSignals = [...new Map(allSignals.map(signal => [`${signal.symbol}:${signal.evaluatedAt.toISOString()}`, signal])).values()];
  const matureCandidates = opportunities.filter(candidate => candidate.evaluatedAt.getTime() + horizonMs <= now);
  const highQualityRejected = matureCandidates.filter(candidate => !candidate.selected
    && candidate.direction !== 'NEUTRAL' && candidate.technicalScore >= 80);
  const marketData = await marketDataFor([...uniqueSignals, ...highQualityRejected]);
  const results = {};
  for (const [cohortName, cohortCycles] of Object.entries(cohorts)) {
    results[cohortName] = {};
    const rowsByScenario = {};
    for (const [scenarioName, rows] of Object.entries(selections[cohortName])) {
      rowsByScenario[scenarioName] = rows.map(row => ({
        cycleId: row.cycleId,
        cycleAt: row.cycleAt,
        symbol: row.signal.symbol,
        direction: row.signal.direction,
        score: round(row.signal.scenarioScore),
        baselineScore: round(row.signal.finalScore),
        outcome: outcome(row.signal, marketData)
      }));
      results[cohortName][scenarioName] = {
        label: scenarios[scenarioName].label,
        metrics: metrics(rowsByScenario[scenarioName], cohortCycles.length),
        changedSelectionCycles: scenarioName === 'baseline' ? 0 : cohortCycles.filter(cycle => {
          const baseline = selections[cohortName].baseline.find(row => row.cycleId === cycle.id)?.signal;
          const altered = rows.find(row => row.cycleId === cycle.id)?.signal;
          return (baseline?.symbol || null) !== (altered?.symbol || null);
        }).length,
        signals: rowsByScenario[scenarioName]
      };
    }
    const ids = cohortCycles.map(row => row.id);
    for (const scenarioName of Object.keys(scenarios)) {
      results[cohortName][scenarioName].marginalVsBaseline = scenarioName === 'baseline'
        ? { cycles: ids.length, deltaExpectancyR: 0, ci95: [0, 0] }
        : bootstrapDelta(rowsByScenario.baseline, rowsByScenario[scenarioName], ids);
    }
  }

  const blockerCounts = {};
  for (const candidate of opportunities) {
    for (const blocker of candidate.blockers) blockerCounts[blocker.code] = (blockerCounts[blocker.code] || 0) + 1;
  }
  const funnel = {
    cyclesTotal: data.cycles.length,
    cyclesCompleted: cycles.length,
    universeInstances: data.cycles.reduce((sum, row) => sum + number(row.universe_size), 0),
    eligibleInstances: data.cycles.reduce((sum, row) => sum + number(row.eligible_size), 0),
    refreshedInstances: data.cycles.reduce((sum, row) => sum + number(row.refreshed_size), 0),
    evaluatedCandidates: opportunities.length,
    selectedCandidates: opportunities.filter(row => row.selected).length,
    primaryReasons: Object.fromEntries(Object.entries(opportunities.reduce((acc, row) => {
      acc[row.primary_reason] = (acc[row.primary_reason] || 0) + 1;
      return acc;
    }, {})).sort((left, right) => right[1] - left[1])),
    blockers: Object.fromEntries(Object.entries(blockerCounts).sort((left, right) => right[1] - left[1])),
    executions: data.executions.reduce((acc, row) => {
      const key = `${row.request_type}:${row.final_status}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  };

  const highQualityRows = highQualityRejected.map(candidate => ({
    id: candidate.id,
    cycleId: candidate.cycle_id,
    evaluatedAt: candidate.evaluatedAt.toISOString(),
    symbol: candidate.symbol,
    direction: candidate.direction,
    technicalScore: candidate.technicalScore,
    finalScore: candidate.finalScore,
    primaryReason: candidate.primary_reason,
    blockers: candidate.blockers.map(row => row.code),
    outcome: outcome(candidate, marketData)
  })).filter(row => row.outcome.available);
  const highQualityByReason = {};
  for (const row of highQualityRows) {
    const reason = row.primaryReason || row.blockers[0] || 'UNKNOWN';
    const bucket = highQualityByReason[reason] || [];
    bucket.push(row);
    highQualityByReason[reason] = bucket;
  }
  const highQualitySummary = Object.fromEntries(Object.entries(highQualityByReason).map(([reason, rows]) => [reason, {
    ...metrics(rows, rows.length),
    winnersAtLeastOneR: rows.filter(row => row.outcome.r >= 1).length,
    fullTargets: rows.filter(row => row.outcome.result === 'TP').length
  }]));
  const currentHighQualityRows = highQualityRows.filter(row => new Date(row.evaluatedAt) >= policyStart);
  const currentHighQualityByReason = {};
  for (const row of currentHighQualityRows) {
    const reason = row.primaryReason || row.blockers[0] || 'UNKNOWN';
    const bucket = currentHighQualityByReason[reason] || [];
    bucket.push(row);
    currentHighQualityByReason[reason] = bucket;
  }
  const summarizeRejected = rowsByReason => Object.fromEntries(Object.entries(rowsByReason).map(([reason, rows]) => [reason, {
    ...metrics(rows, rows.length),
    winnersAtLeastOneR: rows.filter(row => row.outcome.r >= 1).length,
    fullTargets: rows.filter(row => row.outcome.result === 'TP').length
  }]));

  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      policyStart: policyStart.toISOString(), horizonHours, candleInterval: '5m', stopR: -1, targetR: 2,
      sameCandleResolution: 'SL_CONSERVATIVE', referenceEquity, riskUnit,
      warning: 'Entry-policy ablation. It does not replay production trailing or simultaneous counterfactual portfolios.'
    },
    cohortSizes: Object.fromEntries(Object.entries(cohorts).map(([key, value]) => [key, value.length])),
    results,
    actualPositionSizer: actualSizing(data),
    funnel,
    highQualityRejected: {
      definition: 'technical_score >= 80, direction non-neutral, not selected, mature six-hour horizon',
      total: highQualityRows.length,
      byReason: highQualitySummary,
      currentPolicy: {
        total: currentHighQualityRows.length,
        byReason: summarizeRejected(currentHighQualityByReason),
        strongestMissedWinners: currentHighQualityRows.filter(row => row.outcome.r > 0)
          .sort((left, right) => right.outcome.r - left.outcome.r).slice(0, 25)
      },
      strongestMissedWinners: highQualityRows.filter(row => row.outcome.r > 0)
        .sort((left, right) => right.outcome.r - left.outcome.r)
        .slice(0, 25)
    }
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ outputPath, cohortSizes: output.cohortSizes, symbolsFetched: marketData.size }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
