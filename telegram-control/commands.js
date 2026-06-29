'use strict';

const fs = require('fs');
const f = require('./format');
const knowledge = require('./knowledge');
const { createCopilot } = require('./copilot');
const { getHealth } = require('./health');
const { recentExecutionErrors, workflowMetadata } = require('./n8n-readonly');

const VIEWER_COMMANDS = new Set([
  'start', 'help', 'status', 'balance', 'positions', 'performance', 'research', 'learning',
  'health', 'logs', 'news', 'ai', 'context', 'trade', 'timeline', 'history', 'changes', 'why', 'evidence',
  'ask', 'guide', 'tutorial', 'menu', 'new', 'explain'
]);
const MODERATOR_COMMANDS = new Set([...VIEWER_COMMANDS, 'simulate', 'simulator', 'scan', 'rebuild-report', 'rebuild_report']);
const ADMIN_COMMANDS = new Set([...MODERATOR_COMMANDS, 'users', 'role', 'enable', 'disable']);

function commandAllowed(role, command) {
  const normalizedRole = String(role || 'viewer').toLowerCase();
  if (normalizedRole === 'admin') return ADMIN_COMMANDS.has(command);
  if (normalizedRole === 'moderator') return MODERATOR_COMMANDS.has(command);
  return VIEWER_COMMANDS.has(command);
}

function field(label, value) {
  return `${f.bold(label)}: ${f.escape(value)}`;
}

function title(icon, value) {
  return `${icon} ${f.bold(value)}`;
}

