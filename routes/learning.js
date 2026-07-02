'use strict';

const express = require('express');
const router = express.Router();
const shared = require('../shared');
const learningChanges = require('../services/learning_changes');
const { computeLearningBias } = require('../services/learning_bias');
const { buildDecisionTrace } = require('../services/decision_trace');

const { db } = shared;

const HOUR_BUCKETS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(num(value) * factor) / factor;
}

function jsonValue(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function normalizeSetup(value, row = {}) {
  const setup = String(value || '').trim();
  if (setup) return setup.replace(/\s*[|/]\s*/g, ' / ').toUpperCase();
  return [row.ai_regime || 'N/A', row.tf4h_status || 'N/A', row.macro_bias || 'N/A']
    .join(' / ')
    .toUpperCase();
}

function hourBucket(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  const hour = date.getUTCHours();
  return HOUR_BUCKETS[Math.floor(hour / 4)] || '20-24';
}

function scoreBand(value) {
  const score = clamp(Math.floor(num(value)), 0, 100);
  if (score >= 100) return '100';
  const start = Math.floor(score / 10) * 10;
  return `${start}-${start + 9}`;
}

async function ensureLearningTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_config (
    config_key VARCHAR(80) PRIMARY KEY,
    config_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) NULL,
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW()
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_type VARCHAR(30) NOT NULL,
    rule_key VARCHAR(255) NOT NULL,
    status ENUM('active','monitoring','suspended') NOT NULL DEFAULT 'monitoring',
    action ENUM('block','reduce','neutral','prioritize','halt') NOT NULL DEFAULT 'neutral',
    weight DECIMAL(9,6) NOT NULL DEFAULT 1,
    research_factor DECIMAL(9,6) NOT NULL DEFAULT 1,
    review_factor DECIMAL(9,6) NOT NULL DEFAULT 1,
    sample_size INT NOT NULL DEFAULT 0,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    win_rate DECIMAL(9,4) NULL,
    pnl DECIMAL(18,6) NULL,
    expectancy DECIMAL(18,6) NULL,
    profit_factor DECIMAL(12,6) NULL,
    avg_r DECIMAL(12,6) NULL,
    max_drawdown DECIMAL(18,6) NULL,
    confidence DECIMAL(9,4) NULL,
    evidence_level ENUM('low','medium','high') NOT NULL DEFAULT 'low',
    source_recommendation_ids JSON NULL,
    rationale TEXT NULL,
    valid_from DATETIME NULL,
    expires_at DATETIME NULL,
    last_evaluated_at DATETIME NOT NULL DEFAULT NOW(),
    created_at DATETIME NOT NULL DEFAULT NOW(),
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY uq_learning_rule (rule_type, rule_key),
    INDEX idx_learning_rules_status (status, rule_type),
    INDEX idx_learning_rules_evaluated (last_evaluated_at)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_decisions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(24) NULL,
    setup_key VARCHAR(255) NULL,
    session_key VARCHAR(16) NULL,
    regime_key VARCHAR(40) NULL,
    score_band VARCHAR(16) NULL,
    base_score DECIMAL(9,4) NULL,
    required_score DECIMAL(9,4) NULL,
    final_score DECIMAL(9,4) NULL,
    final_factor DECIMAL(9,6) NULL,
    allowed TINYINT(1) NOT NULL DEFAULT 0,
    action VARCHAR(24) NOT NULL,
    reason TEXT NULL,
    components JSON NULL,
    capital_status JSON NULL,
    source_recommendation_ids JSON NULL,
    dry_run TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    INDEX idx_learning_decisions_created (created_at),
    INDEX idx_learning_decisions_symbol (symbol, created_at),
    INDEX idx_learning_decisions_allowed (allowed, created_at)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS learning_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    run_type VARCHAR(30) NOT NULL DEFAULT 'rebuild',
    rules_active INT NOT NULL DEFAULT 0,
    rules_monitoring INT NOT NULL DEFAULT 0,
    rules_suspended INT NOT NULL DEFAULT 0,
    recommendations_implemented INT NOT NULL DEFAULT 0,
    recommendations_discarded INT NOT NULL DEFAULT 0,
    summary JSON NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    INDEX idx_learning_runs_created (created_at)
  )`);

  const seeds = [
    ['learning_enabled', '1', 'Habilita el uso de reglas dinámicas antes de una entrada'],
    ['learning_mode', 'enforce', 'enforce aplica las reglas; observe sólo registra'],
    ['soft_min_sample', '8', 'Muestra mínima para que un peso influya'],
    ['hard_min_sample', '20', 'Muestra mínima para permitir un bloqueo aprendido'],
    ['full_confidence_sample', '40', 'Muestra para confianza estadística completa'],
    ['min_weight', '0.85', 'Peso mínimo por dimensión'],
    ['max_weight', '1.12', 'Peso máximo por dimensión'],
    ['min_final_factor', '0.70', 'Multiplicador compuesto mínimo'],
    ['max_final_factor', '1.30', 'Multiplicador compuesto máximo'],
    ['learning_component_delta_cap', '3', 'Máximo ajuste aditivo por dimensión'],
    ['learning_delta_cap', '8', 'Máximo ajuste aditivo total de Learning'],
    ['block_expectancy_max', '-0.75', 'Expectancy máxima para bloqueo con muestra fuerte'],
    ['block_profit_factor_max', '0.75', 'Profit factor máximo para bloqueo con muestra fuerte'],
    ['block_win_rate_max', '40', 'Win rate máximo para bloqueo con muestra fuerte'],
    ['daily_loss_limit_pct', '15', 'Circuit breaker diario como porcentaje del balance'],
    ['weekly_loss_limit_pct', '20', 'Circuit breaker móvil de siete días'],
    ['max_drawdown_pct', '25', 'Drawdown máximo histórico respecto al balance'],
    ['max_consecutive_losses', '4', 'Máximo global de pérdidas consecutivas'],
    ['max_group_consecutive_losses', '4', 'Máximo de pérdidas seguidas por símbolo, setup o sesión'],
    ['loss_streak_cooldown_hours', '24', 'Pausa temporal después de una racha de pérdidas'],
    ['hard_block_cooldown_hours', '72', 'Vigencia de un bloqueo aprendido antes de volver a reducción'],
    ['drawdown_window_days', '7', 'Ventana móvil usada por el circuit breaker de drawdown'],
    ['rule_ttl_hours', '36', 'Vigencia máxima antes de reconstruir reglas']
  ];
  await db.query(
    `INSERT IGNORE INTO learning_config (config_key, config_value, description) VALUES ?`,
    [seeds]
  );
  await db.execute(`UPDATE learning_config SET config_value='15' WHERE config_key='daily_loss_limit_pct' AND config_value='3'`);
  await db.execute(`UPDATE learning_config SET config_value='20' WHERE config_key='weekly_loss_limit_pct' AND config_value='6'`);
  await db.execute(`UPDATE learning_config SET config_value='25' WHERE config_key='max_drawdown_pct' AND config_value='10'`);
  await db.execute(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS implemented_at DATETIME NULL`).catch(() => {});
  await db.execute(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS implementation_reason TEXT NULL`).catch(() => {});
  await learningChanges.ensureTables();
}

async function getConfig() {
  await ensureLearningTables();
  const [rows] = await db.execute(`SELECT config_key, config_value FROM learning_config`);
  return Object.fromEntries((rows || []).map(row => [row.config_key, row.config_value]));
}

function configNum(config, key, fallback) {
  return num(config[key], fallback);
}

function computeMetrics(rows) {
  const ordered = [...rows].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
  const pnls = ordered.map(row => num(row.pnl_usdt));
  const rValues = ordered.map(row => num(row.r_final));
  const wins = pnls.filter(value => value > 0).length;
  const losses = pnls.length - wins;
  const grossProfit = pnls.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(pnls.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  pnls.forEach(value => {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  });
  const sample = pnls.length;
  return {
    sample,
    wins,
    losses,
    winRate: sample ? (wins / sample) * 100 : 0,
    pnl: pnls.reduce((sum, value) => sum + value, 0),
    expectancy: sample ? pnls.reduce((sum, value) => sum + value, 0) / sample : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 9.99 : 0),
    avgR: sample ? rValues.reduce((sum, value) => sum + value, 0) / sample : 0,
    avgAbsPnl: sample ? pnls.reduce((sum, value) => sum + Math.abs(value), 0) / sample : 0,
    maxDrawdown,
    lastClosedAt: ordered.length ? ordered[ordered.length - 1].closed_at : null
  };
}

function computeWeight(metrics, config) {
  const softMin = configNum(config, 'soft_min_sample', 8);
  const fullSample = Math.max(softMin + 1, configNum(config, 'full_confidence_sample', 40));
  const minWeight = configNum(config, 'min_weight', 0.85);
  const maxWeight = configNum(config, 'max_weight', 1.12);
  if (metrics.sample < softMin) return { weight: 1, confidence: metrics.sample / softMin };

  const scale = Math.max(metrics.avgAbsPnl, 0.25);
  const expectancyTerm = Math.tanh(metrics.expectancy / scale) * 0.12;
  const winRateTerm = ((metrics.winRate / 100) - 0.5) * 0.22;
  const profitFactorTerm = Math.log2(clamp(metrics.profitFactor, 0.25, 4)) * 0.055;
  const rTerm = Math.tanh(metrics.avgR) * 0.07;
  const drawdownBase = Math.max(Math.abs(metrics.pnl) + Math.abs(metrics.maxDrawdown), 1);
  const drawdownTerm = -Math.min(0.08, Math.abs(metrics.maxDrawdown) / drawdownBase * 0.12);
  const rawWeight = 1 + expectancyTerm + winRateTerm + profitFactorTerm + rTerm + drawdownTerm;
  const confidence = clamp((metrics.sample - softMin + 4) / (fullSample - softMin + 4), 0.12, 1);
  return {
    weight: clamp(1 + ((rawWeight - 1) * confidence), minWeight, maxWeight),
    confidence
  };
}

function groupRows(rows, keyFn) {
  const groups = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key || key === 'N/A') return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function recommendationMatches(ruleType, ruleKey, rec) {
  const text = String(rec.recommendation || '').toUpperCase();
  const evidence = jsonValue(rec.evidence, {});
  if (ruleType === 'symbol') {
    const mentions = text.includes(ruleKey) || (evidence.symbols || []).map(String).map(v => v.toUpperCase()).includes(ruleKey);
    const explicitlyAboutSymbol = rec.category === 'symbol' || /EXCLUIR|BLACKLIST|S[IÍ]MBOLO.{0,40}(PROBLEM|P[EÉ]RD)|P[EÉ]RDIDAS? CONCENTRAD|EXPECTANCY.{0,30}NEGAT|WIN RATE|\bWR\b/.test(text);
    return mentions && explicitlyAboutSymbol;
  }
  if (ruleType === 'session') {
    const mentions = text.includes(ruleKey) || (evidence.hours || []).includes(ruleKey);
    return mentions && (rec.category === 'time' || /HORARIO|VENTANA|SESI[OÓ]N|UTC/.test(text));
  }
  if (ruleType === 'setup') {
    const tokens = ruleKey.split(' / ').filter(token => token !== 'N/A');
    return tokens.length >= 2 && tokens.every(token => text.includes(token));
  }
  if (ruleType === 'regime') {
    const setupSpecific = /CONFIRMS|CONTRADICTS|NEUTRAL|BEARISH|BULLISH/.test(text) && /[|/]/.test(text);
    return text.includes(ruleKey) && !setupSpecific;
  }
  if (ruleType === 'score_band') {
    const [start, end = start] = ruleKey.split('-').map(Number);
    return /SCORE|THRESHOLD|UMBRAL/.test(text) &&
      (text.match(/\b\d{2,3}\b/g) || []).map(Number).some(value => value >= start && value <= end);
  }
  return false;
}

function recommendationIntent(ruleType, ruleKey, rec) {
  const text = String(rec.recommendation || '').toUpperCase();
  const token = ruleKey.split(' / ')[0];
  let matchToken = text.includes(ruleKey) ? ruleKey : token;
  if (ruleType === 'score_band') {
    const [start, end = start] = ruleKey.split('-').map(Number);
    matchToken = (text.match(/\b\d{2,3}\b/g) || []).find(value => Number(value) >= start && Number(value) <= end) || matchToken;
  }
  const fragments = text.split(/[.!?]\s+/).filter(fragment => fragment.includes(matchToken));
  const index = Math.max(text.indexOf(matchToken), text.indexOf(token));
  const context = fragments[0] || (index >= 0 ? text.slice(Math.max(0, index - 90), index + matchToken.length + 110) : text);
  const negative = (context.match(/EXCLUIR|BLACKLIST|PROHIBIR|EVITAR|BLOQUEAR|REDUCIR|PENALIZAR|TRAMPA|FALLA|PROBLEM|P[EÉ]RD|NEGATIV|PEOR|RIESGO|-\$?\d/g) || []).length;
  const positive = (context.match(/PRIORIZAR|AUMENTAR|CONCENTRAR|FAVORECER|OPORTUNIDAD|EDGE|RENTABLE|POSITIV|MEJOR|GANADOR|GANAR|FUNCIONA|ORO|\+\$?\d/g) || []).length;
  if (negative > positive) return -1;
  if (positive > negative) return 1;
  if (rec.category === 'risk') return -1;
  if (rec.category === 'opportunity') return 1;
  return 0;
}

function ruleAction(metrics, weight, config) {
  const hardMin = configNum(config, 'hard_min_sample', 20);
  const lastAgeHours = metrics.lastClosedAt ? (Date.now() - new Date(metrics.lastClosedAt).getTime()) / 3600000 : Infinity;
  if (
    metrics.sample >= hardMin &&
    lastAgeHours <= configNum(config, 'hard_block_cooldown_hours', 72) &&
    metrics.expectancy <= configNum(config, 'block_expectancy_max', -0.75) &&
    metrics.profitFactor <= configNum(config, 'block_profit_factor_max', 0.75) &&
    metrics.winRate <= configNum(config, 'block_win_rate_max', 40)
  ) return 'block';
  if (metrics.expectancy >= 0 && metrics.profitFactor >= 1 && weight < 1) return 'neutral';
  if (weight <= 0.98) return 'reduce';
  if (weight >= 1.02) return 'prioritize';
  return 'neutral';
}

function evidenceLevel(sample, config) {
  if (sample >= configNum(config, 'hard_min_sample', 20)) return 'high';
  if (sample >= configNum(config, 'soft_min_sample', 8)) return 'medium';
  return 'low';
}

async function rebuildRules() {
  const config = await getConfig();
  await db.execute(`UPDATE ai_recommendations
    SET impact_score=NULL, outcome=NULL,
        notes='Pendiente de revisión posterior a la implementación real'
    WHERE implementation_status='implementada'
      AND implemented_at IS NOT NULL
      AND (review_date IS NULL OR review_date < implemented_at)`);
  const [tradeRows] = await db.execute(`SELECT
      t.id, t.symbol, t.ai_regime, t.tf4h_status, t.macro_bias, t.setup_label,
      t.final_score, t.opened_at, tc.pnl_usdt, tc.r_final, tc.closed_at
    FROM trades t
    JOIN trade_closes tc ON tc.trade_id=t.id
    ORDER BY tc.closed_at ASC, tc.id ASC`);
  const [recommendations] = await db.execute(`SELECT id, report_id, recommendation, category, confidence,
      evidence, evidence_level, status, outcome, impact_score, implementation_status
    FROM ai_recommendations
    WHERE status <> 'rejected'`);
  const eligibleRecommendations = (recommendations || []).filter(rec =>
    rec.status === 'validated' || ['media', 'alta'].includes(String(rec.evidence_level || '').toLowerCase())
  );
  const [existingRuleRows] = await db.execute(`SELECT * FROM learning_rules`);
  const existingRules = new Map((existingRuleRows || []).map(rule => [`${rule.rule_type}:${rule.rule_key}`, rule]));
  const reversionGuards = await learningChanges.getRuleGuards();

  const dimensions = [
    ['symbol', row => String(row.symbol || '').toUpperCase()],
    ['setup', row => normalizeSetup(row.setup_label, row)],
    ['session', row => hourBucket(row.opened_at)],
    ['regime', row => String(row.ai_regime || 'N/A').toUpperCase()],
    ['score_band', row => scoreBand(row.final_score)],
    ['combination', row => `${String(row.symbol || '').toUpperCase()} :: ${normalizeSetup(row.setup_label, row)} :: ${hourBucket(row.opened_at)}`]
  ];

  const generated = [];
  for (const [ruleType, keyFn] of dimensions) {
    for (const [ruleKey, rows] of groupRows(tradeRows || [], keyFn)) {
      const metrics = computeMetrics(rows);
      const calculated = computeWeight(metrics, config);
      const status = metrics.sample >= configNum(config, 'soft_min_sample', 8) ? 'active' : 'monitoring';
      const matchingCandidates = eligibleRecommendations.filter(rec => recommendationMatches(ruleType, ruleKey, rec));
      const direction = calculated.weight < 0.98 ? -1 : calculated.weight > 1.02 ? 1 : 0;
      const matches = matchingCandidates.filter(rec => direction !== 0 && recommendationIntent(ruleType, ruleKey, rec) === direction);
      const conflicts = matchingCandidates.filter(rec => direction !== 0 && recommendationIntent(ruleType, ruleKey, rec) === -direction);
      const reportCount = new Set(matches.map(rec => rec.report_id).filter(Boolean)).size;
      const researchFactor = reportCount >= 2 ? 1 + direction * Math.min(0.03, reportCount * 0.0075) : 1;
      const positiveReviews = matches.filter(rec => rec.status === 'validated' && rec.outcome === 'positive');
      const avgImpact = positiveReviews.length
        ? positiveReviews.reduce((sum, rec) => sum + num(rec.impact_score), 0) / positiveReviews.length
        : 0;
      const reviewFactor = positiveReviews.length ? 1 + direction * Math.min(0.02, Math.abs(avgImpact) / 100) : 1;
      const action = status === 'active' ? ruleAction(metrics, calculated.weight, config) : 'neutral';
      const ids = matches.map(rec => rec.id);
      const generatedRule = { ruleType, ruleKey, status, action, metrics, ...calculated, researchFactor, reviewFactor, ids, conflictIds: conflicts.map(rec => rec.id) };
      generated.push(learningChanges.applyGuard(generatedRule, reversionGuards.get(`${ruleType}:${ruleKey}`)));
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`UPDATE learning_rules SET status='suspended', action='neutral', rationale='Sin muestra vigente en la última reconstrucción'`);
    const ttlHours = configNum(config, 'rule_ttl_hours', 36);
    for (const rule of generated) {
      const m = rule.metrics;
      const rationale = `${m.sample} cierres; WR ${round(m.winRate, 1)}%; expectancy ${round(m.expectancy, 3)}; PF ${round(m.profitFactor, 3)}; avgR ${round(m.avgR, 3)}; DD ${round(m.maxDrawdown, 2)}.`;
      rule.rationale = rule.guardedByReversion ? `${rationale} Rollback activo: se conserva el último estado estable.` : rationale;
      await connection.execute(`INSERT INTO learning_rules
        (rule_type,rule_key,status,action,weight,research_factor,review_factor,sample_size,wins,losses,win_rate,pnl,expectancy,profit_factor,avg_r,max_drawdown,confidence,evidence_level,source_recommendation_ids,rationale,valid_from,expires_at,last_evaluated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,NOW(),DATE_ADD(NOW(), INTERVAL ? HOUR),NOW())
        ON DUPLICATE KEY UPDATE status=VALUES(status),action=VALUES(action),weight=VALUES(weight),research_factor=VALUES(research_factor),review_factor=VALUES(review_factor),sample_size=VALUES(sample_size),wins=VALUES(wins),losses=VALUES(losses),win_rate=VALUES(win_rate),pnl=VALUES(pnl),expectancy=VALUES(expectancy),profit_factor=VALUES(profit_factor),avg_r=VALUES(avg_r),max_drawdown=VALUES(max_drawdown),confidence=VALUES(confidence),evidence_level=VALUES(evidence_level),source_recommendation_ids=VALUES(source_recommendation_ids),rationale=VALUES(rationale),valid_from=IF(valid_from IS NULL,NOW(),valid_from),expires_at=VALUES(expires_at),last_evaluated_at=NOW()`, [
        rule.ruleType, rule.ruleKey, rule.status, rule.action, round(rule.weight, 6), round(rule.researchFactor, 6), round(rule.reviewFactor, 6),
        m.sample, m.wins, m.losses, round(m.winRate), round(m.pnl, 6), round(m.expectancy, 6), round(m.profitFactor, 6), round(m.avgR, 6), round(m.maxDrawdown, 6),
        round(rule.confidence, 4), evidenceLevel(m.sample, config), JSON.stringify(rule.ids), rule.rationale, ttlHours
      ]);
      const [savedRows] = await connection.execute(`SELECT id FROM learning_rules WHERE rule_type=? AND rule_key=? LIMIT 1`, [rule.ruleType, rule.ruleKey]);
      await learningChanges.recordRuleChange(
        connection,
        existingRules.get(`${rule.ruleType}:${rule.ruleKey}`),
        rule,
        { config, ruleId: savedRows?.[0]?.id, source: 'learning_engine', actor: 'Learning Engine' }
      );
    }

    const generatedKeys = new Set(generated.map(rule => `${rule.ruleType}:${rule.ruleKey}`));
    for (const previous of existingRuleRows || []) {
      if (generatedKeys.has(`${previous.rule_type}:${previous.rule_key}`) || previous.status === 'suspended') continue;
      await learningChanges.recordRuleChange(connection, previous, {
        ruleType: previous.rule_type,
        ruleKey: previous.rule_key,
        status: 'suspended',
        action: 'neutral',
        weight: num(previous.weight, 1),
        researchFactor: num(previous.research_factor, 1),
        reviewFactor: num(previous.review_factor, 1),
        metrics: {
          sample: num(previous.sample_size), wins: num(previous.wins), losses: num(previous.losses),
          winRate: num(previous.win_rate), expectancy: num(previous.expectancy),
          profitFactor: num(previous.profit_factor), maxDrawdown: num(previous.max_drawdown)
        },
        ids: jsonValue(previous.source_recommendation_ids, []),
        rationale: 'La regla quedó suspendida porque ya no existe una muestra vigente en la reconstrucción.'
      }, { config, ruleId: previous.id, source: 'learning_engine', actor: 'Learning Engine' });
    }

    const implemented = new Set(generated
      .filter(rule => rule.status === 'active' && rule.action !== 'neutral')
      .flatMap(rule => rule.ids));
    const contradicted = new Set(generated
      .filter(rule => rule.status === 'active' && rule.action !== 'neutral')
      .flatMap(rule => rule.conflictIds)
      .filter(id => !implemented.has(id)));
    await connection.execute(`UPDATE ai_recommendations
      SET implementation_status='descartada', implementation_reason='Review Engine rechazó la recomendación; no participa en Learning Engine'
      WHERE status='rejected'`);
    await connection.execute(`UPDATE ai_recommendations
      SET implementation_status='en_prueba', implementation_reason='Aún no existe evidencia operativa suficiente o concordante'
      WHERE status<>'rejected'`);
    for (const id of implemented) {
      await connection.execute(`UPDATE ai_recommendations
        SET impact_score=IF(implemented_at IS NULL,NULL,impact_score),
            outcome=IF(implemented_at IS NULL,NULL,outcome),
            notes=IF(implemented_at IS NULL,'Pendiente de revisión posterior a la implementación real',notes),
            implementation_status='implementada', implemented_at=COALESCE(implemented_at,NOW()), implementation_reason='Regla dinámica respaldada por muestra operativa y Research concordante'
        WHERE id=? AND status<>'rejected'`, [id]);
    }
    for (const id of contradicted) {
      await connection.execute(`UPDATE ai_recommendations
        SET implementation_status='descartada', implementation_reason='La evidencia por hora de entrada y cierres reales contradice la dirección propuesta', implemented_at=NULL
        WHERE id=? AND status<>'rejected'`, [id]);
    }
    await connection.execute(`UPDATE ai_recommendations
      SET status='reviewing', outcome=NULL, impact_score=NULL,
          notes='Revalidación pendiente: la revisión histórica ocurrió antes de implementar una regla con muestra suficiente'
      WHERE status='validated' AND implementation_status='en_prueba' AND evidence_level='baja'`);

    const active = generated.filter(rule => rule.status === 'active').length;
    const monitoring = generated.filter(rule => rule.status === 'monitoring').length;
    const [discardedRows] = await connection.execute(`SELECT COUNT(*) AS total FROM ai_recommendations WHERE implementation_status='descartada'`);
    await connection.execute(`INSERT INTO learning_runs
      (rules_active,rules_monitoring,rules_suspended,recommendations_implemented,recommendations_discarded,summary)
      VALUES (?,?,?,?,?,?)`, [
        active,
        monitoring,
        0,
        implemented.size,
        num(discardedRows?.[0]?.total),
        JSON.stringify({ trades: tradeRows.length, generated: generated.length, mode: config.learning_mode || 'observe' })
      ]);
    await connection.commit();
    const review = await learningChanges.reviewChanges().catch(error => ({ error: error.message }));
    return { ok: true, trades: tradeRows.length, generated: generated.length, active, monitoring, implemented: implemented.size, changeReview: review };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function currentLossStreak(rows, predicate = () => true) {
  let streak = 0;
  for (const row of rows) {
    if (!predicate(row)) continue;
    if (num(row.pnl_usdt) < 0) streak += 1;
    else break;
  }
  return streak;
}

function latestMatchingAgeHours(rows, predicate = () => true) {
  const row = rows.find(predicate);
  return row ? (Date.now() - new Date(row.closed_at).getTime()) / 3600000 : Infinity;
}

async function getCapitalStatus(balanceInput, candidate = {}) {
  const config = await getConfig();
  const [rows] = await db.execute(`SELECT t.symbol,t.setup_label,t.ai_regime,t.tf4h_status,t.macro_bias,t.opened_at,
      tc.pnl_usdt,tc.r_final,tc.closed_at
    FROM trade_closes tc JOIN trades t ON t.id=tc.trade_id
    ORDER BY tc.closed_at DESC,tc.id DESC`);
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const dailyPnl = rows.filter(row => new Date(row.closed_at) >= dayStart).reduce((sum, row) => sum + num(row.pnl_usdt), 0);
  const weeklyPnl = rows.filter(row => new Date(row.closed_at).getTime() >= weekStart).reduce((sum, row) => sum + num(row.pnl_usdt), 0);
  const drawdownStart = now - configNum(config, 'drawdown_window_days', 7) * 24 * 60 * 60 * 1000;
  const chronological = rows.filter(row => new Date(row.closed_at).getTime() >= drawdownStart).reverse();
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  chronological.forEach(row => {
    equity += num(row.pnl_usdt);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  });
  const providedBalance = num(balanceInput);
  const balance = providedBalance > 0 ? providedBalance : num(shared.accountState?.balance);
  const dailyPct = balance > 0 ? (dailyPnl / balance) * 100 : 0;
  const weeklyPct = balance > 0 ? (weeklyPnl / balance) * 100 : 0;
  const drawdownPct = balance > 0 ? (maxDrawdown / balance) * 100 : 0;
  const globalStreak = currentLossStreak(rows);
  const setup = normalizeSetup(candidate.setup, candidate);
  const session = candidate.session || hourBucket(candidate.entryTime || new Date());
  const symbolStreak = currentLossStreak(rows, row => String(row.symbol).toUpperCase() === String(candidate.symbol || '').toUpperCase());
  const setupStreak = currentLossStreak(rows, row => normalizeSetup(row.setup_label, row) === setup);
  const sessionStreak = currentLossStreak(rows, row => hourBucket(row.opened_at) === session);
  const streakCooldown = configNum(config, 'loss_streak_cooldown_hours', 24);
  const globalStreakRecent = latestMatchingAgeHours(rows) <= streakCooldown;
  const symbolStreakRecent = latestMatchingAgeHours(rows, row => String(row.symbol).toUpperCase() === String(candidate.symbol || '').toUpperCase()) <= streakCooldown;
  const setupStreakRecent = latestMatchingAgeHours(rows, row => normalizeSetup(row.setup_label, row) === setup) <= streakCooldown;
  const sessionStreakRecent = latestMatchingAgeHours(rows, row => hourBucket(row.opened_at) === session) <= streakCooldown;
  const reasons = [];
  if (balance > 0 && dailyPct <= -configNum(config, 'daily_loss_limit_pct', 15)) reasons.push(`límite diario ${round(dailyPct, 2)}%`);
  if (balance > 0 && weeklyPct <= -configNum(config, 'weekly_loss_limit_pct', 20)) reasons.push(`límite semanal ${round(weeklyPct, 2)}%`);
  if (balance > 0 && drawdownPct <= -configNum(config, 'max_drawdown_pct', 25)) reasons.push(`drawdown ${round(drawdownPct, 2)}%`);
  if (globalStreakRecent && globalStreak >= configNum(config, 'max_consecutive_losses', 4)) reasons.push(`${globalStreak} pérdidas globales consecutivas`);
  const groupLimit = configNum(config, 'max_group_consecutive_losses', 4);
  if (candidate.symbol && symbolStreakRecent && symbolStreak >= groupLimit) reasons.push(`${symbolStreak} pérdidas consecutivas en ${candidate.symbol}`);
  if (candidate.setup && setupStreakRecent && setupStreak >= groupLimit) reasons.push(`${setupStreak} pérdidas consecutivas en setup ${setup}`);
  if (candidate.session && sessionStreakRecent && sessionStreak >= groupLimit) reasons.push(`${sessionStreak} pérdidas consecutivas en sesión ${session}`);
  return {
    halted: reasons.length > 0,
    reasons,
    balance: round(balance, 2),
    dailyPnl: round(dailyPnl, 2),
    dailyPct: round(dailyPct, 3),
    weeklyPnl: round(weeklyPnl, 2),
    weeklyPct: round(weeklyPct, 3),
    maxDrawdown: round(maxDrawdown, 2),
    drawdownPct: round(drawdownPct, 3),
    streaks: { global: globalStreak, symbol: symbolStreak, setup: setupStreak, session: sessionStreak },
    streakCooldownHours: streakCooldown,
    drawdownWindowDays: configNum(config, 'drawdown_window_days', 7)
  };
}

async function getPostTradeFactor(candidate, config) {
  const [rows] = await db.execute(`SELECT p.symbol,p.setup_label,p.ai_regime,p.pnl_usdt,p.r_final,p.created_at AS closed_at,
      t.tf4h_status,t.macro_bias,t.opened_at
    FROM post_trade_analysis p
    LEFT JOIN trades t ON t.id=p.trade_id
    WHERE p.pnl_usdt IS NOT NULL
    ORDER BY p.created_at ASC`);
  const setup = normalizeSetup(candidate.setup, candidate);
  let matches = rows.filter(row => normalizeSetup(row.setup_label, row) === setup);
  if (matches.length < configNum(config, 'soft_min_sample', 8)) {
    matches = rows.filter(row => String(row.ai_regime || '').toUpperCase() === String(candidate.regime || '').toUpperCase());
  }
  const metrics = computeMetrics(matches);
  const calculated = computeWeight(metrics, config);
  return { factor: metrics.sample >= configNum(config, 'soft_min_sample', 8) ? calculated.weight : 1, sample: metrics.sample };
}

async function ensureFreshRules(config) {
  const [rows] = await db.execute(`SELECT MAX(last_evaluated_at) AS last_eval,COUNT(*) AS total FROM learning_rules`);
  const last = rows?.[0]?.last_eval ? new Date(rows[0].last_eval).getTime() : 0;
  const ttl = configNum(config, 'rule_ttl_hours', 36) * 60 * 60 * 1000;
  if (!num(rows?.[0]?.total) || Date.now() - last > ttl) await rebuildRules();
}

async function evaluateDecision(body = {}) {
  const config = await getConfig();
  await ensureFreshRules(config);
  const symbol = String(body.symbol || '').toUpperCase();
  const setup = normalizeSetup(body.setup || body.setupLabel, body);
  const session = body.session || hourBucket(body.entryTime || new Date());
  const regime = String(body.regime || body.aiRegime || 'N/A').toUpperCase();
  const band = scoreBand(body.baseScore ?? body.finalScore);
  const combination = `${symbol} :: ${setup} :: ${session}`;
  const [rules] = await db.execute(`SELECT * FROM learning_rules
    WHERE status='active' AND expires_at>NOW() AND (
      (rule_type='symbol' AND rule_key=?) OR
      (rule_type='setup' AND rule_key=?) OR
      (rule_type='session' AND rule_key=?) OR
      (rule_type='regime' AND rule_key=?) OR
      (rule_type='score_band' AND rule_key=?) OR
      (rule_type='combination' AND rule_key=?)
    )`, [symbol, setup, session, regime, band, combination]);
  const baseScore = clamp(num(body.baseScore ?? body.finalScore), 0, 100);
  const requiredScore = clamp(num(body.requiredScore ?? body.dynamicThreshold, 65), 0, 100);
  const learning = computeLearningBias(rules || [], { symbol, setup, session, regime, band, combination }, config);
  const finalScore = clamp(baseScore + learning.totalDelta, 0, 100);
  const finalFactor = baseScore > 0 ? finalScore / baseScore : 1;
  const capital = body.capitalAlreadyChecked === true
    ? { halted: false, reasons: [], delegatedTo: 'risk_guard' }
    : await getCapitalStatus(body.balance, { symbol, setup, session, regime, entryTime: body.entryTime });
  const incomingAllowed = body.incomingAllowed !== false && body.passAI !== false;
  const mode = config.learning_enabled === '1' ? (config.learning_mode || 'observe') : 'disabled';
  const learningAllows = !capital.halted && !learning.blockers.length && finalScore >= requiredScore;
  const allowed = incomingAllowed && (mode === 'enforce' ? learningAllows : true);
  let reason = 'Learning Engine aprobado';
  if (!incomingAllowed) reason = body.incomingReason || 'La lógica base rechazó la entrada';
  else if (mode !== 'enforce') reason = `Learning Engine en modo ${mode}; decisión sólo registrada`;
  else if (capital.halted) reason = `Protección de capital: ${capital.reasons.join('; ')}`;
  else if (learning.blockers.length) reason = `Bloqueo explícito: ${learning.blockers.map(blocker => `${blocker.component}:${blocker.key} muestra=${blocker.sample}`).join(', ')}`;
  else if (finalScore < requiredScore) reason = `Score final ${round(finalScore, 1)} < threshold ${round(requiredScore, 1)}; margen ${round(finalScore - requiredScore, 1)}; Learning ${learning.totalDelta >= 0 ? '+' : ''}${round(learning.totalDelta, 1)}`;
  const sourceRecommendationIds = [...new Set((rules || []).flatMap(rule => jsonValue(rule.source_recommendation_ids, [])))];
  const action = allowed ? 'ALLOW' : capital.halted ? 'HALT' : 'REJECT';
  const decisionMargin = round(finalScore - requiredScore, 2);
  const scoreTrace = buildDecisionTrace({
    policyVersion: body.policyVersion,
    opportunityCycleId: body.opportunityCycleId,
    symbol,
    direction: body.direction || null,
    technicalScore: baseScore,
    finalScore,
    threshold: requiredScore,
    technicalContributions: body.technicalContributions,
    learningContributions: learning.contributions,
    learningDelta: learning.totalDelta
  });
  const payload = {
    allowed,
    action,
    reason,
    mode,
    baseScore: round(baseScore, 2),
    requiredScore: round(requiredScore, 2),
    finalScore: round(finalScore, 2),
    finalFactor: round(finalFactor, 6),
    scoreDelta: learning.totalDelta,
    decisionMargin,
    scoreTrace,
    primaryReason: allowed ? 'SCORE_AT_OR_ABOVE_THRESHOLD' : capital.halted ? 'CAPITAL_PROTECTION' : learning.blockers.length ? learning.blockers[0].code : !incomingAllowed ? 'BASE_PIPELINE_REJECTED' : 'SCORE_BELOW_THRESHOLD',
    secondaryReasons: learning.contributions.filter(item => item.delta !== 0).map(item => `${item.component}:${item.delta >= 0 ? '+' : ''}${item.delta}`),
    contributions: learning.contributions,
    components: { mode: 'additive', totalDelta: learning.totalDelta, selected: learning.contributions, suppressed: learning.suppressed },
    matchedRules: (rules || []).map(rule => ({
      id: rule.id,
      type: rule.rule_type,
      key: rule.rule_key,
      action: rule.action,
      weight: num(rule.weight),
      sample: rule.sample_size,
      expectancy: num(rule.expectancy),
      evidence: rule.evidence_level
    })),
    capital,
    sourceRecommendationIds,
    context: { symbol, setup, session, regime, scoreBand: band }
  };
  await db.execute(`INSERT INTO learning_decisions
    (symbol,setup_key,session_key,regime_key,score_band,base_score,required_score,final_score,final_factor,allowed,action,reason,components,capital_status,source_recommendation_ids,dry_run)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    symbol || null, setup, session, regime, band, baseScore, requiredScore, finalScore, finalFactor, allowed ? 1 : 0, action, reason,
    JSON.stringify(payload.components), JSON.stringify(capital), JSON.stringify(sourceRecommendationIds), body.dryRun ? 1 : 0
  ]);
  return payload;
}

