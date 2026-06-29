'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { parse: parseFlatted } = require('flatted');
const shared = require('../shared');

const CACHE_TTL_MS = Math.max(5000, Number(process.env.KNOWLEDGE_CACHE_TTL_MS || 30000));
const cache = new Map();

function num(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sessionKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getUTCHours();
  if (hour < 4) return '00-04';
  if (hour < 8) return '04-08';
  if (hour < 12) return '08-12';
  if (hour < 16) return '12-16';
  if (hour < 20) return '16-20';
  return '20-24';
}

function scoreBand(value) {
  const score = num(value);
  if (score == null) return null;
  if (score >= 100) return '100';
  const lower = Math.floor(score / 10) * 10;
  return `${lower}-${lower + 9}`;
}

async function rows(sql, params = []) {
  const [result] = await shared.db.execute(sql, params);
  return result || [];
}

async function cached(key, producer) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const value = await producer();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 300) {
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(entryKey);
  }
  return value;
}

function parseRef(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (/^\d+$/.test(value)) return { kind: 'trade', id: Number(value), ref: `trade:${Number(value)}` };
  let match = value.match(/^(?:trade:|t)(\d+)$/);
  if (match) return { kind: 'trade', id: Number(match[1]), ref: `trade:${Number(match[1])}` };
  match = value.match(/^(?:rejection:|r)(\d+)$/);
  if (match) return { kind: 'rejection', id: Number(match[1]), ref: `rejection:${Number(match[1])}` };
  throw new Error('Decision id invalido. Usa 50, trade:50 o rejection:588');
}

function sqliteTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function n8nExecutionTrace(eventAt) {
  const database = process.env.N8N_SQLITE_DB || '/n8n-data/database.sqlite';
  const target = sqliteTimestamp(eventAt);
  if (!target || !fs.existsSync(database)) return null;
  try {
    const sql = `SELECT e.id,e.status,e.startedAt,e.stoppedAt,ed.data
      FROM execution_entity e JOIN execution_data ed ON ed.executionId=e.id
      JOIN workflow_entity w ON w.id=e.workflowId
      WHERE w.name='Advanced AI Trading Bot v2 - Clean'
        AND e.startedAt BETWEEN datetime('${target}','-10 minutes') AND datetime('${target}','+10 minutes')
      ORDER BY ABS(strftime('%s',e.startedAt)-strftime('%s','${target}')) LIMIT 1`;
    const output = execFileSync('sqlite3', ['-readonly', '-json', database, sql], {
      encoding: 'utf8', timeout: 5000, maxBuffer: 12 * 1024 * 1024
    });
    const execution = JSON.parse(output || '[]')[0];
    if (!execution) return null;
    const data = parseFlatted(execution.data);
    const runData = data?.resultData?.runData || {};
    const nodes = [];
    for (const [name, runs] of Object.entries(runData)) {
      for (const run of runs || []) {
        nodes.push({
          name,
          at: run.startTime ? new Date(run.startTime).toISOString() : iso(execution.startedAt),
          durationMs: num(run.executionTime),
          status: run.error ? 'error' : 'success',
          error: run.error?.message || null
        });
      }
    }
    return {
      id: Number(execution.id), status: execution.status,
      startedAt: iso(`${execution.startedAt}Z`), stoppedAt: iso(`${execution.stoppedAt}Z`), nodes
    };
  } catch (error) {
    return { unavailable: true, reason: error.message };
  }
}

