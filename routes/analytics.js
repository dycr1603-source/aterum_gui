'use strict';
const express = require('express');
const router  = express.Router();
const shared  = require('../shared');
const { buildDecisionTrace, buildSizingTrace } = require('../services/decision_trace');

const { db, query } = shared;

async function insertScanEvent(t, passAI, skipReason = null) {
  const params = [
    t.symbol,t.scanScore,t.direction,t.finalScore,t.longScore,t.shortScore,passAI?1:0,skipReason,
    t.indicators?.rsi14,t.indicators?.ema8,t.indicators?.ema21,t.indicators?.ema50,
    t.indicators?.atrPct,t.indicators?.volRatio,t.indicators?.fundingRate,t.indicators?.vwap,
    t.indicators?.currentPrice,t.volume24h,t.priceChangePct,t.openInterest
  ].map(value => value === undefined ? null : value);
  await query(
    `INSERT INTO scan_events (symbol,scan_score,direction,final_score,long_score,short_score,pass_ai,skip_reason,rsi14,ema8,ema21,ema50,atr_pct,vol_ratio,funding_rate,vwap,current_price,volume24h,price_change_pct,open_interest,scanned_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    params
  );
}

async function ensureTradeLearningColumns() {
  const columns = [
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS rsi14 DECIMAL(8,3) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS atr_pct DECIMAL(10,4) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS vol_ratio DECIMAL(10,4) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS funding_rate DECIMAL(12,8) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS vwap DECIMAL(24,10) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price DECIMAL(24,10) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS dynamic_threshold DECIMAL(8,3) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_reason TEXT NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS setup_label VARCHAR(120) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS policy_version VARCHAR(80) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS opportunity_cycle_id CHAR(36) NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS score_trace LONGTEXT NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS sizing_trace LONGTEXT NULL`
  ];
  for (const sql of columns) await db.execute(sql).catch(() => {});
}

function buildSetupLabel(t) {
  return [
    t.aiResult?.regime || 'N/A',
    t.tf4h?.status || 'N/A',
    t.marketContext?.market_bias || 'N/A'
  ].join(' / ');
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonValue(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(numberValue(value) * factor) / factor;
}

function hourBucketSql(column) {
  return `CASE
    WHEN HOUR(${column}) < 4 THEN '00-04'
    WHEN HOUR(${column}) < 8 THEN '04-08'
    WHEN HOUR(${column}) < 12 THEN '08-12'
    WHEN HOUR(${column}) < 16 THEN '12-16'
    WHEN HOUR(${column}) < 20 THEN '16-20'
    ELSE '20-24'
  END`;
}

async function getResearchSummary() {
  const [tradeRows, scanRows, rejectionRows, postRows] = await Promise.all([
    query(`SELECT
        COUNT(*) AS closed_trades,
        SUM(tc.pnl_usdt > 0) AS wins,
        SUM(tc.pnl_usdt <= 0) AS losses,
        SUM(tc.pnl_usdt) AS pnl,
        AVG(tc.pnl_usdt) AS expectancy,
        AVG(tc.r_final) AS avg_r,
        SUM(CASE WHEN tc.pnl_usdt > 0 THEN tc.pnl_usdt ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN tc.pnl_usdt < 0 THEN tc.pnl_usdt ELSE 0 END) AS gross_loss
      FROM trade_closes tc`),
    query(`SELECT
        SUM(pass_ai=1) AS accepted,
        SUM(pass_ai=0) AS rejected,
        COUNT(*) AS total
      FROM scan_events`),
    query(`SELECT COUNT(*) AS total FROM trade_rejections`),
    query(`SELECT COUNT(*) AS total FROM post_trade_analysis`)
  ]);

  const [equityRows] = await Promise.all([
    query(`SELECT pnl_usdt FROM trade_closes ORDER BY closed_at ASC, id ASC`)
  ]);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  (equityRows || []).forEach(row => {
    equity += numberValue(row.pnl_usdt);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  });

  const trades = tradeRows?.[0] || {};
  const scans = scanRows?.[0] || {};
  const closedTrades = numberValue(trades.closed_trades);
  const wins = numberValue(trades.wins);
  const losses = numberValue(trades.losses);
  const acceptedSignals = numberValue(scans.accepted);
  const rejectedSignals = numberValue(scans.rejected) || numberValue(rejectionRows?.[0]?.total);
  const totalSignals = acceptedSignals + rejectedSignals;
  const grossProfit = numberValue(trades.gross_profit);
  const grossLoss = Math.abs(numberValue(trades.gross_loss));

  return {
    closedTrades,
    wins,
    losses,
    pnl: round(trades.pnl),
    winRate: closedTrades ? round((wins / closedTrades) * 100, 1) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : (grossProfit > 0 ? null : 0),
    expectancy: round(trades.expectancy),
    avgR: round(trades.avg_r),
    maxDrawdown: round(maxDrawdown),
    acceptedSignals,
    rejectedSignals,
    totalSignals,
    rejectionRate: totalSignals ? round((rejectedSignals / totalSignals) * 100, 1) : 0,
    postTradeAnalyses: numberValue(postRows?.[0]?.total)
  };
}

async function getResearchSymbols() {
  const rows = await query(`SELECT
      t.symbol,
      COUNT(tc.id) AS trades,
      SUM(tc.pnl_usdt > 0) AS wins,
      SUM(tc.pnl_usdt) AS pnl,
      AVG(tc.pnl_usdt) AS expectancy,
      AVG(tc.r_final) AS avg_r,
      SUM(CASE WHEN tc.pnl_usdt > 0 THEN tc.pnl_usdt ELSE 0 END) AS gross_profit,
      SUM(CASE WHEN tc.pnl_usdt < 0 THEN tc.pnl_usdt ELSE 0 END) AS gross_loss
    FROM trades t
    JOIN trade_closes tc ON tc.trade_id = t.id
    GROUP BY t.symbol
    ORDER BY expectancy DESC, pnl DESC`);

  return (rows || []).map(row => {
    const trades = numberValue(row.trades);
    const wins = numberValue(row.wins);
    const grossLoss = Math.abs(numberValue(row.gross_loss));
    const grossProfit = numberValue(row.gross_profit);
    return {
      symbol: row.symbol,
      trades,
      wins,
      losses: Math.max(0, trades - wins),
      winRate: trades ? round((wins / trades) * 100, 1) : 0,
      pnl: round(row.pnl),
      expectancy: round(row.expectancy),
      avgR: round(row.avg_r),
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : (grossProfit > 0 ? null : 0)
    };
  });
}

async function getResearchHours() {
  // El edge horario pertenece al momento de entrada, no al cierre del trade.
  const bucket = hourBucketSql('t.opened_at');
  const rows = await query(`SELECT
      ${bucket} AS bucket,
      COUNT(*) AS trades,
      SUM(tc.pnl_usdt > 0) AS wins,
      SUM(tc.pnl_usdt) AS pnl,
      AVG(tc.pnl_usdt) AS expectancy,
      AVG(tc.r_final) AS avg_r
    FROM trade_closes tc
    JOIN trades t ON t.id=tc.trade_id
    GROUP BY bucket
    ORDER BY FIELD(bucket,'00-04','04-08','08-12','12-16','16-20','20-24')`);

  const scanBucket = hourBucketSql('scanned_at');
  const scanRows = await query(`SELECT
      ${scanBucket} AS bucket,
      SUM(pass_ai=1) AS accepted,
      SUM(pass_ai=0) AS rejected
    FROM scan_events
    GROUP BY bucket`);

  const scanByBucket = {};
  (scanRows || []).forEach(row => {
    scanByBucket[row.bucket] = {
      accepted: numberValue(row.accepted),
      rejected: numberValue(row.rejected)
    };
  });

  const buckets = ['00-04','04-08','08-12','12-16','16-20','20-24'];
  const byBucket = {};
  (rows || []).forEach(row => { byBucket[row.bucket] = row; });
  return buckets.map(label => {
    const row = byBucket[label] || {};
    const trades = numberValue(row.trades);
    const wins = numberValue(row.wins);
    return {
      bucket: label,
      trades,
      wins,
      losses: Math.max(0, trades - wins),
      winRate: trades ? round((wins / trades) * 100, 1) : 0,
      pnl: round(row.pnl),
      expectancy: round(row.expectancy),
      avgR: round(row.avg_r),
      acceptedSignals: scanByBucket[label]?.accepted || 0,
      rejectedSignals: scanByBucket[label]?.rejected || 0
    };
  });
}

async function getResearchRejections() {
  const [summaryRows, reasonRows, contextRows] = await Promise.all([
    query(`SELECT
        COUNT(*) AS total_rejections,
        AVG(final_score) AS avg_score,
        AVG(scan_score) AS avg_scan
      FROM trade_rejections`),
    query(`SELECT
        skip_reason,
        COUNT(*) AS count,
        AVG(final_score) AS avg_score,
        AVG(scan_score) AS avg_scan
      FROM trade_rejections
      GROUP BY skip_reason
      ORDER BY count DESC, avg_score DESC
      LIMIT 12`),
    query(`SELECT
        COALESCE(ai_regime,'N/A') AS ai_regime,
        COALESCE(ai_bias,'N/A') AS ai_bias,
        COALESCE(tf4h_status,'N/A') AS tf4h_status,
        COUNT(*) AS count
      FROM trade_rejections
      GROUP BY ai_regime, ai_bias, tf4h_status
      ORDER BY count DESC
      LIMIT 8`)
  ]);

  return {
    summary: {
      totalRejections: numberValue(summaryRows?.[0]?.total_rejections),
      avgScore: round(summaryRows?.[0]?.avg_score, 1),
      avgScan: round(summaryRows?.[0]?.avg_scan, 3)
    },
    reasons: (reasonRows || []).map(row => ({
      reason: row.skip_reason || 'Sin motivo',
      count: numberValue(row.count),
      avgScore: round(row.avg_score, 1),
      avgScan: round(row.avg_scan, 3)
    })),
    contexts: (contextRows || []).map(row => ({
      aiRegime: row.ai_regime,
      aiBias: row.ai_bias,
      tf4hStatus: row.tf4h_status,
      count: numberValue(row.count)
    }))
  };
}

function extractTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 5 && !['trade','setup','stage','error','analisis','analysis','telemetry','controlled'].includes(word));
}