router.post('/db/learning/rebuild', async (_req, res) => {
  try { res.json(await rebuildRules()); }
  catch (error) { console.error('[Learning] rebuild:', error.message); res.status(500).json({ error: error.message }); }
});

router.post('/api/learning/decision', async (req, res) => {
  try { res.json(await evaluateDecision(req.body || {})); }
  catch (error) { console.error('[Learning] decision:', error.message); res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/capital-status', async (req, res) => {
  try { res.json(await getCapitalStatus(req.query.balance, req.query)); }
  catch (error) { console.error('[Learning] capital:', error.message); res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/rules', async (req, res) => {
  try {
    await ensureLearningTables();
    const status = req.query.status ? String(req.query.status) : null;
    const [rows] = await db.execute(`SELECT * FROM learning_rules ${status ? 'WHERE status=?' : ''}
      ORDER BY FIELD(status,'active','monitoring','suspended'), FIELD(action,'block','reduce','prioritize','neutral','halt'), rule_type, sample_size DESC`, status ? [status] : []);
    res.json({ rules: rows || [] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/decisions', async (req, res) => {
  try {
    await ensureLearningTables();
    const limit = clamp(parseInt(req.query.limit || '50', 10) || 50, 1, 200);
    const [rows] = await db.query(`SELECT * FROM learning_decisions ORDER BY created_at DESC LIMIT ?`, [limit]);
    res.json({ decisions: rows || [] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/changes', async (req, res) => {
  try {
    await learningChanges.bootstrapExistingRules();
    res.json({ changes: await learningChanges.getChanges(req.query || {}) });
  } catch (error) { console.error('[Learning] changes:', error.message); res.status(500).json({ error: error.message }); }
});

router.post('/api/learning/changes', async (req, res) => {
  try { res.json(await learningChanges.registerChange(req.body || {})); }
  catch (error) { console.error('[Learning] register change:', error.message); res.status(400).json({ error: error.message }); }
});

router.get('/api/learning/changes/summary', async (_req, res) => {
  try {
    await learningChanges.bootstrapExistingRules();
    res.json(await learningChanges.getSummary());
  } catch (error) { console.error('[Learning] change summary:', error.message); res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/timeline', async (req, res) => {
  try { res.json({ timeline: await learningChanges.getTimeline(req.query.limit) }); }
  catch (error) { console.error('[Learning] timeline:', error.message); res.status(500).json({ error: error.message }); }
});

router.post('/db/learning/review-changes', async (req, res) => {
  try { res.json(await learningChanges.reviewChanges({ force: req.body?.force === true })); }
  catch (error) { console.error('[Learning] review changes:', error.message); res.status(500).json({ error: error.message }); }
});

router.get('/api/learning/summary', async (_req, res) => {
  try {
    const config = await getConfig();
    await ensureFreshRules(config);
    const [[ruleSummary], [decisionSummary], [latestRun], [recommendationSummary]] = await Promise.all([
      db.execute(`SELECT COUNT(*) AS total,SUM(status='active') AS active,SUM(status='monitoring') AS monitoring,SUM(status='suspended') AS suspended,SUM(status='active' AND action='block') AS blocked,SUM(status='active' AND action='reduce') AS reduced,SUM(status='active' AND action='prioritize') AS prioritized,SUM(status='active' AND created_at>=DATE_SUB(NOW(),INTERVAL 1 DAY)) AS new_active FROM learning_rules`).then(([rows]) => rows),
      db.execute(`SELECT COUNT(*) AS total,SUM(allowed=1) AS allowed,SUM(allowed=0) AS rejected,MAX(created_at) AS last_decision FROM learning_decisions WHERE created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)`).then(([rows]) => rows),
      db.execute(`SELECT * FROM learning_runs ORDER BY created_at DESC LIMIT 1`).then(([rows]) => rows),
      db.execute(`SELECT COUNT(*) AS total,SUM(implementation_status='implementada') AS implemented,SUM(implementation_status='descartada') AS discarded,SUM(implementation_status='en_prueba') AS testing,SUM(CASE WHEN implementation_status='implementada' THEN COALESCE(impact_score,0) ELSE 0 END) AS cumulative_impact FROM ai_recommendations`).then(([rows]) => rows)
    ]);
    const capital = await getCapitalStatus(shared.accountState?.balance, {});
    res.json({
      mode: config.learning_enabled === '1' ? config.learning_mode : 'disabled',
      config: {
        softMinSample: configNum(config, 'soft_min_sample', 8),
        hardMinSample: configNum(config, 'hard_min_sample', 20),
        dailyLossLimitPct: configNum(config, 'daily_loss_limit_pct', 15),
        weeklyLossLimitPct: configNum(config, 'weekly_loss_limit_pct', 20),
        maxDrawdownPct: configNum(config, 'max_drawdown_pct', 25),
        maxConsecutiveLosses: configNum(config, 'max_consecutive_losses', 4)
      },
      rules: ruleSummary || {},
      decisions: decisionSummary || {},
      recommendations: recommendationSummary || {},
      latestRun: latestRun || null,
      capital
    });
  } catch (error) { console.error('[Learning] summary:', error.message); res.status(500).json({ error: error.message }); }
});

module.exports = router;
module.exports.rebuildRules = rebuildRules;
module.exports.evaluateDecision = evaluateDecision;

learningChanges.startReviewLoop();