async function getBaseDecision(reference) {
  if (reference.kind === 'trade') {
    const result = await rows(`SELECT t.*,tc.id AS close_id,tc.exit_price,tc.pnl_usdt,tc.pnl_pct,tc.r_final,
        tc.close_reason,tc.trailing_stage,tc.duration_minutes,tc.closed_at
      FROM trades t LEFT JOIN trade_closes tc ON tc.trade_id=t.id WHERE t.id=? LIMIT 1`, [reference.id]);
    if (!result[0]) throw new Error(`Trade ${reference.id} no existe`);
    return { kind: 'trade', ref: reference.ref, eventAt: result[0].opened_at, record: result[0] };
  }
  const result = await rows(`SELECT * FROM trade_rejections WHERE id=? LIMIT 1`, [reference.id]);
  if (!result[0]) throw new Error(`Rejection ${reference.id} no existe`);
  return { kind: 'rejection', ref: reference.ref, eventAt: result[0].rejected_at, record: result[0] };
}

async function nearestContext(base) {
  const record = base.record;
  const eventAt = base.eventAt;
  const [scanRows, decisionRows, reportRows, breakerRows, postRows] = await Promise.all([
    rows(`SELECT * FROM scan_events WHERE symbol=?
      AND scanned_at BETWEEN DATE_SUB(?,INTERVAL 30 MINUTE) AND DATE_ADD(?,INTERVAL 5 MINUTE)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND,scanned_at,?)) LIMIT 1`, [record.symbol, eventAt, eventAt, eventAt]),
    rows(`SELECT * FROM learning_decisions WHERE symbol=?
      AND created_at BETWEEN DATE_SUB(?,INTERVAL 30 MINUTE) AND DATE_ADD(?,INTERVAL 30 MINUTE)
      ORDER BY ABS(TIMESTAMPDIFF(SECOND,created_at,?)) LIMIT 1`, [record.symbol, eventAt, eventAt, eventAt]),
    rows(`SELECT id,report_date,report_type,findings,recommendations,risks,opportunities,score,model,source_workflow,created_at
      FROM research_reports WHERE created_at<=? ORDER BY created_at DESC LIMIT 1`, [eventAt]),
    rows(`SELECT * FROM circuit_breaker WHERE created_at<=? ORDER BY created_at DESC LIMIT 1`, [eventAt]),
    base.kind === 'trade'
      ? rows(`SELECT * FROM post_trade_analysis WHERE trade_id=? OR (trade_id IS NULL AND symbol=? AND created_at>=?)
          ORDER BY (trade_id=? ) DESC,created_at DESC LIMIT 1`, [record.id, record.symbol, eventAt, record.id])
      : Promise.resolve([])
  ]);
  return { scan: scanRows[0] || null, learning: decisionRows[0] || null, report: reportRows[0] || null,
    circuitBreaker: breakerRows[0] || null, postTrade: postRows[0] || null };
}

function ruleKeys(record, learning, eventAt) {
  const setup = learning?.setup_key || record.setup_label || [record.ai_regime, record.tf4h_status, record.macro_bias].filter(Boolean).join(' / ');
  return {
    symbol: record.symbol,
    setup,
    session: learning?.session_key || sessionKey(eventAt),
    regime: learning?.regime_key || record.ai_regime,
    score_band: learning?.score_band || scoreBand(learning?.base_score ?? record.final_score)
  };
}

