'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const { parse } = require('/usr/lib/node_modules/n8n/node_modules/flatted');
const shared = require('../shared');

const execFileAsync = promisify(execFile);

const N8N_DB = process.env.N8N_SQLITE_DB || '/home/n8n/.n8n/database.sqlite';
const WORKFLOW_ID = process.env.N8N_TRADING_WORKFLOW_ID || 'Cz4TfvaVAygWGRJm';
const BINANCE_BASE = 'https://fapi.binance.com';
const CACHE_MS = 90 * 1000;

let cache = null;

function clampInt(value, fallback, min, max) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

async function sqliteRows(sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', N8N_DB, sql], {
    maxBuffer: 1024 * 1024 * 100
  });
  const text = String(stdout || '').trim();
  return text ? JSON.parse(text) : [];
}

function nodeItems(runData, name) {
  const runs = runData?.[name] || [];
  const last = runs[runs.length - 1];
  return last?.data?.main?.[0]?.map(item => item.json).filter(Boolean) || [];
}

function firstNodeItem(runData, name) {
  return nodeItems(runData, name)[0] || null;
}

function classifyExecution(runData) {
  const opened = firstNodeItem(runData, 'Execute Trade') || firstNodeItem(runData, 'Execute Trade1');
  if (opened?.success) return { type: 'opened', item: opened };

  const ai = firstNodeItem(runData, 'AI Market Context') || firstNodeItem(runData, 'AI Market Context Image');
  if (ai) return { type: ai.passAI ? 'approved_no_execute' : 'rejected', item: ai };

  const agg = firstNodeItem(runData, 'Aggregate Best Setup');
  if (agg?.noSetup) return { type: 'no_setup', item: agg };

  return { type: 'unknown', item: null };
}