async function getResearchSetups() {
  const [setupRows, stageRows, postRows] = await Promise.all([
    query(`SELECT
        COALESCE(t.ai_regime,'N/A') AS ai_regime,
        COALESCE(t.tf4h_status,'N/A') AS tf4h_status,
        COALESCE(t.macro_bias,'N/A') AS macro_bias,
        COUNT(*) AS trades,
        SUM(tc.pnl_usdt > 0) AS wins,
        SUM(tc.pnl_usdt) AS pnl,
        AVG(tc.pnl_usdt) AS expectancy,
        AVG(tc.r_final) AS avg_r
      FROM trades t
      JOIN trade_closes tc ON tc.trade_id = t.id
      GROUP BY ai_regime, tf4h_status, macro_bias
      ORDER BY expectancy DESC, pnl DESC
      LIMIT 20`),
    query(`SELECT
        trailing_stage,
        close_reason,
        COUNT(*) AS trades,
        SUM(pnl_usdt > 0) AS wins,
        SUM(pnl_usdt) AS pnl,
        AVG(pnl_usdt) AS expectancy,
        AVG(r_final) AS avg_r
      FROM trade_closes
      GROUP BY trailing_stage, close_reason
      ORDER BY expectancy DESC, pnl DESC`),
    query(`SELECT symbol,direction,close_type,stage,pnl_usdt,r_final,duration_minutes,analysis,created_at
      FROM post_trade_analysis
      ORDER BY created_at DESC
      LIMIT 80`)
  ]);

  const setups = (setupRows || []).map(row => {
    const trades = numberValue(row.trades);
    const wins = numberValue(row.wins);
    return {
      label: `${row.ai_regime} / ${row.tf4h_status} / ${row.macro_bias}`,
      aiRegime: row.ai_regime,
      tf4hStatus: row.tf4h_status,
      macroBias: row.macro_bias,
      trades,
      wins,
      winRate: trades ? round((wins / trades) * 100, 1) : 0,
      pnl: round(row.pnl),
      expectancy: round(row.expectancy),
      avgR: round(row.avg_r)
    };
  });

  const termCounts = {};
  (postRows || []).forEach(row => {
    extractTerms(row.analysis).forEach(term => {
      termCounts[term] = (termCounts[term] || 0) + 1;
    });
  });

  const recurrentErrors = Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  return {
    bestSetups: [...setups].sort((a, b) => b.expectancy - a.expectancy || b.pnl - a.pnl).slice(0, 8),
    worstSetups: [...setups].sort((a, b) => a.expectancy - b.expectancy || a.pnl - b.pnl).slice(0, 8),
    stagePerformance: (stageRows || []).map(row => {
      const trades = numberValue(row.trades);
      const wins = numberValue(row.wins);
      return {
        stage: row.trailing_stage || 'N/A',
        closeReason: row.close_reason || 'N/A',
        trades,
        winRate: trades ? round((wins / trades) * 100, 1) : 0,
        pnl: round(row.pnl),
        expectancy: round(row.expectancy),
        avgR: round(row.avg_r)
      };
    }),
    postTrade: (postRows || []).slice(0, 20).map(row => ({
      symbol: row.symbol,
      direction: row.direction,
      closeType: row.close_type,
      stage: row.stage,
      pnl: round(row.pnl_usdt),
      r: round(row.r_final),
      durationMinutes: numberValue(row.duration_minutes),
      analysis: row.analysis || '',
      createdAt: row.created_at
    })),
    recurrentErrors
  };
}