async function relatedEvidence(base, context) {
  const recommendationIds = [...new Set((json(context.learning?.source_recommendation_ids, []) || []).map(Number).filter(Number.isFinite))];
  const reportId = context.report?.id || null;
  const recommendationWhere = [];
  const recommendationParams = [];
  if (recommendationIds.length) {
    recommendationWhere.push(`ar.id IN (${recommendationIds.map(() => '?').join(',')})`);
    recommendationParams.push(...recommendationIds);
  }
  if (reportId) { recommendationWhere.push('ar.report_id=?'); recommendationParams.push(reportId); }
  const recommendations = recommendationWhere.length
    ? await rows(`SELECT ar.*,rr.report_date,rr.report_type,rr.model FROM ai_recommendations ar
        LEFT JOIN research_reports rr ON rr.id=ar.report_id WHERE (${recommendationWhere.join(' OR ')})
        AND ar.created_at<=? ORDER BY ar.created_at DESC LIMIT 40`, [...recommendationParams, base.eventAt])
    : [];
  const allRecommendationIds = [...new Set(recommendations.map(row => Number(row.id)))];
  const reviews = allRecommendationIds.length
    ? await rows(`SELECT * FROM recommendation_reviews WHERE recommendation_id IN (${allRecommendationIds.map(() => '?').join(',')}) ORDER BY review_date DESC`, allRecommendationIds)
    : [];

  const keys = ruleKeys(base.record, context.learning, base.eventAt);
  const pairs = Object.entries(keys).filter(([, value]) => value != null && value !== '');
  const rules = pairs.length
    ? await rows(`SELECT * FROM learning_rules WHERE (${pairs.map(() => '(rule_type=? AND rule_key=?)').join(' OR ')})
        AND created_at<=? AND (expires_at IS NULL OR expires_at>=?)
        ORDER BY FIELD(status,'active','monitoring','suspended'),confidence DESC`,
        [...pairs.flatMap(([type, value]) => [type, value]), base.eventAt, base.eventAt])
    : [];
  const ruleIds = rules.map(row => Number(row.id));
  const changes = ruleIds.length
    ? await rows(`SELECT * FROM learning_changes WHERE rule_id IN (${ruleIds.map(() => '?').join(',')}) AND implemented_at<=? ORDER BY implemented_at DESC`, [...ruleIds, base.eventAt])
    : [];
  return {
    recommendations: recommendations.map(row => ({
      ...row,
      relation: recommendationIds.includes(Number(row.id)) ? 'learning_source' : 'report_context'
    })),
    reviews, rules, changes, keys
  };
}

function normalizeRecord(base, context, related, execution) {
  const record = base.record;
  const learning = context.learning;
  const accepted = base.kind === 'trade';
  return {
    ref: base.ref,
    kind: base.kind,
    id: Number(record.id),
    symbol: record.symbol,
    direction: record.direction,
    eventAt: iso(base.eventAt),
    finalDecision: {
      accepted,
      action: accepted ? 'OPEN' : (learning?.action || 'REJECT'),
      reason: accepted ? (record.entry_reason || record.ai_reasoning || 'Trade persistido como apertura') : record.skip_reason,
      baseScore: num(learning?.base_score ?? record.scan_score),
      finalScore: num(learning?.final_score ?? record.final_score),
      threshold: num(learning?.required_score ?? record.dynamic_threshold),
      learningFactor: num(learning?.final_factor),
      learningAllowed: learning?.allowed == null ? null : Boolean(learning.allowed)
    },
    trade: accepted ? {
      status: record.status, closeId: num(record.close_id), entryPrice: num(record.entry_price), exitPrice: num(record.exit_price),
      sl: num(record.sl_price), tp: num(record.tp_price), quantity: num(record.qty), leverage: num(record.leverage),
      marketOrderId: record.market_order_id, tpOrderId: record.tp_order_id,
      openedAt: iso(record.opened_at), closedAt: iso(record.closed_at), closeReason: record.close_reason,
      trailingStage: record.trailing_stage, pnlUsdt: num(record.pnl_usdt), pnlPct: num(record.pnl_pct),
      rFinal: num(record.r_final), durationMinutes: num(record.duration_minutes)
    } : null,
    scan: context.scan,
    research: context.report ? { ...context.report, findings: json(context.report.findings, []), recommendations: json(context.report.recommendations, []),
      risks: json(context.report.risks, []), opportunities: json(context.report.opportunities, []) } : null,
    learning: learning ? { ...learning, components: json(learning.components, {}), capital_status: json(learning.capital_status, {}),
      source_recommendation_ids: json(learning.source_recommendation_ids, []) } : null,
    learningRules: related.rules,
    recommendations: related.recommendations.map(row => ({ ...row, evidence: json(row.evidence, row.evidence) })),
    recommendationReviews: related.reviews.map(row => ({ ...row, before_metrics: json(row.before_metrics, {}), after_metrics: json(row.after_metrics, {}) })),
    changes: related.changes.map(row => ({ ...row, evidence: json(row.evidence, row.evidence), source_recommendation_ids: json(row.source_recommendation_ids, []) })),
    marketContext: {
      regime: record.ai_regime || null, bias: record.ai_bias || null, macroBias: record.macro_bias || null,
      fearGreed: num(record.macro_fear_greed), btcChange: num(record.macro_btc_change),
      tf4hTrend: record.tf4h_trend || null, tf4hStatus: record.tf4h_status || null,
      atrPct: num(record.atr_pct), rsi14: num(record.rsi14), volumeRatio: num(record.vol_ratio), fundingRate: num(record.funding_rate)
    },
    imageAnalysis: {
      available: record.vision_state != null || record.vision_reason != null,
      state: record.vision_state || null, approved: record.vision_approved == null ? null : Boolean(record.vision_approved),
      reason: record.vision_reason || null
    },
    simulator: {
      available: record.dynamic_threshold != null || learning?.required_score != null,
      threshold: num(learning?.required_score ?? record.dynamic_threshold),
      note: 'Snapshot persistido; la politica completa historica no fue almacenada.'
    },
    capitalGuard: learning ? json(learning.capital_status, {}) : null,
    circuitBreaker: context.circuitBreaker,
    postTrade: context.postTrade,
    news: { available: false, items: [], reason: 'Las noticias historicas no fueron persistidas para esta decision.' },
    n8nExecution: execution,
    correlation: {
      scan: context.scan ? 'symbol + ventana temporal de 30 minutos' : null,
      learning: learning ? 'symbol + menor distancia temporal dentro de 30 minutos' : null,
      research: context.report ? 'ultimo reporte creado antes de la decision' : null,
      n8n: execution?.id ? 'ejecucion principal mas cercana dentro de 10 minutos' : null
    }
  };
}