function statusIcon(ok) {
  return ok ? '🟢' : '🔴';
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(rows, predicate) {
  const values = (rows || []).filter(predicate).map(row => numeric(row.pnl_usdt, NaN)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function compactText(value, limit = 650) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
}

function symbolArg(args) {
  const symbol = String(args?.[0] || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(symbol)) throw new Error('Debes indicar un símbolo válido, por ejemplo BTCUSDT');
  return symbol;
}

function nearestDecision(decisions, symbol, targetDate = null) {
  const candidates = (decisions || []).filter(row => String(row.symbol || '').toUpperCase() === symbol);
  if (!targetDate) return candidates[0] || null;
  const target = new Date(targetDate).getTime();
  return candidates
    .map(row => ({ row, distance: Math.abs(new Date(row.created_at).getTime() - target) }))
    .filter(item => Number.isFinite(item.distance) && item.distance <= 6 * 60 * 60 * 1000)
    .sort((a, b) => a.distance - b.distance)[0]?.row || null;
}

function latestDecisionBySymbol(decisions) {
  const result = {};
  for (const decision of decisions || []) {
    const symbol = String(decision.symbol || '').toUpperCase();
    if (symbol && !result[symbol]) result[symbol] = decision;
  }
  return result;
}

function createCommands(deps) {
  const { config, api, audit, telegram } = deps;
  const copilot = createCopilot(deps);

  async function status() {
    const [state, learning, reportData, health] = await Promise.all([
      api.dashboardState(), api.learningSummary(), api.latestReport(), getHealth(deps)
    ]);
    const account = state.account || {};
    const capital = learning.capital || {};
    const report = reportData.report;
    return [
      title('📊', 'ESTADO ATERUM'),
      '',
      field('Balance', f.money(account.balance)),
      field('Disponible', f.money(account.available)),
      field('PnL diario', `${f.money(capital.dailyPnl, true)} (${f.percent(capital.dailyPct, true)})`),
      field('PnL semanal', `${f.money(capital.weeklyPnl, true)} (${f.percent(capital.weeklyPct, true)})`),
      field('Drawdown', `${f.money(capital.maxDrawdown, true)} (${f.percent(capital.drawdownPct, true)})`),
      field('Capital libre', f.money(account.available)),
      field('Posiciones abiertas', account.openPositions || 0),
      field('Learning', learning.mode || 'N/D'),
      field('Research', report ? 'activo' : 'sin informe'),
      field('Último informe', report ? `${report.report_type || 'report'} / ${f.date(report.created_at || report.report_date)}` : 'N/D'),
      field('Última sincronización', f.date(account.ts)),
      '',
      f.bold('Servicios'),
      ...health.services.map(service => `${statusIcon(service.ok)} ${f.escape(service.name)}${service.ok ? '' : ` · ${f.escape(service.error)}`}`)
    ].join('\n');
  }

  async function balance() {
    const [state, stats] = await Promise.all([api.dashboardState(), api.stats()]);
    const account = state.account || {};
    const realized = numeric(stats.winLoss?.total_pnl);
    const floating = numeric(account.totalUnreal);
    const margin = numeric(account.totalMargin);
    const roi = margin > 0 ? floating / margin * 100 : 0;
    return [
      title('💰', 'BALANCE'), '',
      field('Balance', f.money(account.balance)),
      field('Equity', f.money(account.equity)),
      field('Disponible', f.money(account.available)),
      field('Margen usado', f.money(margin)),
      field('Capital libre', f.money(account.available)),
      field('PnL realizado', f.money(realized, true)),
      field('PnL flotante', f.money(floating, true)),
      field('ROI flotante', f.percent(roi, true)),
      field('Actualizado', f.date(account.ts))
    ].join('\n');
  }

  async function positions() {
    const [state, learningData] = await Promise.all([api.dashboardState(), api.learningDecisions(100)]);
    const positionsMap = state.account?.positions || {};
    const active = state.trades?.active || {};
    const decisions = latestDecisionBySymbol(learningData.decisions);
    const symbols = Object.keys(positionsMap);
    if (!symbols.length) return `${title('📂', 'POSICIONES')}\n\n${f.escape('No existen posiciones abiertas en Binance.')}`;

    const blocks = symbols.map(symbol => {
      const position = positionsMap[symbol] || {};
      const trade = active[symbol] || {};
      const decision = decisions[symbol] || null;
      const components = f.parseJson(decision?.components, {});
      const recommendationIds = f.parseJson(decision?.source_recommendation_ids, []);
      const margin = numeric(position.margin);
      const roi = margin > 0 ? numeric(position.unrealized) / margin * 100 : 0;
      const openedAt = numeric(trade.openedAt) || new Date(trade.opened_at || 0).getTime();
      return [
        `${position.side === 'SHORT' ? '🔴' : '🟢'} ${f.bold(`${symbol} ${position.side || ''}`)}`,
        field('Entrada', f.number(position.entryPrice, 6)),
        field('Precio actual', f.number(position.markPrice, 6)),
        field('PnL', `${f.money(position.unrealized, true)} (${f.percent(roi, true)})`),
        field('SL / TP', `${position.sl || 'N/D'} / ${position.tp || 'N/D'}`),
        field('Trailing', trade.stage || 'LIVE'),
        field('Score', trade.finalScore ?? decision?.base_score ?? 'N/D'),
        field('Research aplicado', recommendationIds.length || numeric(components.research, 1) !== 1 ? 'sí' : 'no'),
        field('Learning aplicado', decision ? `${decision.action} / factor ${decision.final_factor}` : 'sin decisión asociada'),
        field('Tiempo abierta', openedAt > 0 ? f.duration(Date.now() - openedAt) : 'N/D')
      ].join('\n');
    });
    return `${title('📂', 'POSICIONES ABIERTAS')}\n\n${blocks.join('\n\n')}`;
  }

  async function performance() {
    const [summary, stats] = await Promise.all([api.researchSummary(), api.stats()]);
    const today = stats.daily?.[0] || {};
    const currentMonth = new Date().toISOString().slice(0, 7);
    const month = (stats.daily || []).filter(row => String(row.day || '').slice(0, 7) === currentMonth).reduce((sum, row) => sum + numeric(row.pnl), 0);
    const week = numeric(stats.weeklyPnl?.[0]?.pnl);
    const avgTp = average(stats.recent, row => String(row.close_reason || '').toUpperCase().includes('TP'));
    const avgSl = average(stats.recent, row => String(row.close_reason || '').toUpperCase().includes('SL'));
    return [
      title('📈', 'PERFORMANCE'), '',
      field('Win Rate', f.percent(summary.winRate)),
      field('Profit Factor', f.number(summary.profitFactor, 2)),
      field('Expectancy', f.money(summary.expectancy, true)),
      field('Drawdown', f.money(summary.maxDrawdown, true)),
      field('PnL total', f.money(summary.pnl, true)),
      field('Mes', f.money(month, true)),
      field('Semana', f.money(week, true)),
      field('Hoy', f.money(today.pnl, true)),
      field('Trades', summary.closedTrades || 0),
      field('Promedio TP', avgTp == null ? 'Sin muestra' : f.money(avgTp, true)),
      field('Promedio SL', avgSl == null ? 'Sin muestra' : f.money(avgSl, true))
    ].join('\n');
  }

  async function research() {
    const [reportData, perfData, learning, changesData] = await Promise.all([
      api.latestReport(), api.recommendationsPerformance(), api.learningSummary(), api.learningChanges(5)
    ]);
    const report = reportData.report;
    if (!report) return `${title('🧠', 'RESEARCH')}\n\n${f.escape('Todavía no existe un informe persistido.')}`;
    const recommendations = f.parseJson(report.recommendations, []);
    const risks = f.parseJson(report.risks, []);
    const opportunities = f.parseJson(report.opportunities, []);
    const activeChanges = (changesData.changes || []).filter(change => ['monitoring', 'insufficient', 'validated'].includes(change.status));
    return [
      title('🧠', 'RESEARCH'), '',
      field('Fecha', f.date(report.created_at || report.report_date)),
      field('Modelo', report.model || 'N/D'),
      field('Resumen', compactText(report.report)),
      '', f.bold('Cambios activos'), f.list(activeChanges.map(change => `${change.target_key}: ${change.status}`), 4),
      '', f.bold('Recomendaciones'), f.list(recommendations, 4),
      '', f.bold('Riesgos'), f.list(risks, 4),
      '', f.bold('Oportunidades'), f.list(opportunities, 4),
      '', field('Reglas implementadas', learning.recommendations?.implemented || 0),
      field('Pendientes', perfData.summary?.pending || 0)
    ].join('\n');
  }

  async function learning() {
    const [summary, changes] = await Promise.all([api.learningSummary(), api.learningChangesSummary()]);
    return [
      title('🧬', 'LEARNING ENGINE'), '',
      field('Modo', summary.mode || 'N/D'),
      field('Reglas activas', summary.rules?.active || 0),
      field('En observación', summary.rules?.monitoring || 0),
      field('Implementadas', summary.recommendations?.implemented || 0),
      field('Descartadas', summary.recommendations?.discarded || 0),
      field('Pendientes', summary.recommendations?.testing || 0),
      field('Última reconstrucción', f.date(summary.latestRun?.created_at)),
      field('Último aprendizaje', f.date(summary.decisions?.last_decision)),
      field('Impacto acumulado', f.number(changes.cumulativeImpact, 2)),
      field('Cambios validados', changes.validated || 0),
      field('Cambios revertidos', changes.reverted || 0)
    ].join('\n');
  }

  async function health() {
    const result = await getHealth(deps);
    return [
      title(result.ok ? '🟢' : '🟠', 'SALUD DEL SISTEMA'), '',
      ...result.services.map(service => [
        `${statusIcon(service.ok)} ${f.bold(service.name)}`,
        f.escape(service.ok ? `${service.detail || 'OK'} · ${service.ms}ms` : service.error || 'No disponible')
      ].join('\n')),
      '', field('Comprobado', f.date(result.generatedAt))
    ].join('\n\n');
  }

  async function logs() {
    const [events, n8nErrors] = await Promise.all([
      audit.operationalEvents(), recentExecutionErrors(config).catch(() => [])
    ]);
    const lines = [title('⚙️', 'EVENTOS IMPORTANTES')];
    lines.push('', f.bold('n8n'));
    lines.push(n8nErrors.length
      ? n8nErrors.slice(0, 5).map(row => `🔴 ${f.escape(`${row.workflow || 'workflow'} · ${row.status} · ${row.startedAt}`)}`).join('\n')
      : `🟢 ${f.escape('Sin errores recientes almacenados')}`);
    lines.push('', f.bold('Research'));
    lines.push(events.research.length
      ? events.research.map(row => `• ${f.escape(`${row.report_type} · ${row.model || 'modelo N/D'} · ${f.date(row.created_at)}`)}`).join('\n')
      : f.escape('Sin eventos'));
    lines.push('', f.bold('Learning'));
    lines.push(events.learning.length
      ? events.learning.map(row => `• ${f.escape(`${row.run_type} · activas ${row.rules_active} · observando ${row.rules_monitoring} · ${f.date(row.created_at)}`)}`).join('\n')
      : f.escape('Sin eventos'));
    lines.push('', f.bold('Rechazos recientes'));
    lines.push(events.rejections.length
      ? events.rejections.map(row => `• ${f.escape(`${row.symbol} · ${compactText(row.skip_reason, 90)} · ${f.date(row.rejected_at)}`)}`).join('\n')
      : f.escape('Sin eventos'));
    lines.push('', f.escape('Docker se verifica mediante health probes; el socket del daemon no se expone al bot por seguridad.'));
    return lines.join('\n');
  }

  async function news() {
    const intelligence = await api.intelligence();
    const items = intelligence.news || [];
    return [
      title('📰', 'NOTICIAS'), '',
      items.length ? items.slice(0, 5).map(item => [
        `${item.sentiment === 'alcista' ? '🟢' : item.sentiment === 'bajista' ? '🔴' : '⚪'} ${f.bold(compactText(item.title, 120))}`,
        field('Fuente', item.source || 'N/D'),
        field('Impacto', `${item.impact || 'N/D'} / ${item.urgency || 'N/D'}`),
        f.escape(compactText(item.summary, 220))
      ].join('\n')).join('\n\n') : f.escape('El feed no devolvió noticias reales en este momento.'),
      '', field('Actualizado', f.date(intelligence.generatedAt))
    ].join('\n');
  }

  async function context() {
    const intelligence = await api.intelligence();
    return [
      title('🤖', 'AI CONTEXT'), '',
      field('Bias', intelligence.posture?.bias || 'N/D'),
      field('Confianza', intelligence.posture?.confidence || 'N/D'),
      field('Score', intelligence.posture?.score ?? 'N/D'),
      field('Señal', intelligence.signal?.action || 'N/D'),
      field('Riesgo', intelligence.signal?.risk || 'N/D'),
      field('Lectura', compactText(intelligence.signal?.explanation || intelligence.posture?.summary, 700)),
      '', f.bold('Alertas'), f.list((intelligence.alerts || []).map(alert => `${alert.title}: ${alert.detail}`), 4),
      '', field('Generado', f.date(intelligence.generatedAt))
    ].join('\n');
  }

  async function ai() {
    const stats = await audit.aiStats(30);
    const total = numeric(stats.total);
    const local = numeric(stats.local_count) + numeric(stats.knowledge_count);
    const cache = numeric(stats.cache_count);
    const claude = numeric(stats.claude_count);
    const actual = numeric(stats.actual_tokens);
    const saved = numeric(stats.saved_tokens);
    const savingPct = actual + saved > 0 ? saved / (actual + saved) * 100 : 0;
    return [
      title('🤖', 'EFICIENCIA DEL COPILOTO'), '',
      field('Período', '30 días'),
      field('Respuestas totales', total),
      field('Locales', local),
      field('Desde caché', cache),
      field('Con Claude', claude),
      field('Uso local/cache', f.percent(total ? (local + cache) / total * 100 : 0)),
      field('Tokens Claude', actual),
      field('Tokens evitados estimados', saved),
      field('Ahorro aproximado', f.percent(savingPct)),
      field('Tiempo medio', `${Math.round(numeric(stats.avg_duration_ms))} ms`),
      '', f.escape('Los comandos y FAQs se resuelven localmente. Claude sólo recibe contexto resumido cuando la pregunta exige razonamiento transversal.')
    ].join('\n');
  }

  async function ask(args, contextValue) {
    return copilot.answer(args.join(' '), contextValue);
  }

  function start(_args, contextValue = {}) {
    return [
      title('α', 'ATERUM COPILOT'), '',
      field('Rol', contextValue.role || 'viewer'),
      f.escape('Centro de operaciones read-only con respuestas locales y razonamiento asistido sólo cuando hace falta.'), '',
      f.bold('Empieza aquí'),
      f.escape('Usa el menú, escribe /guide o pregunta en privado. En el grupo menciona al bot: @Delcon8n_bot ¿cómo está el rendimiento?'), '',
      f.escape('El Copiloto no ejecuta órdenes ni modifica trading, Research, Learning o n8n.')
    ].join('\n');
  }

  function help(args = [], contextValue = {}) {
    const category = String(args[0] || 'main');
    const sections = {
      monitoring: ['/status', '/balance', '/positions', '/health', '/logs'],
      intelligence: ['/performance', '/research', '/learning', '/news', '/context'],
      evidence: ['/why BTCUSDT', '/history BTCUSDT', '/changes'],
      copilot: ['/ask pregunta', '/ai', '/guide', '/tutorial', '/new'],
      admin: ['/simulate', '/scan', '/rebuild_report', '/users', '/role ID moderator']
    };
    if (sections[category]) return `${title('📖', `AYUDA ${category.toUpperCase()}`)}\n\n${sections[category].map(value => f.code(value)).join('\n')}\n\n${f.escape('Todos los datos proceden de contratos existentes; las funciones permitidas dependen del rol.')}`;
    return `${title('📖', 'AYUDA')}\n\n${field('Rol', contextValue.role || 'viewer')}\n${f.escape('Elige una categoría. /guide explica el recorrido completo y /tutorial muestra ejemplos.')}`;
  }

  function guide(args = []) {
    const step = Math.max(1, Math.min(6, Number(args[0]) || 1));
    const steps = [
      ['Estado', 'Comprueba /status, /balance y /health antes de interpretar una señal.'],
      ['Mercado', 'Consulta /positions, /performance y /news para separar estado de cuenta y contexto.'],
      ['Evidencia', 'Usa /why SYMBOL, /history SYMBOL y el botón Ver Evidencia.'],
      ['Research', 'Research interpreta el histórico; /research muestra el último informe persistido.'],
      ['Learning', 'Learning aplica reglas auditables; /learning y /changes muestran estado e impacto.'],
      ['Copiloto', 'Haz preguntas libres. Las FAQs son locales; Claude sólo entra cuando se requiere síntesis entre fuentes.']
    ];
    return `${title('🧭', `GUÍA ${step}/6 · ${steps[step - 1][0]}`)}\n\n${f.escape(steps[step - 1][1])}`;
  }

  function tutorial() {
    return [title('🎓', 'TUTORIAL'), '', f.bold('Consulta rápida'), f.code('/status'), f.code('/positions'), '',
      f.bold('Explica una decisión'), f.code('/why BTCUSDT'), '', f.bold('Pregunta transversal'),
      f.code('/ask ¿Qué evidencia respalda el último cambio?'), '',
      f.escape('En grupos también puedes escribir @Delcon8n_bot seguido de la pregunta. Las respuestas siempre indican cuando falta evidencia.')].join('\n');
  }

  function whatsNew() {
    let source = '';
    try { source = fs.readFileSync(config.changelogPath, 'utf8'); } catch (_) { return `${title('🆕', 'NOVEDADES')}\n\n${f.escape('El changelog no está disponible en el montaje read-only.')}`; }
    const sections = source.split(/\n(?=## )/).filter(part => part.startsWith('## '));
    const latest = sections.at(-1) || '';
    return `${title('🆕', 'NOVEDADES')}\n\n${f.escape(compactText(latest.replace(/^##\s*/, ''), 2800))}`;
  }

  function explain(args = []) { return knowledge.contextual(String(args[1] || args[0] || 'status'), String(args[0] || 'meaning')); }

  async function latestKnowledgeRef(symbol) {
    const data = await api.knowledgeDecisions(symbol, 1);
    return data.decisions?.[0]?.ref || null;
  }

  function decisionRefArg(args) {
    const value = String(args?.[0] || '').trim().toLowerCase();
    if (!/^(?:\d+|t\d+|r\d+|trade:\d+|rejection:\d+)$/.test(value)) {
      throw new Error('Indica un ID: /trade 50 o /trade rejection:588');
    }
    return value;
  }

  function formatKnowledgeDecision(decision, heading = 'DECISION') {
    const final = decision.finalDecision || {};
    const trade = decision.trade || {};
    const market = decision.marketContext || {};
    return [
      title(final.accepted ? '✅' : '⛔', `${heading} ${decision.symbol}`), '',
      field('Referencia', decision.ref),
      field('Fecha', f.date(decision.eventAt)),
      field('Dirección', decision.direction || 'N/D'),
      field('Decisión', final.action || 'N/D'),
      field('Score', `${final.baseScore ?? 'N/D'} → ${final.finalScore ?? 'N/D'} / threshold ${final.threshold ?? 'N/D'}`),
      field('Learning', decision.learning ? `#${decision.learning.id} ${decision.learning.action} · factor ${decision.learning.final_factor}` : 'sin evidencia'),
      field('Research', decision.research ? `#${decision.research.id} ${decision.research.report_type}` : 'sin evidencia'),
      field('Reglas', decision.learningRules?.length || 0),
      field('Recomendaciones', decision.recommendations?.length || 0),
      field('Imagen', decision.imageAnalysis?.available ? (decision.imageAnalysis.approved ? 'aprobada' : 'no aprobada') : 'sin evidencia'),
      field('Macro', `${market.macroBias || 'N/D'} · Fear ${market.fearGreed ?? 'N/D'} · 4H ${market.tf4hStatus || 'N/D'}`),
      field('Simulator', decision.simulator?.available ? `threshold ${decision.simulator.threshold}` : 'sin snapshot'),
      field('Capital Guard', decision.capitalGuard ? (decision.capitalGuard.halted ? 'halted' : 'permitido') : 'sin evidencia'),
      field('Resultado', trade.closedAt ? `${f.money(trade.pnlUsdt, true)} · ${trade.rFinal ?? 'N/D'}R · ${trade.closeReason}` : (trade.status || 'N/A')),
      field('Razón', compactText(final.reason || 'No persistida', 900)),
      '', f.escape('Fuente: Decision Knowledge Graph. Sin Claude ni OpenAI.')
    ].join('\n');
  }

  async function tradeDecision(args) {
    return formatKnowledgeDecision(await api.knowledgeTrade(decisionRefArg(args)), 'TRADE');
  }

  async function timelineDecision(args) {
    const ref = decisionRefArg(args);
    const data = await api.knowledgeTimeline(ref);
    if (!data.events?.length) return `${title('🕘', `TIMELINE ${ref}`)}\n\n${f.escape('No hay eventos persistidos.')}`;
    return `${title('🕘', `TIMELINE ${data.symbol}`)}\n\n${data.events.map(event => [
      f.bold(f.date(event.at)),
      f.escape(event.title),
      f.escape(compactText(event.detail || event.evidence || '', 420))
    ].join('\n')).join('\n\n')}`;
  }

  async function why(args) {
    const symbol = symbolArg(args);
    const ref = await latestKnowledgeRef(symbol);
    if (!ref) return `${title('🔎', `WHY ${symbol}`)}\n\n${f.escape('No existen decisiones persistidas para este símbolo.')}`;
    return formatKnowledgeDecision(await api.knowledgeTrade(ref), 'WHY');
  }

  async function evidence(args) {
    const symbol = symbolArg(args);
    const ref = await latestKnowledgeRef(symbol);
    if (!ref) return `${title('🧾', `EVIDENCIA ${symbol}`)}\n\n${f.escape('No existen decisiones persistidas.')}`;
    const data = await api.knowledgeEvidence(ref);
    const groups = Object.entries(data.sources || {}).filter(([, items]) => items.length);
    return [title('🧾', `EVIDENCIA ${symbol}`), '', field('Referencia', ref),
      ...groups.flatMap(([name, items]) => [f.bold(name), f.list(items.map(item => `${item.table}#${item.id ?? 'snapshot'}${item.status ? ` · ${item.status}` : ''}`), 8), '']),
      ...(data.missing || []).map(item => `△ ${f.escape(item)}`), '', f.escape('No se consultó IA generativa.')].join('\n');
  }

  async function history(args) {
    if (!args?.[0]) return `${title('🕘', 'HISTORIAL')}\n\n${f.escape('Escribe /history SYMBOL, por ejemplo /history BTCUSDT.')}`;
    const symbol = symbolArg(args);
    const [stats, decisionData] = await Promise.all([api.stats(), api.learningDecisions(200)]);
    const trades = (stats.recent || []).filter(row => String(row.symbol || '').toUpperCase() === symbol).slice(0, 6);
    if (!trades.length) return `${title('🕘', `HISTORY ${symbol}`)}\n\n${f.escape('No existen trades almacenados para este símbolo.')}`;
    const blocks = trades.map(row => {
      const decision = nearestDecision(decisionData.decisions, symbol, row.opened_at);
      const recommendations = f.parseJson(decision?.source_recommendation_ids, []);
      return [
        `${numeric(row.pnl_usdt) > 0 ? '🟢' : numeric(row.pnl_usdt) < 0 ? '🔴' : '⚪'} ${f.bold(`${row.direction || 'N/D'} · ${f.date(row.opened_at)}`)}`,
        field('Resultado', row.status === 'CLOSED' ? `${f.money(row.pnl_usdt, true)} / ${row.r_final ?? 'N/D'}R` : row.status),
        field('Research aplicado', recommendations.length ? `${recommendations.length} recomendación(es)` : 'no registrado'),
        field('Learning aplicado', decision ? `${decision.action} / ${decision.final_factor}` : 'no registrado'),
        field('Score', row.final_score ?? decision?.final_score ?? 'N/D'),
        field('Motivo', compactText(row.entry_reason || row.ai_reasoning || row.close_reason || 'No persistido', 260)),
        field('Tiempo', row.duration_minutes == null ? 'N/D' : `${row.duration_minutes} min`),
        field('Cierre', row.close_reason || 'abierto')
      ].join('\n');
    });
    return `${title('🕘', `HISTORY ${symbol}`)}\n\n${blocks.join('\n\n')}`;
  }

  async function changes() {
    const rows = (await api.knowledgeRules()).rules || [];
    if (!rows.length) return `${title('🧬', 'CHANGES')}\n\n${f.escape('No existen cambios auditados.')}`;
    const blocks = rows.slice(0, 10).map(change => [
      `${change.active ? '🟢' : '🔴'} ${f.bold(change.name)}`,
      field('Fecha', f.date(change.date)), field('Actor', change.actor || 'N/D'),
      field('Por qué', compactText(change.reason || 'Sin razón persistida', 320)),
      field('Trades afectados', change.affectedTrades ?? 'N/D'),
      field('PnL observado', change.profitGenerated == null ? 'N/D' : f.money(change.profitGenerated, true)),
      field('Impacto', change.impactScore == null ? 'sin evidencia' : f.number(change.impactScore, 3)),
      field('Estado', change.status)
    ].join('\n'));
    return `${title('🧬', 'ÚLTIMOS CAMBIOS')}\n\n${blocks.join('\n\n')}`;
  }

  async function simulate() {
    const report = await api.simulatorReport();
    const stats = report.stats || {};
    return [
      title('🧪', 'SIMULACIÓN READ-ONLY'), '',
      field('Generada', f.date(report.generatedAt)),
      field('Señales', stats.total ?? 0),
      field('Abiertas', stats.opened ?? 0),
      field('Rechazadas', stats.rejected ?? 0),
      field('TP / SL', `${stats.tp ?? 0} / ${stats.sl ?? 0}`),
      field('Good Rate', f.percent(stats.goodRate)),
      field('MFE / MAE', `${f.percent(stats.avgMfe)} / ${f.percent(stats.avgMae)}`),
      field('Retorno final promedio', f.percent(stats.avgEnd, true)),
      '', f.escape('La consulta usa el reporte existente y no ejecuta órdenes ni workflows.')
    ].join('\n');
  }

  async function scan() {
    const scans = await audit.latestScans(10);
    if (!scans.length) return `${title('🔭', 'SCAN')}\n\n${f.escape('No existen scans persistidos.')}`;
    return [
      title('🔭', 'ÚLTIMOS SCANS'), '',
      ...scans.map(row => `${numeric(row.pass_ai) ? '🟢' : '🔴'} ${f.bold(row.symbol)} · ${f.escape(`${row.direction || 'N/D'} · score ${row.final_score ?? row.scan_score ?? 'N/D'} · ${compactText(row.skip_reason || 'aceptada', 100)} · ${f.date(row.scanned_at)}`)}`),
      '', f.escape('Lectura de telemetría persistida; no se ejecutó Market Scanner.')
    ].join('\n');
  }

  async function rebuildReport() {
    const [summary, latest, learningSummary] = await Promise.all([api.researchSummary(), api.latestReport(), api.learningSummary()]);
    return [
      title('📑', 'REPORTE RECONSTRUIDO'), '',
      field('Fuente', 'APIs existentes / sin persistencia nueva'),
      field('Win Rate', f.percent(summary.winRate)),
      field('Profit Factor', f.number(summary.profitFactor, 2)),
      field('Expectancy', f.money(summary.expectancy, true)),
      field('PnL', f.money(summary.pnl, true)),
      field('Drawdown', f.money(summary.maxDrawdown, true)),
      field('Reglas activas', learningSummary.rules?.active || 0),
      field('Learning', learningSummary.mode || 'N/D'),
      field('Último Anthropic', latest.report ? `${latest.report.model || 'N/D'} / ${f.date(latest.report.created_at || latest.report.report_date)}` : 'sin informe'),
      '', f.escape('Este comando recompone la vista; no genera ni almacena un nuevo informe Research.')
    ].join('\n');
  }

  async function users() {
    const rows = await audit.listUsers(50);
    return [title('👥', 'USUARIOS TELEGRAM'), '', ...rows.map(row =>
      `${numeric(row.enabled) ? '🟢' : '⚫'} ${f.bold(row.username || row.first_name || row.telegram_id)} · ${f.escape(`${row.role} · ID ${row.telegram_id}`)}`
    )].join('\n');
  }

  async function role(args) {
    const telegramId = String(args?.[0] || '');
    const newRole = String(args?.[1] || '').toLowerCase();
    if (!/^\d+$/.test(telegramId) || !['viewer', 'moderator', 'admin'].includes(newRole)) throw new Error('Uso: /role TELEGRAM_ID viewer|moderator|admin');
    const updated = await audit.setRole(telegramId, newRole);
    return `${title(updated ? '✅' : '⚠️', 'ROL')}\n\n${f.escape(updated ? `Usuario ${telegramId} actualizado a ${newRole}.` : 'Usuario no encontrado.')}`;
  }

  async function enableUser(args, enabled) {
    const telegramId = String(args?.[0] || '');
    if (!/^\d+$/.test(telegramId)) throw new Error(`Uso: /${enabled ? 'enable' : 'disable'} TELEGRAM_ID`);
    const updated = await audit.setEnabled(telegramId, enabled);
    return `${title(updated ? '✅' : '⚠️', enabled ? 'USUARIO HABILITADO' : 'USUARIO DESHABILITADO')}\n\n${f.escape(updated ? `Usuario ${telegramId} actualizado.` : 'Usuario no encontrado.')}`;
  }

  async function simulator() {
    const metadata = await workflowMetadata(config).catch(() => null);
    return [
      title('🧪', 'SIMULATOR'), '',
      field('Modo', 'solo lectura'),
      field('Workflow fuente', metadata?.name || 'N/D'),
      field('Activo', metadata ? (numeric(metadata.active) ? 'sí' : 'no') : 'N/D'),
      field('Ejecuciones históricas', metadata?.executions ?? 'N/D'),
      field('Última evidencia', f.date(metadata?.last_execution)),
      '', f.escape('La Fase 1 no ejecuta ni fuerza simulaciones. Este comando sólo inspecciona metadatos ya almacenados.')
    ].join('\n');
  }

  const handlers = {
    status, balance, positions, performance, research, learning, health, logs, news, ai, context,
    trade: tradeDecision, timeline: timelineDecision, why, evidence, history, changes,
    simulate, simulator, scan, 'rebuild-report': rebuildReport, rebuild_report: rebuildReport,
    users, role, enable: args => enableUser(args, true), disable: args => enableUser(args, false),
    ask, help, start, guide, tutorial, menu: start, new: whatsNew, explain
  };

  async function execute(command, args = [], context = {}) {
    const normalized = String(command || '').replace(/^\//, '').split('@')[0].toLowerCase();
    const handler = handlers[normalized];
    if (!handler) return `${title('ℹ️', 'COMANDO DESCONOCIDO')}\n\n${f.escape('Usa /help o el menú principal.')}`;
    if (!commandAllowed(context.role || 'viewer', normalized)) throw new Error(`Permiso insuficiente para /${normalized}`);
    return handler(args, context);
  }

  return { execute, names: Object.keys(handlers), allowed: commandAllowed };
}

module.exports = { createCommands, commandAllowed, VIEWER_COMMANDS, MODERATOR_COMMANDS, ADMIN_COMMANDS };