async function ensureResearchReportsTable() {
  await db.execute(`CREATE TABLE IF NOT EXISTS research_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL,
    report_type VARCHAR(20) NOT NULL,
    report LONGTEXT NOT NULL,
    findings JSON NULL,
    recommendations JSON NULL,
    risks JSON NULL,
    opportunities JSON NULL,
    score DECIMAL(8,3) NULL,
    model VARCHAR(80) NULL,
    source_workflow VARCHAR(120) NULL,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_research_reports_date (report_date),
    INDEX idx_research_reports_type_date (report_type, report_date)
  )`);
}

async function ensureRecommendationTables() {
  await ensureResearchReportsTable();
  await db.execute(`CREATE TABLE IF NOT EXISTS ai_recommendations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NULL,
    recommendation TEXT NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'recommendation',
    confidence DECIMAL(5,2) NULL,
    rationale TEXT NULL,
    evidence JSON NULL,
    status ENUM('pending','reviewing','validated','rejected') NOT NULL DEFAULT 'pending',
    review_date DATETIME NULL,
    impact_score DECIMAL(8,3) NULL,
    outcome ENUM('positive','neutral','negative') NULL,
    notes TEXT NULL,
    evidence_level VARCHAR(10) NOT NULL DEFAULT 'baja',
    implementation_status VARCHAR(20) NOT NULL DEFAULT 'en_prueba',
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_ai_rec_report (report_id),
    INDEX idx_ai_rec_status_created (status, created_at),
    INDEX idx_ai_rec_category_created (category, created_at),
    CONSTRAINT fk_ai_rec_report FOREIGN KEY (report_id) REFERENCES research_reports(id) ON DELETE SET NULL
  )`);
  await db.execute(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS evidence_level VARCHAR(10) NOT NULL DEFAULT 'baja'`).catch(()=>{});
  await db.execute(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS implementation_status VARCHAR(20) NOT NULL DEFAULT 'en_prueba'`).catch(()=>{});
  await db.execute(`CREATE TABLE IF NOT EXISTS recommendation_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recommendation_id INT NOT NULL,
    review_date DATETIME DEFAULT NOW(),
    baseline_start DATETIME NULL,
    baseline_end DATETIME NULL,
    evaluation_start DATETIME NULL,
    evaluation_end DATETIME NULL,
    before_metrics JSON NULL,
    after_metrics JSON NULL,
    impact_score DECIMAL(8,3) NULL,
    outcome ENUM('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
    notes TEXT NULL,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_rec_review_rec_date (recommendation_id, review_date),
    CONSTRAINT fk_rec_review_rec FOREIGN KEY (recommendation_id) REFERENCES ai_recommendations(id) ON DELETE CASCADE
  )`);
}