async function getTrade(rawRef) {
  const reference = parseRef(rawRef);
  return cached(`trade:${reference.ref}`, async () => {
    const base = await getBaseDecision(reference);
    const [context, execution] = await Promise.all([nearestContext(base), Promise.resolve(n8nExecutionTrace(base.eventAt))]);
    const related = await relatedEvidence(base, context);
    return normalizeRecord(base, context, related, execution);
  });
}

async function listTrades(options = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
  const symbol = String(options.symbol || '').trim().toUpperCase();
  const params = [];
  const tradeWhere = symbol ? 'WHERE t.symbol=?' : '';
  const rejectionWhere = symbol ? 'WHERE r.symbol=?' : '';
  if (symbol) params.push(symbol, symbol);
  const result = await rows(`SELECT * FROM (
      SELECT CONCAT('trade:',t.id) ref,'trade' kind,t.id,t.symbol,t.direction,t.status decision,
        t.final_score score,t.opened_at event_at,tc.pnl_usdt,tc.close_reason outcome
      FROM trades t LEFT JOIN trade_closes tc ON tc.trade_id=t.id ${tradeWhere}
      ORDER BY t.opened_at DESC LIMIT ${limit}
    ) latest_trades
      UNION ALL
    SELECT * FROM (
      SELECT CONCAT('rejection:',r.id) ref,'rejection' kind,r.id,r.symbol,r.direction,'REJECTED' decision,
        r.final_score score,r.rejected_at event_at,NULL pnl_usdt,r.skip_reason outcome
      FROM trade_rejections r ${rejectionWhere}
      ORDER BY r.rejected_at DESC LIMIT ${limit}
    ) latest_rejections
    ORDER BY event_at DESC`, params);
  return { decisions: result.map(row => ({ ...row, event_at: iso(row.event_at), score: num(row.score), pnl_usdt: num(row.pnl_usdt) })) };
}

