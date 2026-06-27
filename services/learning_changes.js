'use strict';

const crypto = require('crypto');
const shared = require('../shared');

const { db } = shared;
const HOUR_BUCKETS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(num(value) * factor) / factor;
}

function jsonValue(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function sqlDate(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function hourBucket(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return HOUR_BUCKETS[Math.floor(date.getUTCHours() / 4)] || '20-24';
}

function normalizeSetup(value, row = {}) {
  const setup = String(value || '').trim();
  if (setup) return setup.replace(/\s*[|/]\s*/g, ' / ').toUpperCase();
  return [row.ai_regime || 'N/A', row.tf4h_status || 'N/A', row.macro_bias || 'N/A']
    .join(' / ')
    .toUpperCase();
}

function scoreBand(value) {
  const score = Math.max(0, Math.min(100, Math.floor(num(value))));
  if (score >= 100) return '100';
  const start = Math.floor(score / 10) * 10;
  return `${start}-${start + 9}`;
}

async function ensureTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_changes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    change_key CHAR(64) NOT NULL,
    parent_change_id BIGINT NULL,
    rule_id BIGINT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_key VARCHAR(255) NOT NULL,
    component VARCHAR(80) NOT NULL,
    parameter_name VARCHAR(80) NOT NULL DEFAULT 'state',
    change_type VARCHAR(24) NOT NULL DEFAULT 'apply',
    before_value JSON NULL,
    after_value JSON NULL,
    reason TEXT NULL,
    human_explanation TEXT NULL,
    evidence JSON NULL,
    source_recommendation_ids JSON NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'learning_engine',
    actor VARCHAR(120) NOT NULL DEFAULT 'Learning Engine',
    status VARCHAR(30) NOT NULL DEFAULT 'monitoring',
    minimum_sample INT NOT NULL DEFAULT 10,
    validation_sample INT NOT NULL DEFAULT 20,
    baseline_start DATETIME NULL,
    baseline_end DATETIME NULL,
    implemented_at DATETIME NOT NULL DEFAULT NOW(),
    reviewed_at DATETIME NULL,
    reverted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY uq_learning_change_key (change_key),
    INDEX idx_learning_changes_status (status, implemented_at),
    INDEX idx_learning_changes_target (target_type, target_key, implemented_at),
    INDEX idx_learning_changes_rule (rule_id),
    CONSTRAINT fk_learning_change_parent FOREIGN KEY (parent_change_id) REFERENCES learning_changes(id) ON DELETE SET NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_change_reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    change_id BIGINT NOT NULL,
    review_status VARCHAR(30) NOT NULL,
    verdict VARCHAR(30) NOT NULL DEFAULT 'no_evidence',
    before_metrics JSON NULL,
    after_metrics JSON NULL,
    metric_deltas JSON NULL,
    impact_score DECIMAL(12,4) NULL,
    confidence_pct DECIMAL(8,3) NULL,
    statistically_significant TINYINT(1) NOT NULL DEFAULT 0,
    explanation TEXT NULL,
    reviewed_at DATETIME NOT NULL DEFAULT NOW(),
    created_at DATETIME NOT NULL DEFAULT NOW(),
    INDEX idx_change_reviews_change (change_id, reviewed_at),
    CONSTRAINT fk_change_review_change FOREIGN KEY (change_id) REFERENCES learning_changes(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_versions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    change_id BIGINT NULL,
    version_label VARCHAR(80) NOT NULL,
    component VARCHAR(80) NOT NULL,
    summary VARCHAR(255) NOT NULL,
    snapshot JSON NULL,
    actor VARCHAR(120) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    INDEX idx_learning_versions_created (created_at),
    CONSTRAINT fk_learning_version_change FOREIGN KEY (change_id) REFERENCES learning_changes(id) ON DELETE SET NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_reversion_guards (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    change_id BIGINT NOT NULL,
    rule_type VARCHAR(30) NOT NULL,
    rule_key VARCHAR(255) NOT NULL,
    restore_state JSON NOT NULL,
    reason TEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    deactivated_at DATETIME NULL,
    UNIQUE KEY uq_learning_guard (rule_type, rule_key),
    CONSTRAINT fk_learning_guard_change FOREIGN KEY (change_id) REFERENCES learning_changes(id) ON DELETE CASCADE
  )`);

  const seeds = [
    ['change_min_sample', '10', 'Muestra mínima antes de emitir una revisión provisional'],
    ['change_validation_sample', '20', 'Muestra mínima antes de validar o revertir automáticamente'],
    ['change_baseline_days', '14', 'Días usados para construir la línea base anterior'],
    ['change_review_interval_hours', '6', 'Frecuencia máxima de revisión por cambio'],
    ['change_min_expectancy_delta', '0.05', 'Cambio mínimo de expectancy para considerar impacto'],
    ['change_min_avg_r_delta', '0.05', 'Cambio mínimo de R promedio para considerar impacto'],
    ['change_min_profit_factor_delta', '0.10', 'Cambio mínimo de Profit Factor'],
    ['change_min_win_rate_delta', '3', 'Cambio mínimo de Win Rate en puntos porcentuales'],
    ['change_volume_drop_pct', '40', 'Caída de frecuencia sin mejora que recomienda revertir'],
    ['change_auto_revert', '1', 'Permite rollback automático de reglas gestionadas por Learning Engine']
  ];
  await db.query(`INSERT IGNORE INTO learning_config (config_key,config_value,description) VALUES ?`, [seeds]);
}

async function getConfig() {
  await ensureTables();
  const [rows] = await db.execute(`SELECT config_key,config_value FROM learning_config`);
  return Object.fromEntries((rows || []).map(row => [row.config_key, row.config_value]));
}

function ruleSnapshot(rule = {}) {
  return {
    status: rule.status || 'monitoring',
    action: rule.action || 'neutral',
    weight: round(rule.weight ?? 1, 6),
    researchFactor: round(rule.research_factor ?? rule.researchFactor ?? 1, 6),
    reviewFactor: round(rule.review_factor ?? rule.reviewFactor ?? 1, 6)
  };
}

function snapshotsDiffer(before, after) {
  return before.status !== after.status ||
    before.action !== after.action ||
    Math.abs(before.weight - after.weight) > 0.000001 ||
    Math.abs(before.researchFactor - after.researchFactor) > 0.000001 ||
    Math.abs(before.reviewFactor - after.reviewFactor) > 0.000001;
}

function changeHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function componentLabel(ruleType) {
  return ({
    symbol: 'Peso de símbolo',
    session: 'Peso de sesión',
    setup: 'Peso de setup',
    regime: 'Peso de régimen',
    score_band: 'Peso de score band',
    combination: 'Peso de combinación'
  })[ruleType] || `Parámetro ${ruleType}`;
}

function humanRuleExplanation(rule, before, after) {
  const direction = after.weight < before.weight ? 'redujo' : after.weight > before.weight ? 'aumentó' : 'mantuvo';
  const metrics = rule.metrics || {};
  return `Learning Engine ${direction} ${componentLabel(rule.ruleType).toLowerCase()} de ${rule.ruleKey} ` +
    `de ${before.weight.toFixed(3)} a ${after.weight.toFixed(3)}. ` +
    `La evidencia usada contiene ${num(metrics.sample)} trades, WR ${round(metrics.winRate, 1)}%, ` +
    `expectancy ${round(metrics.expectancy, 3)} y Profit Factor ${round(metrics.profitFactor, 2)}.`;
}

async function insertVersion(connection, changeId, component, actor, summary, snapshot, implementedAt = new Date()) {
  const label = `L-${String(changeId).padStart(6, '0')}`;
  await connection.execute(`INSERT INTO learning_versions
    (change_id,version_label,component,summary,snapshot,actor,created_at)
    VALUES (?,?,?,?,?,?,?)`, [changeId, label, component, String(summary).slice(0, 255), JSON.stringify(snapshot), actor, sqlDate(implementedAt)]);
}

async function insertChange(connection, payload) {
  const config = payload.config || await getConfig();
  const implementedAt = payload.implementedAt ? new Date(payload.implementedAt) : new Date();
  const baselineDays = Math.max(1, num(config.change_baseline_days, 14));
  const minimumSample = Math.max(10, num(config.change_min_sample, 10));
  const validationSample = Math.max(minimumSample, num(config.change_validation_sample, 20));
  const beforeValue = payload.beforeValue || {};
  const afterValue = payload.afterValue || {};
  const key = changeHash({
    targetType: payload.targetType,
    targetKey: payload.targetKey,
    component: payload.component,
    parameterName: payload.parameterName || 'state',
    beforeValue,
    afterValue,
    implementedAt: implementedAt.toISOString()
  });
  const [result] = await connection.execute(`INSERT IGNORE INTO learning_changes
    (change_key,parent_change_id,rule_id,target_type,target_key,component,parameter_name,change_type,before_value,after_value,reason,human_explanation,evidence,source_recommendation_ids,source,actor,status,minimum_sample,validation_sample,baseline_start,baseline_end,implemented_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    key, payload.parentChangeId || null, payload.ruleId || null,
    payload.targetType, payload.targetKey, payload.component,
    payload.parameterName || 'state', payload.changeType || 'apply',
    JSON.stringify(beforeValue), JSON.stringify(afterValue), payload.reason || null,
    payload.humanExplanation || null, JSON.stringify(payload.evidence || {}),
    JSON.stringify(payload.sourceRecommendationIds || []), payload.source || 'learning_engine',
    payload.actor || 'Learning Engine', payload.status || 'monitoring', minimumSample, validationSample,
    sqlDate(addDays(implementedAt, -baselineDays)), sqlDate(implementedAt), sqlDate(implementedAt)
  ]);
  if (!result.insertId) return null;
  await connection.execute(`UPDATE learning_changes SET status='superseded',reviewed_at=NOW()
    WHERE id<>? AND target_type=? AND target_key=? AND parameter_name=? AND status IN ('pending','monitoring','insufficient')`,
  [result.insertId, payload.targetType, payload.targetKey, payload.parameterName || 'state']);
  await insertVersion(connection, result.insertId, payload.component, payload.actor || 'Learning Engine',
    payload.humanExplanation || payload.reason || `${payload.component} actualizado`, afterValue, implementedAt);
  return result.insertId;
}

async function recordRuleChange(connection, beforeRule, rule, options = {}) {
  const before = ruleSnapshot(beforeRule || {});
  const after = ruleSnapshot({
    status: rule.status,
    action: rule.action,
    weight: rule.weight,
    researchFactor: rule.researchFactor,
    reviewFactor: rule.reviewFactor
  });
  if (!snapshotsDiffer(before, after)) return null;
  const reason = rule.rationale || `${componentLabel(rule.ruleType)} recalculado con resultados reales.`;
  return insertChange(connection, {
    targetType: 'learning_rule',
    targetKey: `${rule.ruleType}:${rule.ruleKey}`,
    component: componentLabel(rule.ruleType),
    parameterName: 'rule_state',
    changeType: beforeRule ? 'update' : 'apply',
    beforeValue: before,
    afterValue: after,
    reason,
    humanExplanation: humanRuleExplanation(rule, before, after),
    evidence: {
      ruleType: rule.ruleType,
      ruleKey: rule.ruleKey,
      sample: rule.metrics?.sample || 0,
      wins: rule.metrics?.wins || 0,
      losses: rule.metrics?.losses || 0,
      winRate: rule.metrics?.winRate || 0,
      expectancy: rule.metrics?.expectancy || 0,
      profitFactor: rule.metrics?.profitFactor || 0,
      maxDrawdown: rule.metrics?.maxDrawdown || 0
    },
    sourceRecommendationIds: rule.ids || [],
    source: options.source || 'learning_engine',
    actor: options.actor || 'Learning Engine',
    ruleId: beforeRule?.id || options.ruleId || null,
    implementedAt: options.implementedAt || new Date(),
    config: options.config
  });
}

async function getRuleGuards() {
  await ensureTables();
  const [rows] = await db.execute(`SELECT * FROM learning_reversion_guards WHERE active=1`);
  return new Map((rows || []).map(row => [`${row.rule_type}:${row.rule_key}`, jsonValue(row.restore_state, {})]));
}

function applyGuard(rule, guard) {
  if (!guard) return rule;
  return {
    ...rule,
    status: guard.status || rule.status,
    action: guard.action || 'neutral',
    weight: num(guard.weight, 1),
    researchFactor: num(guard.researchFactor, 1),
    reviewFactor: num(guard.reviewFactor, 1),
    guardedByReversion: true
  };
}

function matchesScope(row, change) {
  const evidence = jsonValue(change.evidence, {});
  const ruleType = evidence.ruleType;
  const ruleKey = evidence.ruleKey;
  if (!ruleType || !ruleKey) return true;
  if (ruleType === 'symbol') return String(row.symbol || '').toUpperCase() === String(ruleKey).toUpperCase();
  if (ruleType === 'session') return hourBucket(row.opened_at) === ruleKey;
  if (ruleType === 'regime') return String(row.ai_regime || 'N/A').toUpperCase() === String(ruleKey).toUpperCase();
  if (ruleType === 'setup') return normalizeSetup(row.setup_label, row) === ruleKey;
  if (ruleType === 'score_band') return scoreBand(row.final_score) === ruleKey;
  if (ruleType === 'combination') {
    return `${String(row.symbol || '').toUpperCase()} :: ${normalizeSetup(row.setup_label, row)} :: ${hourBucket(row.opened_at)}` === ruleKey;
  }
  return true;
}

function computeMetrics(rows, start, end) {
  const ordered = [...rows].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
  const pnl = ordered.map(row => num(row.pnl_usdt));
  const rValues = ordered.map(row => num(row.r_final));
  const wins = pnl.filter(value => value > 0).length;
  const grossProfit = pnl.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(pnl.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  pnl.forEach(value => {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  });
  const sample = pnl.length;
  const avgR = sample ? rValues.reduce((sum, value) => sum + value, 0) / sample : 0;
  const varianceR = sample > 1
    ? rValues.reduce((sum, value) => sum + ((value - avgR) ** 2), 0) / (sample - 1)
    : 0;
  const periodDays = Math.max((new Date(end) - new Date(start)) / 86400000, 1 / 24);
  return {
    trades: sample,
    wins,
    losses: sample - wins,
    winRate: sample ? round((wins / sample) * 100, 2) : 0,
    pnl: round(pnl.reduce((sum, value) => sum + value, 0), 4),
    expectancy: sample ? round(pnl.reduce((sum, value) => sum + value, 0) / sample, 4) : 0,
    profitFactor: round(grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 9.99 : 0), 4),
    avgR: round(avgR, 4),
    stdDevR: round(Math.sqrt(varianceR), 4),
    maxDrawdown: round(maxDrawdown, 4),
    tradesPerDay: round(sample / periodDays, 4),
    periodDays: round(periodDays, 3)
  };
}

async function performanceWindow(change, start, end) {
  const [rows] = await db.execute(`SELECT t.symbol,t.setup_label,t.ai_regime,t.tf4h_status,t.macro_bias,
      t.final_score,t.opened_at,tc.pnl_usdt,tc.r_final,tc.closed_at
    FROM trades t JOIN trade_closes tc ON tc.trade_id=t.id
    WHERE t.opened_at>=? AND t.opened_at<? ORDER BY tc.closed_at ASC`, [sqlDate(start), sqlDate(end)]);
  return computeMetrics((rows || []).filter(row => matchesScope(row, change)), start, end);
}

function normalConfidence(zScore) {
  const z = Math.abs(num(zScore));
  if (z >= 2.576) return 99;
  if (z >= 1.96) return 95;
  if (z >= 1.645) return 90;
  if (z >= 1.282) return 80;
  return Math.max(0, round(z / 1.282 * 80, 1));
}

function compareMetrics(before, after, change, config) {
  const minimum = num(change.minimum_sample, Math.max(10, num(config.change_min_sample, 10)));
  const validation = num(change.validation_sample, Math.max(20, num(config.change_validation_sample, 20)));
  const deltas = {
    trades: after.trades - before.trades,
    tradesPerDay: round(after.tradesPerDay - before.tradesPerDay, 4),
    winRate: round(after.winRate - before.winRate, 3),
    expectancy: round(after.expectancy - before.expectancy, 4),
    profitFactor: round(after.profitFactor - before.profitFactor, 4),
    avgR: round(after.avgR - before.avgR, 4),
    drawdown: round(after.maxDrawdown - before.maxDrawdown, 4)
  };
  const standardError = before.trades > 1 && after.trades > 1
    ? Math.sqrt((before.stdDevR ** 2) / before.trades + (after.stdDevR ** 2) / after.trades)
    : 0;
  const zScore = standardError > 0 ? deltas.avgR / standardError : 0;
  const confidence = normalConfidence(zScore);
  const significant = Math.abs(zScore) >= 1.96;
  const volumeDropPct = before.tradesPerDay > 0
    ? ((before.tradesPerDay - after.tradesPerDay) / before.tradesPerDay) * 100
    : 0;
  const enoughBaseline = before.trades >= minimum;
  const enoughAfter = after.trades >= minimum;
  const enoughValidation = before.trades >= validation && after.trades >= validation;
  const thresholds = {
    expectancy: num(config.change_min_expectancy_delta, 0.05),
    avgR: num(config.change_min_avg_r_delta, 0.05),
    profitFactor: num(config.change_min_profit_factor_delta, 0.10),
    winRate: num(config.change_min_win_rate_delta, 3),
    volumeDrop: num(config.change_volume_drop_pct, 40)
  };
  const qualityFlat = Math.abs(deltas.avgR) < thresholds.avgR &&
    Math.abs(deltas.expectancy) < thresholds.expectancy &&
    Math.abs(deltas.profitFactor) < thresholds.profitFactor &&
    Math.abs(deltas.winRate) < thresholds.winRate;
  const volumeOnly = enoughValidation && volumeDropPct >= thresholds.volumeDrop && qualityFlat;
  const improved = enoughValidation && significant && deltas.avgR > 0 &&
    (deltas.expectancy >= thresholds.expectancy || deltas.profitFactor >= thresholds.profitFactor || deltas.winRate >= thresholds.winRate) &&
    deltas.drawdown >= -Math.max(0.25, Math.abs(before.maxDrawdown) * 0.10);
  const worsened = enoughValidation && (
    (significant && deltas.avgR < 0 &&
      (deltas.expectancy <= -thresholds.expectancy || deltas.profitFactor <= -thresholds.profitFactor || deltas.winRate <= -thresholds.winRate)) ||
    volumeOnly
  );
  let verdict = 'no_evidence';
  let reviewStatus = 'insufficient';
  if (enoughBaseline && enoughAfter) reviewStatus = 'monitoring';
  if (improved) { verdict = 'improved'; reviewStatus = 'validated'; }
  else if (worsened) { verdict = volumeOnly ? 'volume_only' : 'worsened'; reviewStatus = 'revert_required'; }
  else if (enoughValidation) verdict = 'no_effect';
  const impactScore = round(
    deltas.avgR * 35 + deltas.winRate * 0.15 + deltas.profitFactor * 4 + deltas.expectancy * 1.5 +
    Math.max(-10, Math.min(10, deltas.drawdown * 0.1)), 4
  );
  return {
    verdict,
    reviewStatus,
    deltas: { ...deltas, zScore: round(zScore, 4), volumeDropPct: round(volumeDropPct, 2) },
    impactScore,
    confidence,
    significant,
    enoughBaseline,
    enoughAfter,
    enoughValidation,
    volumeOnly
  };
}

function reviewExplanation(comparison, before, after, change) {
  if (!comparison.enoughBaseline) {
    return `No existe línea base suficiente: ${before.trades}/${change.minimum_sample} trades anteriores. El cambio sigue en observación.`;
  }
  if (!comparison.enoughAfter) {
    return `El cambio lleva ${after.trades}/${change.minimum_sample} trades posteriores. Todavía no existe evidencia suficiente.`;
  }
  if (!comparison.enoughValidation) {
    return `Ya puede observarse, pero faltan datos para decidir: ${after.trades}/${change.validation_sample} trades posteriores.`;
  }
  if (comparison.verdict === 'improved') {
    return `El cambio mejoró con evidencia estadística: WR ${before.winRate}% → ${after.winRate}%, ` +
      `expectancy ${before.expectancy} → ${after.expectancy}, PF ${before.profitFactor} → ${after.profitFactor}.`;
  }
  if (comparison.verdict === 'volume_only') {
    return `El cambio redujo la frecuencia ${Math.abs(comparison.deltas.volumeDropPct).toFixed(1)}% sin mejorar WR, expectancy, PF ni R promedio. Debe revertirse.`;
  }
  if (comparison.verdict === 'worsened') {
    return `El rendimiento empeoró: WR ${before.winRate}% → ${after.winRate}%, expectancy ${before.expectancy} → ${after.expectancy}, ` +
      `PF ${before.profitFactor} → ${after.profitFactor}. Debe revertirse.`;
  }
  return `Con ${after.trades} trades posteriores no existe una mejora estadísticamente demostrable. El cambio continúa monitorizándose.`;
}

async function revertChange(connection, change, explanation) {
  const before = jsonValue(change.before_value, {});
  const after = jsonValue(change.after_value, {});
  if (change.target_type === 'learning_rule') {
    const evidence = jsonValue(change.evidence, {});
    await connection.execute(`UPDATE learning_rules SET status=?,action=?,weight=?,research_factor=?,review_factor=?,updated_at=NOW()
      WHERE rule_type=? AND rule_key=?`, [
      before.status || 'monitoring', before.action || 'neutral', num(before.weight, 1),
      num(before.researchFactor, 1), num(before.reviewFactor, 1), evidence.ruleType, evidence.ruleKey
    ]);
    await connection.execute(`INSERT INTO learning_reversion_guards (change_id,rule_type,rule_key,restore_state,reason,active)
      VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE change_id=VALUES(change_id),restore_state=VALUES(restore_state),reason=VALUES(reason),active=1,deactivated_at=NULL`,
    [change.id, evidence.ruleType, evidence.ruleKey, JSON.stringify(before), explanation]);
  } else if (change.target_type === 'learning_config') {
    await connection.execute(`UPDATE learning_config SET config_value=? WHERE config_key=?`, [String(before.value ?? before), change.target_key]);
  } else {
    await connection.execute(`UPDATE learning_changes SET status='revert_required',reviewed_at=NOW() WHERE id=?`, [change.id]);
    return false;
  }
  const revertedAt = new Date();
  await connection.execute(`UPDATE learning_changes SET status='reverted',reviewed_at=NOW(),reverted_at=NOW() WHERE id=?`, [change.id]);
  await insertChange(connection, {
    parentChangeId: change.id,
    ruleId: change.rule_id,
    targetType: change.target_type,
    targetKey: change.target_key,
    component: change.component,
    parameterName: change.parameter_name,
    changeType: 'revert',
    beforeValue: after,
    afterValue: before,
    reason: explanation,
    humanExplanation: `Se revirtió ${change.component} porque la evaluación posterior demostró que empeoró el rendimiento.`,
    evidence: jsonValue(change.evidence, {}),
    sourceRecommendationIds: jsonValue(change.source_recommendation_ids, []),
    source: 'review_engine',
    actor: 'Learning Change Review Engine',
    status: 'reverted',
    implementedAt: revertedAt
  });
  return true;
}

async function reviewChanges(options = {}) {
  await ensureTables();
  const config = await getConfig();
  const force = options.force === true;
  const interval = Math.max(1, num(config.change_review_interval_hours, 6));
  const connection = await db.getConnection();
  let lock = false;
  try {
    const [lockRows] = await connection.execute(`SELECT GET_LOCK('learning_change_review',0) AS acquired`);
    lock = num(lockRows?.[0]?.acquired) === 1;
    if (!lock) return { ok: true, skipped: true, reason: 'review already running' };
    const [changes] = await connection.execute(`SELECT c.*,
        (SELECT MAX(r.reviewed_at) FROM learning_change_reviews r WHERE r.change_id=c.id) AS last_review_at
      FROM learning_changes c
      WHERE c.change_type<>'revert' AND c.status IN ('pending','monitoring','insufficient','revert_required')
        AND (?=1 OR c.reviewed_at IS NULL OR c.reviewed_at<=DATE_SUB(NOW(),INTERVAL ? HOUR))
      ORDER BY c.implemented_at ASC LIMIT 200`, [force ? 1 : 0, interval]);
    const reviewed = [];
    for (const change of changes || []) {
      const now = new Date();
      const before = await performanceWindow(change, new Date(change.baseline_start), new Date(change.baseline_end));
      const after = await performanceWindow(change, new Date(change.implemented_at), now);
      const comparison = compareMetrics(before, after, change, config);
      const explanation = reviewExplanation(comparison, before, after, change);
      const [latestRows] = await connection.execute(`SELECT after_metrics,review_status,verdict FROM learning_change_reviews
        WHERE change_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 1`, [change.id]);
      const latestAfter = jsonValue(latestRows?.[0]?.after_metrics, {});
      const changed = num(latestAfter.trades, -1) !== after.trades || latestRows?.[0]?.review_status !== comparison.reviewStatus || latestRows?.[0]?.verdict !== comparison.verdict;
      if (changed || force) {
        await connection.execute(`INSERT INTO learning_change_reviews
          (change_id,review_status,verdict,before_metrics,after_metrics,metric_deltas,impact_score,confidence_pct,statistically_significant,explanation)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [
          change.id, comparison.reviewStatus, comparison.verdict, JSON.stringify(before), JSON.stringify(after),
          JSON.stringify(comparison.deltas), comparison.impactScore, comparison.confidence,
          comparison.significant ? 1 : 0, explanation
        ]);
      }
      await connection.execute(`UPDATE learning_changes SET status=?,reviewed_at=NOW(),human_explanation=? WHERE id=?`,
        [comparison.reviewStatus, explanation, change.id]);
      let reverted = false;
      if (comparison.reviewStatus === 'revert_required' && config.change_auto_revert === '1') {
        await connection.beginTransaction();
        try {
          reverted = await revertChange(connection, change, explanation);
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      }
      reviewed.push({ id: change.id, status: comparison.reviewStatus, verdict: comparison.verdict, reverted, before, after });
    }
    return { ok: true, reviewed: reviewed.length, changes: reviewed };
  } finally {
    if (lock) await connection.execute(`SELECT RELEASE_LOCK('learning_change_review')`).catch(() => {});
    connection.release();
  }
}

async function bootstrapExistingRules() {
  await ensureTables();
  const config = await getConfig();
  const [rules] = await db.execute(`SELECT r.* FROM learning_rules r
    LEFT JOIN learning_changes c ON c.rule_id=r.id AND c.target_type='learning_rule'
    WHERE c.id IS NULL AND r.status='active' AND r.action<>'neutral'`);
  if (!rules?.length) return { inserted: 0 };
  const connection = await db.getConnection();
  let inserted = 0;
  try {
    await connection.beginTransaction();
    for (const row of rules) {
      const metrics = {
        sample: num(row.sample_size), wins: num(row.wins), losses: num(row.losses), winRate: num(row.win_rate),
        expectancy: num(row.expectancy), profitFactor: num(row.profit_factor), maxDrawdown: num(row.max_drawdown)
      };
      const id = await recordRuleChange(connection, null, {
        ruleType: row.rule_type, ruleKey: row.rule_key, status: row.status, action: row.action,
        weight: num(row.weight, 1), researchFactor: num(row.research_factor, 1), reviewFactor: num(row.review_factor, 1),
        metrics, ids: jsonValue(row.source_recommendation_ids, []), rationale: row.rationale
      }, {
        source: 'historical_bootstrap', actor: 'Learning Engine (migración)', ruleId: row.id,
        implementedAt: row.valid_from || row.created_at, config
      });
      if (id) inserted += 1;
    }
    await connection.commit();
    return { inserted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function registerChange(body = {}) {
  await ensureTables();
  if (!body.targetType || !body.targetKey || !body.component || body.beforeValue === undefined || body.afterValue === undefined) {
    throw new Error('targetType, targetKey, component, beforeValue and afterValue are required');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const id = await insertChange(connection, {
      targetType: String(body.targetType), targetKey: String(body.targetKey), component: String(body.component),
      parameterName: String(body.parameterName || 'value'), changeType: String(body.changeType || 'manual'),
      beforeValue: body.beforeValue, afterValue: body.afterValue, reason: body.reason || null,
      humanExplanation: body.humanExplanation || body.reason || null, evidence: body.evidence || {},
      sourceRecommendationIds: body.sourceRecommendationIds || [], source: body.source || 'external',
      actor: body.actor || 'Operator', status: 'monitoring', implementedAt: body.implementedAt || new Date()
    });
    await connection.commit();
    return { ok: true, id, duplicate: !id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getChanges(options = {}) {
  await ensureTables();
  const limit = Math.max(1, Math.min(500, parseInt(options.limit || 100, 10) || 100));
  const params = [];
  const filters = [];
  if (options.status) { filters.push('c.status=?'); params.push(String(options.status)); }
  if (options.component) { filters.push('c.component=?'); params.push(String(options.component)); }
  params.push(limit);
  const [rows] = await db.query(`SELECT c.*,
      r.review_status,r.verdict,r.before_metrics,r.after_metrics,r.metric_deltas,r.impact_score,
      r.confidence_pct,r.statistically_significant,r.explanation AS review_explanation,r.reviewed_at AS latest_review_at,
      v.version_label
    FROM learning_changes c
    LEFT JOIN learning_change_reviews r ON r.id=(SELECT r2.id FROM learning_change_reviews r2 WHERE r2.change_id=c.id ORDER BY r2.reviewed_at DESC,r2.id DESC LIMIT 1)
    LEFT JOIN learning_versions v ON v.change_id=c.id
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY c.implemented_at DESC,c.id DESC LIMIT ?`, params);
  return rows || [];
}

async function getSummary() {
  await ensureTables();
  const [[counts], [firstChange]] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS total,
      SUM(change_type<>'revert') AS applied,
      SUM(status='validated') AS validated,
      SUM(change_type<>'revert' AND status='reverted') AS reverted,
      SUM(status IN ('monitoring','insufficient')) AS monitoring,
      SUM(status='pending') AS pending,
      SUM(status='revert_required') AS revert_required
      FROM learning_changes`).then(([rows]) => rows),
    db.execute(`SELECT MIN(implemented_at) AS first_at FROM learning_changes WHERE change_type<>'revert'`).then(([rows]) => rows)
  ]);
  const start = firstChange?.first_at ? new Date(firstChange.first_at) : new Date();
  const baselineStart = addDays(start, -14);
  const before = await performanceWindow({ evidence: {} }, baselineStart, start);
  const after = await performanceWindow({ evidence: {} }, start, new Date());
  const [impactRows] = await db.execute(`SELECT COALESCE(SUM(r.impact_score),0) AS cumulative
    FROM learning_change_reviews r
    JOIN learning_changes c ON c.id=r.change_id
    WHERE c.status='validated' AND r.id=(SELECT MAX(r2.id) FROM learning_change_reviews r2 WHERE r2.change_id=r.change_id)`);
  return {
    ...(counts || {}),
    cumulativeImpact: round(impactRows?.[0]?.cumulative, 3),
    before,
    after,
    firstChangeAt: firstChange?.first_at || null
  };
}

async function getTimeline(limit = 100) {
  await ensureTables();
  const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
  const [rows] = await db.query(`SELECT v.*,c.target_type,c.target_key,c.parameter_name,c.change_type,c.status,
      c.before_value,c.after_value,c.human_explanation,c.implemented_at,c.reverted_at
    FROM learning_versions v LEFT JOIN learning_changes c ON c.id=v.change_id
    ORDER BY v.created_at DESC,v.id DESC LIMIT ?`, [safeLimit]);
  return rows || [];
}

let reviewTimerStarted = false;
function startReviewLoop() {
  if (reviewTimerStarted) return;
  reviewTimerStarted = true;
  const timer = setInterval(() => {
    bootstrapExistingRules()
      .then(() => reviewChanges())
      .catch(error => console.error('[Learning Changes] automatic review:', error.message));
  }, 60 * 60 * 1000);
  timer.unref();
  setTimeout(() => {
    bootstrapExistingRules()
      .then(() => reviewChanges())
      .catch(error => console.error('[Learning Changes] initial review:', error.message));
  }, 30000).unref();
}

module.exports = {
  ensureTables,
  getConfig,
  recordRuleChange,
  getRuleGuards,
  applyGuard,
  reviewChanges,
  bootstrapExistingRules,
  registerChange,
  getChanges,
  getSummary,
  getTimeline,
  startReviewLoop,
  _internals: { compareMetrics, ruleSnapshot, snapshotsDiffer, revertChange }
};