function relation(item) {
  const direction = item?.direction || item?.side || 'UNKNOWN';
  const macro = item?.marketContext?.market_bias || 'UNKNOWN';
  const tf4h = item?.tf4h?.status || 'UNKNOWN';
  let macroRelation = 'neutral';
  if ((macro === 'BEARISH' && direction === 'SHORT') || (macro === 'BULLISH' && direction === 'LONG')) {
    macroRelation = 'aligns';
  } else if ((macro === 'BEARISH' && direction === 'LONG') || (macro === 'BULLISH' && direction === 'SHORT')) {
    macroRelation = 'contradicts';
  }
  return { direction, macro, macroRelation, tf4h };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'aterum-simulator/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getKlines(symbol, startMs, hours) {
  const endMs = startMs + hours * 3600 * 1000;
  const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&startTime=${startMs}&endTime=${endMs}&limit=1000`;
  const raw = await fetchJson(url);
  if (!Array.isArray(raw)) return [];
  return raw.map(k => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4])
  }));
}

function simulateOutcome(item, bars) {
  const direction = item?.direction || item?.side;
  const entry = Number(item?.entryPrice || item?.indicators?.currentPrice || 0);
  const atrPct = Number(item?.indicators?.atrPct || 0);
  if (!entry || !atrPct || !['LONG', 'SHORT'].includes(direction) || !bars.length) return null;

  const stopPct = Math.max(0.35, atrPct * 1.5) / 100;
  const tpPct = stopPct * 2;
  const sl = direction === 'LONG' ? entry * (1 - stopPct) : entry * (1 + stopPct);
  const tp = direction === 'LONG' ? entry * (1 + tpPct) : entry * (1 - tpPct);

  let mfe = 0;
  let mae = 0;
  let firstHit = 'none';
  let hitAt = null;

  for (const bar of bars) {
    const favorable = direction === 'LONG' ? (bar.high - entry) / entry : (entry - bar.low) / entry;
    const adverse = direction === 'LONG' ? (entry - bar.low) / entry : (bar.high - entry) / entry;
    mfe = Math.max(mfe, favorable);
    mae = Math.max(mae, adverse);

    const hitTp = direction === 'LONG' ? bar.high >= tp : bar.low <= tp;
    const hitSl = direction === 'LONG' ? bar.low <= sl : bar.high >= sl;
    if (hitTp || hitSl) {
      firstHit = hitTp && hitSl ? 'both_same_bar' : hitTp ? 'tp' : 'sl';
      hitAt = new Date(bar.openTime).toISOString();
      break;
    }
  }

  const lastClose = bars[bars.length - 1].close;
  const endRet = direction === 'LONG' ? (lastClose - entry) / entry : (entry - lastClose) / entry;
  const quality = firstHit === 'tp' ? 'good_tp'
    : firstHit === 'sl' ? 'bad_sl'
    : mfe >= tpPct * 0.5 && mfe > mae ? 'good_partial'
    : mae >= stopPct * 0.8 && mae > mfe ? 'bad_pressure'
    : 'mixed';

  return {
    entry,
    stopPct: stopPct * 100,
    tpPct: tpPct * 100,
    mfePct: mfe * 100,
    maePct: mae * 100,
    endRetPct: endRet * 100,
    firstHit,
    hitAt,
    quality
  };
}

function bumpGroup(groups, key, signal) {
  if (!groups[key]) {
    groups[key] = { n: 0, tp: 0, sl: 0, good: 0, bad: 0, opened: 0, rejected: 0, avgMfe: 0, avgMae: 0, avgEnd: 0 };
  }
  const g = groups[key];
  g.n += 1;
  if (signal.type === 'opened') g.opened += 1;
  if (signal.type === 'rejected') g.rejected += 1;
  if (signal.outcome?.firstHit === 'tp') g.tp += 1;
  if (signal.outcome?.firstHit === 'sl') g.sl += 1;
  if (String(signal.outcome?.quality || '').startsWith('good')) g.good += 1;
  if (String(signal.outcome?.quality || '').startsWith('bad')) g.bad += 1;
  g.avgMfe += Number(signal.outcome?.mfePct || 0);
  g.avgMae += Number(signal.outcome?.maePct || 0);
  g.avgEnd += Number(signal.outcome?.endRetPct || 0);
}

function finalizeGroups(groups) {
  Object.values(groups).forEach(g => {
    if (!g.n) return;
    g.goodRate = +(g.good / g.n * 100).toFixed(1);
    g.badRate = +(g.bad / g.n * 100).toFixed(1);
    g.avgMfe = +(g.avgMfe / g.n).toFixed(2);
    g.avgMae = +(g.avgMae / g.n).toFixed(2);
    g.avgEnd = +(g.avgEnd / g.n).toFixed(2);
  });
  return groups;
}

function buildStats(signals) {
  const stats = {
    total: signals.length,
    opened: signals.filter(s => s.type === 'opened').length,
    rejected: signals.filter(s => s.type === 'rejected').length,
    tp: signals.filter(s => s.outcome?.firstHit === 'tp').length,
    sl: signals.filter(s => s.outcome?.firstHit === 'sl').length,
    good: signals.filter(s => String(s.outcome?.quality || '').startsWith('good')).length,
    bad: signals.filter(s => String(s.outcome?.quality || '').startsWith('bad')).length,
    avgMfe: 0,
    avgMae: 0,
    avgEnd: 0
  };
  if (signals.length) {
    stats.avgMfe = +(signals.reduce((sum, s) => sum + Number(s.outcome?.mfePct || 0), 0) / signals.length).toFixed(2);
    stats.avgMae = +(signals.reduce((sum, s) => sum + Number(s.outcome?.maePct || 0), 0) / signals.length).toFixed(2);
    stats.avgEnd = +(signals.reduce((sum, s) => sum + Number(s.outcome?.endRetPct || 0), 0) / signals.length).toFixed(2);
  }
  stats.goodRate = stats.total ? +(stats.good / stats.total * 100).toFixed(1) : 0;
  return stats;
}

async function getActualTradeStats() {
  const [summary, by4h, byMacro, recent] = await Promise.all([
    shared.query(`SELECT COUNT(*) trades,
        SUM(tc.pnl_usdt > 0) wins,
        SUM(tc.pnl_usdt <= 0) losses,
        ROUND(100 * SUM(tc.pnl_usdt > 0) / COUNT(*), 1) win_rate,
        ROUND(SUM(tc.pnl_usdt), 2) pnl,
        ROUND(AVG(tc.pnl_usdt), 2) avg_pnl,
        ROUND(AVG(tc.r_final), 2) avg_r
      FROM trades t JOIN trade_closes tc ON tc.trade_id=t.id`),
    shared.query(`SELECT t.tf4h_status as label, COUNT(*) trades,
        SUM(tc.pnl_usdt > 0) wins,
        ROUND(100 * SUM(tc.pnl_usdt > 0) / COUNT(*), 1) win_rate,
        ROUND(SUM(tc.pnl_usdt), 2) pnl,
        ROUND(AVG(tc.r_final), 2) avg_r
      FROM trades t JOIN trade_closes tc ON tc.trade_id=t.id
      GROUP BY t.tf4h_status ORDER BY trades DESC`),
    shared.query(`SELECT t.macro_bias as label, COUNT(*) trades,
        SUM(tc.pnl_usdt > 0) wins,
        ROUND(100 * SUM(tc.pnl_usdt > 0) / COUNT(*), 1) win_rate,
        ROUND(SUM(tc.pnl_usdt), 2) pnl,
        ROUND(AVG(tc.r_final), 2) avg_r
      FROM trades t JOIN trade_closes tc ON tc.trade_id=t.id
      GROUP BY t.macro_bias ORDER BY trades DESC`),
    shared.query(`SELECT t.symbol, t.direction, t.status, t.opened_at, tc.closed_at,
        tc.pnl_usdt, tc.r_final, tc.close_reason, t.final_score, t.tf4h_status, t.macro_bias
      FROM trades t LEFT JOIN trade_closes tc ON tc.trade_id=t.id
      ORDER BY t.opened_at DESC LIMIT 20`)
  ]);
  return { summary: summary?.[0] || null, by4h: by4h || [], byMacro: byMacro || [], recent: recent || [] };
}

async function getSimulatorReport(options = {}) {
  const limit = clampInt(options.limit, 80, 10, 180);
  const hours = clampInt(options.hours, 4, 1, 12);
  const force = options.force === true || options.force === '1' || options.force === 'true';
  const cacheKey = `${limit}:${hours}`;
  if (!force && cache && cache.key === cacheKey && Date.now() - cache.ts < CACHE_MS) return cache.data;

  const executions = await sqliteRows(`SELECT e.id, e.startedAt, e.status
    FROM execution_entity e
    JOIN execution_data d ON d.executionId=e.id
    WHERE e.workflowId='${WORKFLOW_ID}'
    ORDER BY e.startedAt DESC
    LIMIT ${limit}`);

  const signals = [];
  for (const execution of executions) {
    let parsed;
    try {
      const row = (await sqliteRows(`SELECT data FROM execution_data WHERE executionId=${Number(execution.id)} LIMIT 1`))[0];
      if (!row?.data) continue;
      parsed = parse(row.data);
    } catch (error) {
      continue;
    }

    const runData = parsed?.resultData?.runData;
    const decision = classifyExecution(runData);
    const item = decision.item || {};
    const direction = item.direction || item.side;
    if (!['opened', 'rejected'].includes(decision.type)) continue;
    if (!item.symbol || !['LONG', 'SHORT'].includes(direction)) continue;

    const startedAt = String(execution.startedAt || '').replace(' ', 'T') + 'Z';
    const startedMs = Date.parse(startedAt);
    let outcome = null;
    let outcomeError = null;
    try {
      const bars = await getKlines(item.symbol, startedMs, hours);
      outcome = simulateOutcome(item, bars);
    } catch (error) {
      outcomeError = error.message;
    }

    const rel = relation(item);
    signals.push({
      id: execution.id,
      at: execution.startedAt,
      type: decision.type,
      symbol: item.symbol,
      direction,
      score: item.finalScore ?? item.score ?? null,
      baseScore: item.score ?? null,
      threshold: item.dynamicThreshold ?? null,
      scanScore: item.scanScore ?? null,
      reason: item.skipReason || item.originalSkipReason || null,
      macro: rel.macro,
      macroRelation: rel.macroRelation,
      btc12h: item.marketContext?.btcChange ?? null,
      fearGreed: item.marketContext?.fearGreed?.value ?? null,
      tf4h: rel.tf4h,
      tf4hTrend: item.tf4h?.trend || null,
      aiRegime: item.aiResult?.regime || null,
      aiBias: item.aiResult?.direction_bias || null,
      rsi: item.indicators?.rsi14 ?? null,
      atrPct: item.indicators?.atrPct ?? null,
      volRatio: item.indicators?.volRatio ?? null,
      fundingRate: item.indicators?.fundingRate ?? null,
      entry: outcome?.entry || item.entryPrice || item.indicators?.currentPrice || null,
      outcome,
      outcomeError
    });
  }

  const groups = {};
  signals.filter(s => s.outcome).forEach(signal => {
    bumpGroup(groups, `${signal.type}|${signal.direction}|macro=${signal.macroRelation}|4h=${signal.tf4h}`, signal);
  });

  const actual = await getActualTradeStats();
  const data = {
    generatedAt: new Date().toISOString(),
    options: { limit, hours },
    stats: buildStats(signals.filter(s => s.outcome)),
    groups: finalizeGroups(groups),
    signals,
    actual
  };
  cache = { key: cacheKey, ts: Date.now(), data };
  return data;
}

module.exports = {
  getSimulatorReport
};