function timelineFor(decision) {
  const events = [];
  const add = (at, type, title, detail, evidence, status = 'observed') => {
    if (at) events.push({ at: iso(at), type, title, detail, evidence, status });
  };
  add(decision.scan?.scanned_at, 'scan', 'Scanner evaluo el simbolo', `Scan ${decision.scan?.scan_score ?? 'N/D'} · final ${decision.scan?.final_score ?? 'N/D'}`, decision.scan ? `scan_events#${decision.scan.id}` : null);
  for (const node of decision.n8nExecution?.nodes || []) add(node.at, 'n8n', node.name, `${node.status} · ${node.durationMs ?? 0} ms`, `execution#${decision.n8nExecution.id}`, node.status);
  add(decision.learning?.created_at, 'learning', `Learning ${decision.learning?.action}`, decision.learning?.reason, decision.learning ? `learning_decisions#${decision.learning.id}` : null);
  add(decision.eventAt, 'decision', decision.finalDecision.accepted ? 'Decision: abrir trade' : 'Decision: rechazar señal', decision.finalDecision.reason, decision.ref);
  if (decision.trade?.marketOrderId) add(decision.trade.openedAt, 'order', 'Orden MARKET registrada', `orderId ${decision.trade.marketOrderId}`, decision.ref);
  if (decision.trade?.sl) add(decision.trade.openedAt, 'risk', 'Stop Loss inicial', `${decision.trade.sl}`, decision.ref);
  if (decision.trade?.tp) add(decision.trade.openedAt, 'risk', 'Take Profit inicial', `${decision.trade.tp}`, decision.ref);
  if (decision.trade?.closedAt) add(decision.trade.closedAt, 'outcome', `Cierre ${decision.trade.closeReason}`, `PnL ${decision.trade.pnlUsdt ?? 'N/D'} · ${decision.trade.rFinal ?? 'N/D'}R · stage ${decision.trade.trailingStage || 'N/D'}`, `trade_closes#${decision.trade.closeId || decision.id}`);
  add(decision.postTrade?.created_at, 'post_trade', 'Post Trade Analysis', decision.postTrade?.analysis || decision.postTrade?.exit_reason, decision.postTrade ? `post_trade_analysis#${decision.postTrade.id}` : null);
  return events.filter(event => event.at).sort((a, b) => new Date(a.at) - new Date(b.at));
}

async function getTimeline(rawRef) {
  const decision = await getTrade(rawRef);
  return { ref: decision.ref, symbol: decision.symbol, events: timelineFor(decision) };
}

function graphFor(decision) {
  const nodes = [{ id: decision.ref, type: decision.kind, label: `${decision.symbol} ${decision.finalDecision.action}`, data: decision.finalDecision }];
  const edges = [];
  const add = (id, type, label, data, from = decision.ref, relation = 'supported_by') => {
    if (!id) return;
    nodes.push({ id, type, label, data }); edges.push({ from, to: id, relation });
  };
  if (decision.scan) add(`scan:${decision.scan.id}`, 'scan', `Scan #${decision.scan.id}`, decision.scan);
  if (decision.research) add(`report:${decision.research.id}`, 'research', `Research #${decision.research.id}`, decision.research);
  if (decision.learning) add(`learning:${decision.learning.id}`, 'learning', `Learning #${decision.learning.id}`, decision.learning);
  for (const rule of decision.learningRules) add(`rule:${rule.id}`, 'rule', `${rule.rule_type}: ${rule.rule_key}`, rule, decision.learning ? `learning:${decision.learning.id}` : decision.ref, 'matched_rule');
  const sourceRecommendations = decision.recommendations.filter(row => row.relation === 'learning_source');
  const contextRecommendations = decision.recommendations.filter(row => row.relation === 'report_context');
  for (const recommendation of sourceRecommendations) add(
    `recommendation:${recommendation.id}`, 'recommendation', `Recommendation #${recommendation.id}`, recommendation,
    decision.learning ? `learning:${decision.learning.id}` : decision.ref, 'influenced_decision'
  );
  if (contextRecommendations.length) add(
    `report-context:${decision.research?.id || decision.id}`, 'recommendation_context',
    `${contextRecommendations.length} report recommendations`,
    contextRecommendations.map(row => ({ id: row.id, category: row.category, status: row.status })),
    decision.research ? `report:${decision.research.id}` : decision.ref, 'report_context'
  );
  const sourceIds = new Set(sourceRecommendations.map(row => Number(row.id)));
  for (const review of decision.recommendationReviews.filter(row => sourceIds.has(Number(row.recommendation_id)))) {
    add(`review:${review.id}`, 'review', `Review ${review.outcome || review.id}`, review, `recommendation:${review.recommendation_id}`, 'reviewed_by');
  }
  for (const change of decision.changes) add(`change:${change.id}`, 'change', `${change.component}: ${change.status}`, change, change.rule_id ? `rule:${change.rule_id}` : decision.ref, 'implemented_as');
  if (decision.postTrade) add(`post:${decision.postTrade.id}`, 'post_trade', `Post Trade #${decision.postTrade.id}`, decision.postTrade, decision.ref, 'evaluated_by');
  if (decision.trade?.closedAt) add(`outcome:${decision.id}`, 'outcome', `${decision.trade.closeReason} ${decision.trade.pnlUsdt}`, decision.trade, decision.postTrade ? `post:${decision.postTrade.id}` : decision.ref, 'resulted_in');
  return { ref: decision.ref, nodes, edges };
}