function parseReportSections(report) {
  const text = String(report || '');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const cleanLine = line => normalizeInsightText(line.replace(/^#+\s*/, '').replace(/\*\*/g, ''));
  const isUseful = line => line && !/^\|?-{3,}/.test(line) && !/^\|.*m[eé]trica.*valor/i.test(line) && line.length >= 8;
  const sectionText = heading => {
    const match = text.match(new RegExp(`##[^\\n]*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'));
    return match ? match[1] : '';
  };
  const compactSection = raw => {
    const rawLines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(isUseful);
    const items = [];
    let current = '';
    rawLines.forEach(line => {
      const cleaned = cleanLine(line);
      if (!cleaned) return;
      if (/^#{1,4}\s|^\d+[.)]\s|^[A-ZÁÉÍÓÚÑ ]{4,}:/.test(line) || /^Acci[oó]n:/i.test(cleaned)) {
        if (current) items.push(current);
        current = cleaned;
        return;
      }
      if (/^[-*•]\s|^├|^└/.test(line)) {
        const detail = cleanLine(line);
        current = current ? `${current} · ${detail}` : detail;
      }
    });
    if (current) items.push(current);
    return items.filter(Boolean);
  };
  const worked = compactSection(sectionText('FUNCION'));
  const recommendations = compactSection(sectionText('RECOMENDACIONES')).slice(0, 12);
  const risks = [...compactSection(sectionText('RIESGOS')), ...compactSection(sectionText('PROBLEMAS'))].slice(0, 12);
  const opportunities = compactSection(sectionText('OPORTUNIDADES')).slice(0, 12);
  const findings = [...worked, ...lines
    .map(cleanLine)
    .filter(line => /win|pnl|profit|expect|drawdown|simbol|horario|rechaz|post-trade|resumen|veredicto/i.test(line))
    .filter(isUseful)]
    .slice(0, 16);
  return { findings, recommendations, risks, opportunities };
}

function normalizeInsightText(text) {
  return String(text || '')
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function inferRecommendationCategory(text, fallback = 'recommendation') {
  const value = String(text || '').toLowerCase();
  if (/riesg|drawdown|perd|exposic|reduc|evitar|sl|volatil/i.test(value)) return 'risk';
  if (/oportun|aument|prioriz|mejor|edge|rentab|funcion|gan/i.test(value)) return 'opportunity';
  if (/horario|sesion|utc|00-|04-|08-|12-|16-|20-/i.test(value)) return 'time';
  if (/[A-Z]{2,}USDT|btc|eth|sol|zec/i.test(text || '')) return 'symbol';
  return fallback;
}

function inferRecommendationConfidence(text, reportScore) {
  const value = String(text || '').toLowerCase();
  let confidence = Number.isFinite(Number(reportScore)) ? Math.max(35, Math.min(95, Number(reportScore))) : 60;
  if (/debe|evitar|reducir|aumentar|priorizar|claro|persistente|consistente/i.test(value)) confidence += 10;
  if (/podr|revisar|considerar|hip[oó]tesis|posible|insuficiente/i.test(value)) confidence -= 10;
  return Math.max(20, Math.min(95, Math.round(confidence)));
}

function extractSymbolsFromText(text) {
  const matches = String(text || '').toUpperCase().match(/\b[A-Z0-9]{2,12}USDT\b/g) || [];
  return [...new Set(matches)];
}

function extractHourBucketsFromText(text) {
  const matches = String(text || '').match(/\b(?:00|04|08|12|16|20)-(?:04|08|12|16|20|24)\b/g) || [];
  return [...new Set(matches)];
}

function buildRecommendationEvidence(text, report) {
  return {
    symbols: extractSymbolsFromText(text),
    hours: extractHourBucketsFromText(text),
    sourceReportId: report?.id || null,
    sourceType: report?.report_type || null,
    sourceDate: report?.report_date || null
  };
}

async function inferEvidenceLevel(evidence = {}) {
  const symbols = Array.isArray(evidence.symbols) ? evidence.symbols : [];
  const hours = Array.isArray(evidence.hours) ? evidence.hours : [];
  const filters = [];
  const params = [];
  if (symbols.length) {
    filters.push(`t.symbol IN (${symbols.map(() => '?').join(',')})`);
    params.push(...symbols);
  }
  if (hours.length) {
    filters.push(`${hourBucketSql('t.opened_at')} IN (${hours.map(() => '?').join(',')})`);
    params.push(...hours);
  }
  const rows = await query(`SELECT COUNT(*) AS n
    FROM trade_closes tc
    JOIN trades t ON t.id=tc.trade_id
    ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}`, params);
  const sample = numberValue(rows?.[0]?.n);
  if (sample >= 30) return 'alta';
  if (sample >= 10) return 'media';
  return 'baja';
}

function implementationStatusForEvidence(evidenceLevel) {
  return 'en_prueba';
}

function isoDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function arrayFromJson(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

async function syncRecommendationsForReport(reportId) {
  await ensureRecommendationTables();
  const rows = await query(`SELECT id, report_date, report_type, report, recommendations, risks, opportunities, score FROM research_reports WHERE id=? LIMIT 1`, [reportId]);
  const report = rows?.[0];
  if (!report) return { inserted: 0, skipped: 0 };
  const parsed = parseReportSections(report.report);
  if (parsed.recommendations.length || parsed.risks.length || parsed.opportunities.length) {
    await db.execute(
      `UPDATE research_reports SET findings=?, recommendations=?, risks=?, opportunities=? WHERE id=?`,
      [JSON.stringify(parsed.findings), JSON.stringify(parsed.recommendations), JSON.stringify(parsed.risks), JSON.stringify(parsed.opportunities), report.id]
    );
    report.findings = JSON.stringify(parsed.findings);
    report.recommendations = JSON.stringify(parsed.recommendations);
    report.risks = JSON.stringify(parsed.risks);
    report.opportunities = JSON.stringify(parsed.opportunities);
  }

  const candidates = [
    ...arrayFromJson(report.recommendations).map(text => ({ text, category: 'recommendation' })),
    ...arrayFromJson(report.risks).map(text => ({ text, category: 'risk' })),
    ...arrayFromJson(report.opportunities).map(text => ({ text, category: 'opportunity' }))
  ].map(item => ({
    ...item,
    text: normalizeInsightText(item.text)
  })).filter(item => item.text.length >= 8);

  let inserted = 0;
  let skipped = 0;
  for (const item of candidates) {
    const [existing] = await db.execute(
      `SELECT id FROM ai_recommendations WHERE report_id=? AND recommendation=? LIMIT 1`,
      [report.id, item.text]
    );
    if (existing?.length) {
      skipped++;
      continue;
    }
    const category = item.category === 'recommendation'
      ? inferRecommendationCategory(item.text, item.category)
      : item.category;
    const confidence = inferRecommendationConfidence(item.text, report.score);
    const evidence = buildRecommendationEvidence(item.text, report);
    const evidenceLevel = await inferEvidenceLevel(evidence);
    const implementationStatus = implementationStatusForEvidence(evidenceLevel);
    await db.execute(
      `INSERT INTO ai_recommendations
        (report_id, recommendation, category, confidence, rationale, evidence, status, evidence_level, implementation_status)
       VALUES (?,?,?,?,?,?, 'pending', ?, ?)`,
      [
        report.id,
        item.text,
        category,
        confidence,
        `Extraída del informe ${report.report_type} del ${isoDateOnly(report.report_date)}.`,
        JSON.stringify(evidence),
        evidenceLevel,
        implementationStatus
      ]
    );
    inserted++;
  }
  return { inserted, skipped };
}

async function getPerformanceWindow(start, end, symbols = [], buckets = []) {
  const params = [start, end];
  const filters = [`t.opened_at >= ?`, `t.opened_at < ?`];
  if (symbols.length) {
    filters.push(`t.symbol IN (${symbols.map(() => '?').join(',')})`);
    params.push(...symbols);
  }
  if (buckets.length) {
    filters.push(`${hourBucketSql('t.opened_at')} IN (${buckets.map(() => '?').join(',')})`);
    params.push(...buckets);
  }
  const rows = await query(`SELECT
      COUNT(*) AS trades,
      SUM(tc.pnl_usdt > 0) AS wins,
      SUM(tc.pnl_usdt) AS pnl,
      AVG(tc.pnl_usdt) AS expectancy,
      AVG(tc.r_final) AS avg_r
    FROM trade_closes tc
    JOIN trades t ON t.id=tc.trade_id
    WHERE ${filters.join(' AND ')}`, params);
  const row = rows?.[0] || {};
  const trades = numberValue(row.trades);
  const wins = numberValue(row.wins);
  return {
    trades,
    wins,
    losses: Math.max(0, trades - wins),
    winRate: trades ? round((wins / trades) * 100, 1) : 0,
    pnl: round(row.pnl),
    expectancy: round(row.expectancy),
    avgR: round(row.avg_r)
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function reviewRecommendation(rec, now = new Date()) {
  if (rec.implementation_status !== 'implementada' || !rec.implemented_at) {
    return { id: rec.id, skipped: true, reason: 'La recomendación aún no fue implementada por Learning Engine.' };
  }
  const implementedAt = new Date(rec.implemented_at);
  const evaluationEnd = now;
  const evaluationStart = implementedAt;
  const baselineEnd = implementedAt;
  const baselineStart = addDays(implementedAt, -14);
  const evidence = typeof rec.evidence === 'string' ? JSON.parse(rec.evidence || '{}') : (rec.evidence || {});
  const symbols = evidence.symbols || extractSymbolsFromText(rec.recommendation);
  const hours = evidence.hours || extractHourBucketsFromText(rec.recommendation);

  const before = await getPerformanceWindow(sqlDateTime(baselineStart), sqlDateTime(baselineEnd), symbols, hours);
  const after = await getPerformanceWindow(sqlDateTime(evaluationStart), sqlDateTime(evaluationEnd), symbols, hours);
  const minRows = await query(`SELECT config_value FROM learning_config WHERE config_key='soft_min_sample' LIMIT 1`);
  const minSample = Math.max(4, numberValue(minRows?.[0]?.config_value, 8));
  const enoughEvidence = before.trades >= minSample && after.trades >= minSample;
  const pnlDelta = after.pnl - before.pnl;
  const expectancyDelta = after.expectancy - before.expectancy;
  const winRateDelta = after.winRate - before.winRate;
  const impactScore = round((expectancyDelta * 4) + (pnlDelta * 0.4) + (winRateDelta * 0.15), 3);
  const outcome = !enoughEvidence ? 'neutral' : impactScore > 0.5 ? 'positive' : impactScore < -0.5 ? 'negative' : 'neutral';
  const status = outcome === 'positive' ? 'validated' : outcome === 'negative' ? 'rejected' : 'reviewing';
  const notes = !enoughEvidence
    ? `Muestra insuficiente para revisar la regla implementada: antes ${before.trades}/${minSample}, después ${after.trades}/${minSample}.`
    : `Antes: ${before.trades} trades, PnL ${before.pnl}, Exp ${before.expectancy}. Después: ${after.trades} trades, PnL ${after.pnl}, Exp ${after.expectancy}.`;

  await db.execute(
    `INSERT INTO recommendation_reviews
      (recommendation_id, baseline_start, baseline_end, evaluation_start, evaluation_end, before_metrics, after_metrics, impact_score, outcome, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [rec.id, sqlDateTime(baselineStart), sqlDateTime(baselineEnd), sqlDateTime(evaluationStart), sqlDateTime(evaluationEnd), JSON.stringify(before), JSON.stringify(after), impactScore, outcome, notes]
  );
  await db.execute(
    `UPDATE ai_recommendations SET status=?, review_date=NOW(), impact_score=?, outcome=?, notes=?,
      implementation_status=IF(?='rejected','descartada',implementation_status),
      implementation_reason=IF(?='rejected','La evaluación posterior mostró impacto negativo',implementation_reason)
     WHERE id=?`,
    [status, enoughEvidence ? impactScore : null, outcome, notes, status, status, rec.id]
  );
  return { id: rec.id, outcome, status, impactScore, before, after, notes };
}

async function reviewDueRecommendations() {
  await ensureRecommendationTables();
  const rows = await query(`SELECT *
    FROM ai_recommendations
    WHERE implementation_status='implementada'
      AND implemented_at <= DATE_SUB(NOW(), INTERVAL 1 DAY)
      AND status <> 'rejected'
      AND (review_date IS NULL OR review_date <= DATE_SUB(NOW(), INTERVAL 1 DAY))
    ORDER BY created_at ASC
    LIMIT 100`);
  const reviewed = [];
  for (const rec of rows || []) {
    try {
      reviewed.push(await reviewRecommendation(rec));
    } catch(e) {
      reviewed.push({ id: rec.id, error: e.message });
    }
  }
  return reviewed;
}

router.post('/db/trade/open', async (req, res) => {
  const t = req.body;
  try {
    await ensureTradeLearningColumns();
    const scoreTrace = t.scoreTrace || buildDecisionTrace({
      policyVersion: t.policyVersion,
      opportunityCycleId: t.opportunityCycleId,
      symbol: t.symbol,
      direction: t.direction,
      technicalScore: t.technicalScore ?? t.learningDecision?.baseScore ?? t.finalScore,
      finalScore: t.finalScore,
      threshold: t.dynamicThreshold ?? t.learningDecision?.requiredScore,
      technicalContributions: t.contributionTable,
      learningContributions: t.learningDecision?.contributions,
      learningDelta: t.learningDecision?.scoreDelta
    });
    if (!scoreTrace.reconstruction?.valid) throw new Error('Decision score trace is not reconstructable');
    const sizingTrace = t.sizingTrace || buildSizingTrace({ ...t, scoreTrace });
    try{
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl_order_id VARCHAR(64) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS execution_id CHAR(36) NULL`);
      await db.execute(`ALTER TABLE trades ADD UNIQUE INDEX IF NOT EXISTS uq_trades_execution_id (execution_id)`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS initial_sl_price DECIMAL(24,10) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS trailing_stage ENUM('INITIAL','BREAKEVEN','TIME_LOCK','LOCK','TRAILING') NOT NULL DEFAULT 'INITIAL'`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_trend VARCHAR(10) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_status VARCHAR(15) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS tf4h_rsi DECIMAL(6,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_bias VARCHAR(10) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_fear_greed INT NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_btc_change DECIMAL(6,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS macro_size_mult DECIMAL(4,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS score_multiplier DECIMAL(4,2) NULL`);
      await db.execute(`ALTER TABLE trades ADD COLUMN IF NOT EXISTS effective_risk_pct DECIMAL(5,2) NULL`);
    }catch(e){ /* columns may already exist */ }

    if (t.executionId) {
      const [existing] = await db.execute('SELECT id FROM trades WHERE execution_id=? LIMIT 1', [t.executionId]);
      if (existing.length) return res.json({ ok: true, id: existing[0].id, idempotent: true });
    }

    const sql = `INSERT INTO trades
      (execution_id, symbol, direction, status, entry_price, initial_sl_price, sl_price, tp_price, qty, leverage,
       margin, risk_pct, max_loss, max_gain, rr_ratio, final_score, scan_score,
       ai_regime, ai_bias, ai_reasoning, ai_key_risk, recommended_leverage,
       vision_state, vision_approved, vision_reason, used_fallback, original_symbol,
       market_order_id, sl_order_id, tp_order_id, sl_monitor, trailing_stage,
       tf4h_trend, tf4h_status, tf4h_rsi,
       macro_bias, macro_fear_greed, macro_btc_change, macro_size_mult,
       score_multiplier, effective_risk_pct,
       rsi14, atr_pct, vol_ratio, funding_rate, vwap, current_price,
       dynamic_threshold, entry_reason, setup_label,
       policy_version, opportunity_cycle_id, score_trace, sizing_trace,
       opened_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`;
    const params = [
      t.executionId || null,
      t.symbol || null,
      t.direction || null,
      'OPEN',
      t.entryPrice || null,
      t.initialSL || t.sl || null,
      t.sl || null,
      t.tp || null,
      t.qty || null,
      t.leverage || null,
      t.marginRequired || null,
      t.riskPct || null,
      t.maxLoss || null,
      t.maxGain || null,
      t.rrRatio || null,
      t.finalScore || null,
      t.scanScore || null,
      t.aiResult?.regime || null,
      t.aiResult?.direction_bias || null,
      t.aiResult?.reasoning || null,
      t.aiResult?.key_risk || null,
      t.aiResult?.recommended_leverage || null,
      t.aiVision?.market_state || null,
      t.aiVision?.approve_trade ? 1 : 0,
      t.aiVision?.reason || null,
      t.usedFallback ? 1 : 0,
      t.originalSymbol || null,
      t.marketOrderId || null,
      t.slOrderId || null,
      t.tpOrderId || null,
      t.slMonitorRequired ? 1 : 0,
      t.trailingStage || 'INITIAL',
      t.tf4h?.trend || null,
      t.tf4h?.status || null,
      t.tf4h?.rsi || null,
      t.marketContext?.market_bias || null,
      t.marketContext?.fearGreed?.value || null,
      t.marketContext?.btcChange || null,
      t.marketContext?.size_multiplier || null,
      t.sizingInfo?.scoreMultiplier || null,
      t.riskPct || null,
      t.indicators?.rsi14 || null,
      t.indicators?.atrPct || null,
      t.indicators?.volRatio || null,
      t.indicators?.fundingRate || null,
      t.indicators?.vwap || null,
      t.indicators?.currentPrice || t.entryPrice || null,
      t.dynamicThreshold || null,
      t.entryReason || t.aiResult?.reasoning || null,
      t.setupLabel || buildSetupLabel(t),
      scoreTrace.policyVersion,
      t.opportunityCycleId || scoreTrace.opportunityCycleId || null,
      JSON.stringify(scoreTrace),
      JSON.stringify(sizingTrace)
    ];
    const result = await db.execute(sql, params);
    const id = result[0]?.insertId;
    await insertScanEvent(t, true, null);
    console.log(`DB: Trade abierto ${t.symbol} id=${id}`);
    res.json({ ok: true, id });
  } catch(e) {
    console.error('DB trade/open error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/trade/:id/decision-trace', async (req, res) => {
  try {
    await ensureTradeLearningColumns();
    const [rows] = await db.execute(`SELECT id,symbol,direction,policy_version,opportunity_cycle_id,
      score_trace,sizing_trace,opened_at FROM trades WHERE id=? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'trade not found' });
    const row = rows[0];
    res.json({
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      policyVersion: row.policy_version,
      opportunityCycleId: row.opportunity_cycle_id,
      scoreTrace: jsonValue(row.score_trace, null),
      sizingTrace: jsonValue(row.sizing_trace, null),
      openedAt: row.opened_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function persistTradeClose(database, t) {
  const connection = await database.getConnection();
  let tradeId = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id,status FROM trades WHERE symbol=? ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
      [t.symbol]
    );
    if (!rows?.length) {
      await connection.rollback();
      return { found: false };
    }
    tradeId = rows[0].id;
    const [closeRows] = await connection.execute(
      `SELECT id FROM trade_closes WHERE trade_id=? LIMIT 1 FOR UPDATE`, [tradeId]
    );
    if (rows[0].status === 'CLOSED' || closeRows.length) {
      if (t.exchangeVerified === true && closeRows.length) {
        const verifiedReason = t.closeReason?.toUpperCase() || 'MANUAL';
        const verifiedStage = t.trailingStage || 'INITIAL';
        await connection.execute(`UPDATE trade_closes SET close_reason=?,trailing_stage=?,
          exit_price=COALESCE(?,exit_price),pnl_usdt=COALESCE(?,pnl_usdt),pnl_pct=COALESCE(?,pnl_pct),
          r_final=COALESCE(?,r_final),duration_minutes=COALESCE(?,duration_minutes) WHERE id=?`,
        [verifiedReason, verifiedStage, t.exitPrice ?? null, t.pnlUsdt ?? null, t.pnlPct ?? null,
          t.rFinal ?? null, t.durationMinutes ?? null, closeRows[0].id]);
      }
      await connection.commit();
      return { found: true, ok: true, status: 'ok', tradeId, alreadyPersisted: true };
    }

    const closeReason  = t.closeReason?.toUpperCase() || 'MANUAL';
    const trailingStage = t.trailingStage || 'INITIAL';
    const isWinStage   = ['BREAKEVEN','TIME_LOCK','LOCK','TRAILING'].includes(trailingStage);

    let pnlUsdt = t.pnlUsdt != null ? +t.pnlUsdt : null;
    let pnlPct  = t.pnlPct  != null ? +t.pnlPct  : null;
    let rFinal  = t.rFinal  != null ? +t.rFinal   : null;

    if(pnlUsdt !== null){
      // SL en INITIAL con PnL positivo → forzar negativo (pérdida real mal calculada)
      if(closeReason === 'SL' && pnlUsdt > 0 && !isWinStage){
        pnlUsdt = -pnlUsdt;
        pnlPct  = pnlPct  ? -Math.abs(pnlPct)  : pnlPct;
        rFinal  = rFinal  ? -Math.abs(rFinal)   : rFinal;
      }
      // SL en win stage con PnL negativo → forzar positivo (SL movido con ganancia)
      if(closeReason === 'SL' && pnlUsdt < 0 && isWinStage){
        pnlUsdt = Math.abs(pnlUsdt);
        pnlPct  = pnlPct  ? Math.abs(pnlPct)   : pnlPct;
        rFinal  = rFinal  ? Math.abs(rFinal)    : rFinal;
      }
      // TP con PnL negativo → siempre forzar positivo
      if(closeReason === 'TP' && pnlUsdt < 0){
        pnlUsdt = -pnlUsdt;
        pnlPct  = pnlPct  ? Math.abs(pnlPct)   : pnlPct;
        rFinal  = rFinal  ? Math.abs(rFinal)    : rFinal;
      }
    }

    await connection.execute(`UPDATE trades SET status='CLOSED' WHERE id=?`, [tradeId]);
    await connection.execute(
      `INSERT INTO trade_closes (trade_id,symbol,exit_price,pnl_usdt,pnl_pct,r_final,close_reason,trailing_stage,duration_minutes,closed_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [tradeId, t.symbol, t.exitPrice||null, pnlUsdt, pnlPct, rFinal, closeReason, trailingStage, t.durationMinutes||null]
    );
    await connection.commit();
    console.log(`DB: Trade cerrado ${t.symbol} id=${tradeId} pnl=${pnlUsdt} reason=${closeReason} stage=${trailingStage}`);
    return { found: true, ok: true, status: 'ok', tradeId, alreadyPersisted: false };
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (Number(error.code) === 1062 && tradeId != null) {
      return { found: true, ok: true, status: 'ok', tradeId, alreadyPersisted: true };
    }
    throw error;
  } finally {
    connection.release();
  }
}

router.post('/db/trade/close', async (req, res) => {
  try {
    const result = await persistTradeClose(db, req.body);
    if (!result.found) return res.status(404).json({ error: 'No trade for ' + req.body.symbol });
    res.json(result);
  } catch(e) {
    console.error('DB trade/close error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/rejection', async (req, res) => {
  const t = req.body;
  try{
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS tf4h_status VARCHAR(15) NULL`).catch(()=>{});
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS macro_bias VARCHAR(10) NULL`).catch(()=>{});
    await db.execute(`ALTER TABLE trade_rejections ADD COLUMN IF NOT EXISTS macro_fear_greed INT NULL`).catch(()=>{});
    const rejectionParams = [
      t.symbol,t.direction,t.skipReason,t.finalScore,t.scanScore,
      t.aiResult?.regime,t.aiResult?.direction_bias,
      t.aiVision?.market_state,t.aiVision?.approve_trade?1:0,
      t.indicators?.rsi14,t.indicators?.atrPct,t.indicators?.volRatio,t.indicators?.fundingRate,
      t.tf4hStatus||null, t.macroBias||null, t.fearGreed||null
    ].map(value => value === undefined ? null : value);
    await query(
      `INSERT INTO trade_rejections (symbol,direction,skip_reason,final_score,scan_score,ai_regime,ai_bias,vision_state,vision_approved,rsi14,atr_pct,vol_ratio,funding_rate,tf4h_status,macro_bias,macro_fear_greed,rejected_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      rejectionParams
    );
    await insertScanEvent(t, false, t.skipReason || null).catch(e => {
      console.log('scan event from rejection error:', e.message);
    });
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/db/scan', async (req, res) => {
  const t = req.body;
  try {
    await insertScanEvent(t, !!t.passAI, t.skipReason || null);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/db/stats', async (req, res) => {
  try {
    const [daily,symbols,recent,topRejections,weeklyPnl,winLoss] = await Promise.all([
      query(`SELECT * FROM daily_pnl LIMIT 30`),
      query(`SELECT symbol, ROUND(CAST(total_pnl AS DECIMAL(10,2)),2) as total_pnl, win_rate FROM symbol_performance LIMIT 20`),
      query(`SELECT t.*,tc.pnl_usdt,tc.r_final,tc.close_reason,tc.trailing_stage,tc.duration_minutes,tc.closed_at FROM trades t LEFT JOIN trade_closes tc ON t.id=tc.trade_id ORDER BY t.opened_at DESC LIMIT 50`),
      query(`SELECT skip_reason,COUNT(*) as count FROM trade_rejections GROUP BY skip_reason ORDER BY count DESC LIMIT 10`),
      query(`SELECT DATE_FORMAT(closed_at,'%Y-%u') as week, ROUND(CAST(SUM(pnl_usdt) AS DECIMAL(10,2)),2) as pnl, COUNT(*) as trades FROM trade_closes GROUP BY DATE_FORMAT(closed_at,'%Y-%u') ORDER BY week DESC LIMIT 12`),
      query(`SELECT SUM(pnl_usdt>0) as wins,SUM(pnl_usdt<=0) as losses,ROUND(AVG(r_final),2) as avg_r,ROUND(SUM(pnl_usdt),2) as total_pnl FROM trade_closes`)
    ]);
    res.json({ daily, symbols, recent, topRejections, weeklyPnl, winLoss: winLoss?.[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/research/summary', async (req, res) => {
  try {
    res.json(await getResearchSummary());
  } catch(e) {
    console.error('research summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/symbols', async (req, res) => {
  try {
    const symbols = await getResearchSymbols();
    res.json({
      symbols,
      best: symbols.filter(s => s.trades > 0).sort((a, b) => b.expectancy - a.expectancy || b.pnl - a.pnl).slice(0, 8),
      worst: symbols.filter(s => s.trades > 0).sort((a, b) => a.expectancy - b.expectancy || a.pnl - b.pnl).slice(0, 8)
    });
  } catch(e) {
    console.error('research symbols error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/hours', async (req, res) => {
  try {
    const hours = await getResearchHours();
    res.json({
      hours,
      best: [...hours].filter(h => h.trades > 0).sort((a, b) => b.expectancy - a.expectancy || b.pnl - a.pnl).slice(0, 3),
      worst: [...hours].filter(h => h.trades > 0).sort((a, b) => a.expectancy - b.expectancy || a.pnl - b.pnl).slice(0, 3)
    });
  } catch(e) {
    console.error('research hours error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/rejections', async (req, res) => {
  try {
    const [rejections, summary] = await Promise.all([
      getResearchRejections(),
      getResearchSummary()
    ]);
    res.json({
      ...rejections,
      totalSignals: summary.totalSignals,
      acceptedSignals: summary.acceptedSignals,
      rejectedSignals: summary.rejectedSignals,
      rejectionRate: summary.rejectionRate
    });
  } catch(e) {
    console.error('research rejections error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/setups', async (req, res) => {
  try {
    res.json(await getResearchSetups());
  } catch(e) {
    console.error('research setups error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/research-report', async (req, res) => {
  const body = req.body || {};
  try {
    await ensureResearchReportsTable();
    const report = String(body.report || body.text || '').trim();
    if (!report) return res.status(400).json({ error: 'report required' });
    const parsed = parseReportSections(report);
    const reportDate = body.date || body.reportDate || new Date().toISOString().slice(0, 10);
    const reportType = String(body.reportType || body.type || 'daily').toLowerCase();
    const findings = body.findings || parsed.findings;
    const recommendations = body.recommendations || parsed.recommendations;
    const risks = body.risks || parsed.risks;
    const opportunities = body.opportunities || parsed.opportunities;

    const [result] = await db.execute(
      `INSERT INTO research_reports
        (report_date, report_type, report, findings, recommendations, risks, opportunities, score, model, source_workflow)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        reportDate,
        reportType,
        report,
        JSON.stringify(findings || []),
        JSON.stringify(recommendations || []),
        JSON.stringify(risks || []),
        JSON.stringify(opportunities || []),
        body.score == null ? null : Number(body.score),
        body.model || null,
        body.sourceWorkflow || body.source_workflow || null
      ]
    );
    const recommendationsSync = await syncRecommendationsForReport(result.insertId);
    res.json({ ok: true, id: result.insertId, recommendations: recommendationsSync });
  } catch(e) {
    console.error('research report insert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/reports', async (req, res) => {
  try {
    await ensureResearchReportsTable();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
    const type = req.query.type ? String(req.query.type).toLowerCase() : null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    const where = [];
    const params = [];
    if (type) { where.push('report_type=?'); params.push(type); }
    if (from) { where.push('report_date>=?'); params.push(from); }
    if (to) { where.push('report_date<=?'); params.push(to); }
    const sql = `SELECT id, report_date, report_type, report, findings, recommendations, risks, opportunities, score, model, source_workflow, created_at
      FROM research_reports
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY report_date DESC, created_at DESC
      LIMIT ${limit}`;
    const rows = await query(sql, params);
    res.json({ reports: rows || [] });
  } catch(e) {
    console.error('research reports error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/reports/latest', async (req, res) => {
  try {
    await ensureResearchReportsTable();
    const type = req.query.type ? String(req.query.type).toLowerCase() : null;
    const rows = await query(
      `SELECT id, report_date, report_type, report, findings, recommendations, risks, opportunities, score, model, source_workflow, created_at
       FROM research_reports
       ${type ? 'WHERE report_type=?' : ''}
       ORDER BY report_date DESC, created_at DESC
       LIMIT 1`,
      type ? [type] : []
    );
    res.json({ report: rows?.[0] || null });
  } catch(e) {
    console.error('latest research report error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/recommendations/sync', async (req, res) => {
  try {
    await ensureRecommendationTables();
    const reportId = req.body?.reportId || req.body?.report_id || null;
    const reports = reportId
      ? await query(`SELECT id FROM research_reports WHERE id=?`, [reportId])
      : await query(`SELECT id FROM research_reports ORDER BY report_date DESC, created_at DESC LIMIT 200`);
    const results = [];
    for (const report of reports || []) {
      results.push({ reportId: report.id, ...(await syncRecommendationsForReport(report.id)) });
    }
    res.json({ ok: true, reports: results });
  } catch(e) {
    console.error('recommendations sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/recommendations/review', async (req, res) => {
  try {
    const reviewed = await reviewDueRecommendations();
    res.json({ ok: true, reviewed });
  } catch(e) {
    console.error('recommendations review error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/recommendations', async (req, res) => {
  try {
    await ensureRecommendationTables();
    const status = req.query.status ? String(req.query.status) : null;
    const category = req.query.category ? String(req.query.category) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '120', 10) || 120, 1), 300);
    const where = [];
    const params = [];
    if (status) { where.push('ar.status=?'); params.push(status); }
    if (category) { where.push('ar.category=?'); params.push(category); }
    const rows = await query(`SELECT
        ar.id, ar.report_id, ar.recommendation, ar.category, ar.confidence, ar.rationale, ar.evidence,
        ar.evidence_level, ar.implementation_status,
        ar.status, ar.review_date, ar.impact_score, ar.outcome, ar.notes, ar.created_at, ar.updated_at,
        rr.report_date, rr.report_type, rr.model
      FROM ai_recommendations ar
      LEFT JOIN research_reports rr ON rr.id=ar.report_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ar.created_at DESC, ar.id DESC
      LIMIT ${limit}`, params);
    res.json({ recommendations: rows || [] });
  } catch(e) {
    console.error('research recommendations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/recommendations/performance', async (req, res) => {
  try {
    await ensureRecommendationTables();
    const rows = await query(`SELECT
        COUNT(*) AS total,
        SUM(status='validated') AS validated,
        SUM(status='rejected') AS rejected,
        SUM(status='reviewing') AS reviewing,
        SUM(status='pending') AS pending,
        SUM(outcome='positive') AS positive,
        SUM(outcome='neutral') AS neutral,
        SUM(outcome='negative') AS negative,
        AVG(impact_score) AS avg_impact
      FROM ai_recommendations`);
    const byCategory = await query(`SELECT
        category,
        COUNT(*) AS total,
        SUM(outcome='positive') AS positive,
        SUM(outcome='neutral') AS neutral,
        SUM(outcome='negative') AS negative,
        AVG(impact_score) AS avg_impact
      FROM ai_recommendations
      GROUP BY category
      ORDER BY total DESC`);
    const recentReviews = await query(`SELECT
        rr.id, rr.recommendation_id, rr.review_date, rr.before_metrics, rr.after_metrics, rr.impact_score, rr.outcome, rr.notes,
        ar.recommendation, ar.category, ar.confidence
      FROM recommendation_reviews rr
      JOIN ai_recommendations ar ON ar.id=rr.recommendation_id
      ORDER BY rr.review_date DESC
      LIMIT 40`);
    const summary = rows?.[0] || {};
    const total = numberValue(summary.total);
    const positive = numberValue(summary.positive);
    res.json({
      summary: {
        total,
        validated: numberValue(summary.validated),
        rejected: numberValue(summary.rejected),
        reviewing: numberValue(summary.reviewing),
        pending: numberValue(summary.pending),
        positive,
        neutral: numberValue(summary.neutral),
        negative: numberValue(summary.negative),
        successRate: total ? round((positive / total) * 100, 1) : 0,
        avgImpactScore: round(summary.avg_impact, 3)
      },
      byCategory: (byCategory || []).map(row => ({
        category: row.category,
        total: numberValue(row.total),
        positive: numberValue(row.positive),
        neutral: numberValue(row.neutral),
        negative: numberValue(row.negative),
        avgImpactScore: round(row.avg_impact, 3)
      })),
      recentReviews: recentReviews || []
    });
  } catch(e) {
    console.error('recommendations performance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/research/strategy-evolution', async (req, res) => {
  try {
    await ensureRecommendationTables();
    const rows = await query(`SELECT
        DATE(ar.created_at) AS version_date,
        COUNT(*) AS recommendations,
        SUM(ar.status='validated') AS validated,
        SUM(ar.status='rejected') AS rejected,
        AVG(ar.impact_score) AS avg_impact,
        GROUP_CONCAT(DISTINCT ar.category ORDER BY ar.category SEPARATOR ', ') AS categories
      FROM ai_recommendations ar
      GROUP BY DATE(ar.created_at)
      ORDER BY version_date DESC
      LIMIT 60`);
    res.json({ evolution: (rows || []).map((row, idx) => ({
      version: `Research-${isoDateOnly(row.version_date)}-${idx + 1}`,
      date: row.version_date,
      recommendations: numberValue(row.recommendations),
      validated: numberValue(row.validated),
      rejected: numberValue(row.rejected),
      avgImpactScore: round(row.avg_impact, 3),
      categories: row.categories || ''
    })) });
  } catch(e) {
    console.error('strategy evolution error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/db/trade/update-sl', async (req, res) => {
  const t = req.body;
  try {
    const [rows] = await db.execute(
      `SELECT id FROM trades WHERE symbol=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`,
      [t.symbol]
    );
    if (!rows?.length) return res.status(404).json({ error: 'No open trade for ' + t.symbol });
    const tradeId = rows[0].id;
    await db.execute(`UPDATE trades SET sl_price=?,trailing_stage=COALESCE(?,trailing_stage) WHERE id=?`,
      [t.newSL || null, t.stage || null, tradeId]);
    console.log(`DB: SL actualizado ${t.symbol} → ${t.newSL}`);
    res.json({ ok: true, tradeId });
  } catch(e) {
    console.error('DB update-sl error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.persistTradeClose = persistTradeClose;
