'use strict';

// Shared presentation helpers. Requests keep the existing session and API contracts.
window.AterumUI = (() => {
  const escape = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (value, digits = 2) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-CR', { maximumFractionDigits: digits });
  const money = value => value == null || !Number.isFinite(Number(value)) ? '—' : (Number(value) < 0 ? '−' : '+') + '$' + Math.abs(Number(value)).toFixed(2);
  const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('es-CR', { timeZone: 'UTC', hour12: false }) + ' UTC' : '—';
  async function json(url, options = {}) {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: options.signal || AbortSignal.timeout(25000) });
    if (response.status === 401 || response.redirected && new URL(response.url).pathname === '/login') throw new Error('La sesión venció. Inicia sesión de nuevo.');
    if (!response.ok) throw new Error('No se pudieron cargar los datos (HTTP ' + response.status + ').');
    const body = await response.json();
    if (body?.error) throw new Error('La fuente de datos no está disponible. Inténtalo de nuevo.');
    return body;
  }
  const accountFresh = acct => !['loading','unavailable','stale'].includes(acct.status) && Number(acct.snapshotTs || acct.ts) > Date.now()-60000;
  function table(headers, rows, empty = 'Todavía no hay registros en esta fuente.') {
    return '<div class="data-table-scroll" tabindex="0" role="region" aria-label="Tabla de datos"><table class="data-table"><thead><tr>' + headers.map(h => '<th scope="col">' + escape(h) + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '" class="data-empty">' + escape(empty) + '</td></tr>') + '</tbody></table></div>';
  }
  const metric = (label, value, note = '') => '<div class="data-metric"><span>' + escape(label) + '</span><strong>' + escape(value) + '</strong><small>' + escape(note) + '</small></div>';
  const metrics = entries => '<div class="data-metrics">' + entries.map(e => metric(...e)).join('') + '</div>';
  function panel(root, title, description, request, render) {
    let busy = false, queued = false;
    root.innerHTML = '<header class="data-panel-head"><div><h2>' + escape(title) + '</h2><p>' + escape(description) + '</p></div><button type="button" class="data-refresh">Actualizar</button></header><div class="data-status" role="status" aria-live="polite"></div><div class="data-content"></div>';
    const status = root.querySelector('.data-status'), content = root.querySelector('.data-content'), button = root.querySelector('button');
    async function refresh() {
      if (busy) { queued = true; return; }
      busy = true; button.disabled = true; root.setAttribute('aria-busy', 'true');
      status.className = 'data-status'; status.textContent = 'Cargando datos…';
      try {
        const data = await request();
        content.innerHTML = render(data);
        status.textContent = 'Consulta: ' + date(Date.now());
      } catch (error) {
        status.className = 'data-status data-error';
        status.textContent = error.message + (content.innerHTML ? ' Se conserva la última consulta; puede estar desactualizada.' : ' Pulsa Actualizar para reintentar.');
      } finally { busy = false; button.disabled = false; root.setAttribute('aria-busy', 'false'); if (queued) { queued = false; queueMicrotask(refresh); } }
    }
    button.addEventListener('click', refresh);
    refresh();
    return refresh;
  }
  function parse(value, fallback = []) { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch (_) { return fallback; } }
  function boot() {
    document.querySelectorAll('.nav-link.active,.nav-drawer-link.active').forEach(el => el.setAttribute('aria-current', 'page'));
    const main = document.querySelector('main,.page,.layout');
    if (main) { main.id ||= 'mainContent'; main.tabIndex = -1; const skip = document.createElement('a'); skip.className = 'skip-link'; skip.href = '#' + main.id; skip.textContent = 'Saltar al contenido'; document.body.prepend(skip); }
    const opportunities = document.getElementById('opportunitiesPanel');
    if (opportunities) panel(opportunities, 'Oportunidades del mercado', 'Ranking del último ciclo, puntuación y motivos de selección.', () => json('/api/opportunities/latest?limit=10'), data => {
      const cycle = data.cycles?.[0];
      return metrics([['Universo', number(cycle?.universe_size, 0)], ['Elegibles', number(cycle?.eligible_size, 0)], ['Evaluados', number(cycle?.candidate_size, 0)], ['Selección', cycle?.selected_symbol || 'Sin selección', date(cycle?.completed_at)]]) + table(['#', 'Símbolo', 'Dirección', 'Técnico', 'Aprendizaje Δ', 'Final / umbral', 'Estado / motivo', 'Evidencia'], (data.opportunities || []).map(row => [number(row.rank_position, 0), '<a href="/dashboard?symbol=' + encodeURIComponent(row.symbol) + '">' + escape(row.symbol) + '</a>', escape(row.direction), number(row.technical_score), number(row.learning_delta), number(row.final_score) + ' / ' + number(row.threshold), (Number(row.selected) === 1 ? '<span class="data-tag">Seleccionada</span> ' : '') + escape(row.primary_reason), '<details><summary>Ver factores</summary>' + table(['Factor', 'Aporte', 'Evidencia'], parse(row.contributions).map(c => [escape(c.component), number(c.value ?? c.delta), escape(c.evidence)])) + '<p>' + escape(parse(row.blockers).map(b => b.code || b.reason).join(' · ') || 'Sin bloqueos registrados') + '</p></details>']));
    });
    const coverage = document.getElementById('coveragePanel');
    if (coverage) panel(coverage, 'Cobertura del escaneo', 'Frescura de los análisis y símbolos pendientes.', () => json('/api/opportunities/coverage'), data => metrics([['Observados', number(data.summary?.universe_seen, 0)], ['Analizados', number(data.summary?.analyzed, 0)], ['Últimas 3 horas', number(data.summary?.fresh, 0)], ['Último análisis', date(data.summary?.newest_scan)]]) + table(['Símbolo', 'Último análisis', 'Próximo análisis', 'Omisiones consecutivas'], (data.stale || []).map(r => [escape(r.symbol), r.last_deep_scan_at ? date(r.last_deep_scan_at) : 'Sin análisis', date(r.next_scan_at), number(r.consecutive_skips, 0)])));
    const shadow = document.getElementById('shadowPanel');
    if (shadow) panel(shadow, 'Research en observación', 'Compara la decisión de producción con la evaluación shadow guardada.', () => json('/api/research/shadow-summary'), data => metrics([['Evaluaciones', number(data.summary?.evaluations, 0)], ['Decisiones diferentes', number(data.summary?.changed_decisions, 0)], ['Aporte promedio', number(data.summary?.avg_marginal_delta, 4)], ['Última evaluación', date(data.summary?.last_evaluation)]]) + table(['Símbolo', 'Producción', 'Shadow', 'Umbral', 'Δ', 'Producción / shadow', 'Fecha'], (data.recent || []).map(r => [escape(r.symbol), number(r.production_score), number(r.shadow_score), number(r.threshold_score), number(r.marginal_delta), (Number(r.production_allowed) ? 'Permitida' : 'Rechazada') + ' / ' + (Number(r.shadow_allowed) ? 'Permitida' : 'Rechazada'), date(r.created_at)])));
    const policy = document.getElementById('policyPanel');
    if (policy) {
      const refresh = panel(policy, 'Política del simulador', 'Límites y grupos históricos para los parámetros seleccionados. No representa una orden.', () => json('/api/simulator/policy?limit=' + encodeURIComponent(document.getElementById('limitSel').value) + '&hours=' + encodeURIComponent(document.getElementById('hoursSel').value)), data => metrics([['Política', data.key, date(data.reportGeneratedAt)], ['Máx. posiciones para override', number(data.guardrails?.maxOpenCountForOverride, 0)], ['Volumen máximo', number(data.guardrails?.maxVolRatio) + '×'], ['RSI long / short', number(data.guardrails?.maxRsiLong) + ' / ' + number(data.guardrails?.minRsiShort)], ['Estados 4H permitidos', (data.guardrails?.allowTf4hStatuses || []).join(' · ')]]) + table(['Dirección', 'Macro', '4H', 'Muestra', 'Favorables', 'Alivio / tolerancia'], (data.opportunityGroups || []).map(r => [escape(r.direction), escape(r.macroRelation), escape(r.tf4h), number(r.sampleSize, 0), number(r.goodRate) + '%', number(r.reliefPts) + ' / ' + number(r.nearThresholdSlack)]), 'No hay grupos que cumplan los criterios históricos con estos parámetros.'));
      ['limitSel', 'hoursSel'].forEach(id => document.getElementById(id).addEventListener('change', refresh));
    }
  }
  document.addEventListener('DOMContentLoaded', boot);
  return { escape, number, money, date, json, table, metrics, panel, accountFresh };
})();