async function getGraph(rawRef) { return graphFor(await getTrade(rawRef)); }

const DIFF_FIELDS = [
  ['symbol','Simbolo'],['direction','Direccion'],['finalDecision.action','Decision'],['finalDecision.reason','Razon'],
  ['finalDecision.baseScore','Score base'],['finalDecision.finalScore','Score final'],['finalDecision.threshold','Threshold'],
  ['finalDecision.learningFactor','Factor Learning'],['marketContext.regime','Regimen'],['marketContext.macroBias','Macro'],
  ['marketContext.fearGreed','Fear & Greed'],['marketContext.tf4hStatus','4H'],['marketContext.atrPct','ATR %'],
  ['marketContext.rsi14','RSI'],['marketContext.volumeRatio','Volumen'],['imageAnalysis.approved','Imagen aprobada'],
  ['trade.sl','SL'],['trade.tp','TP'],['trade.trailingStage','Stage final'],['trade.pnlUsdt','PnL'],['trade.rFinal','R final']
];

function atPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }

async function getDiff(leftRef, rightRef) {
  const [left, right] = await Promise.all([getTrade(leftRef), getTrade(rightRef)]);
  const differences = DIFF_FIELDS.map(([path, label]) => ({ path, label, left: atPath(left, path) ?? null, right: atPath(right, path) ?? null }))
    .filter(row => JSON.stringify(row.left) !== JSON.stringify(row.right));
  return { left: { ref: left.ref, symbol: left.symbol }, right: { ref: right.ref, symbol: right.symbol }, differences };
}

async function getRules() {
  return cached('rules', async () => {
    const changes = await rows(`SELECT lc.*,lr.rule_type,lr.rule_key,lr.action,lr.weight,lr.evidence_level,
        lcr.review_status,lcr.verdict,lcr.before_metrics,lcr.after_metrics,lcr.metric_deltas,
        lcr.impact_score,lcr.confidence_pct,lcr.statistically_significant,lcr.reviewed_at
      FROM learning_changes lc
      LEFT JOIN learning_rules lr ON lr.id=lc.rule_id
      LEFT JOIN learning_change_reviews lcr ON lcr.id=(SELECT r.id FROM learning_change_reviews r WHERE r.change_id=lc.id ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1)
      ORDER BY lc.implemented_at DESC,lc.id DESC LIMIT 200`);
    const recommendationIds = [...new Set(changes.flatMap(row => json(row.source_recommendation_ids, []) || []).map(Number).filter(Number.isFinite))];
    const recommendations = recommendationIds.length
      ? await rows(`SELECT ar.id,ar.report_id,ar.recommendation,ar.status,ar.implementation_status,rr.report_date,rr.report_type
          FROM ai_recommendations ar LEFT JOIN research_reports rr ON rr.id=ar.report_id
          WHERE ar.id IN (${recommendationIds.map(() => '?').join(',')})`, recommendationIds)
      : [];
    const byId = Object.fromEntries(recommendations.map(row => [Number(row.id), row]));
    return { rules: changes.map(row => {
      const before = json(row.before_metrics, {}), after = json(row.after_metrics, {}), deltas = json(row.metric_deltas, {});
      const sourceIds = (json(row.source_recommendation_ids, []) || []).map(Number);
      return {
        id: Number(row.id), ruleId: num(row.rule_id), name: row.target_key || `${row.component}/${row.parameter_name}`,
        date: iso(row.implemented_at), actor: row.actor, source: row.source, component: row.component,
        parameter: row.parameter_name, reason: row.human_explanation || row.reason, status: row.status,
        active: !['reverted','revert_required','superseded'].includes(row.status), evidenceLevel: row.evidence_level,
        action: row.action, weight: num(row.weight), affectedTrades: num(after.trades ?? row.validation_sample),
        profitGenerated: num(after.pnl), drawdownReduced: num(deltas.drawdown), impactScore: num(row.impact_score),
        verdict: row.verdict, confidencePct: num(row.confidence_pct), statisticallySignificant: Boolean(row.statistically_significant),
        before, after, deltas, recommendations: sourceIds.map(id => byId[id]).filter(Boolean)
      };
    }) };
  });
}

async function getEvidence(rawRef) {
  const decision = await getTrade(rawRef);
  return {
    ref: decision.ref, symbol: decision.symbol,
    sources: {
      trade: decision.kind === 'trade' ? [{ id: decision.id, table: 'trades' }] : [],
      rejection: decision.kind === 'rejection' ? [{ id: decision.id, table: 'trade_rejections' }] : [],
      scan: decision.scan ? [{ id: decision.scan.id, table: 'scan_events', correlation: decision.correlation.scan }] : [],
      research: decision.research ? [{ id: decision.research.id, table: 'research_reports', createdAt: decision.research.created_at }] : [],
      learning: decision.learning ? [{ id: decision.learning.id, table: 'learning_decisions', correlation: decision.correlation.learning }] : [],
      rules: decision.learningRules.map(row => ({ id: row.id, table: 'learning_rules', type: row.rule_type, key: row.rule_key })),
      recommendations: decision.recommendations.map(row => ({ id: row.id, table: 'ai_recommendations', reportId: row.report_id, status: row.status, relation: row.relation })),
      reviews: decision.recommendationReviews.map(row => ({ id: row.id, table: 'recommendation_reviews', outcome: row.outcome })),
      changes: decision.changes.map(row => ({ id: row.id, table: 'learning_changes', status: row.status })),
      postTrade: decision.postTrade ? [{ id: decision.postTrade.id, table: 'post_trade_analysis' }] : [],
      n8n: decision.n8nExecution?.id ? [{ id: decision.n8nExecution.id, table: 'execution_entity', status: decision.n8nExecution.status }] : [],
      simulator: decision.simulator.available ? [{ table: 'trades/learning_decisions', threshold: decision.simulator.threshold }] : [],
      news: []
    },
    missing: [
      !decision.news.available ? decision.news.reason : null,
      !decision.imageAnalysis.available ? 'Analisis de imagen no persistido para esta decision.' : null,
      !decision.simulator.available ? 'Snapshot de Simulator no persistido para esta decision.' : null
    ].filter(Boolean)
  };
}

module.exports = { parseRef, listTrades, getTrade, getTimeline, getGraph, getDiff, getRules, getEvidence, timelineFor, graphFor, CACHE_TTL_MS };
