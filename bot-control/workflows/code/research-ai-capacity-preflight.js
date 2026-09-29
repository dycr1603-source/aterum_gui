const _researchAuditType = __ANALYSIS_TYPE__;
const _researchModel = __MODEL__;
const _researchMaxOutputTokens = __MAX_OUTPUT_TOKENS__;
const _researchExecutionId = typeof $execution !== 'undefined' && $execution.id != null
  ? String($execution.id) : `n8n-${Date.now()}`;
const _researchAuditToken = process.env.RESEARCH_AI_AUDIT_TOKEN || '';
const _researchDashboard = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';

async function persistResearchAudit(payload) {
  if (!_researchAuditToken) return false;
  try {
    await this.helpers.httpRequest({ method: 'POST', url: `${_researchDashboard}/api/knowledge/ai-usage`,
      headers: { 'X-Aterum-Workflow-Token': _researchAuditToken }, json: true, timeout: 8000,
      body: { executionId: _researchExecutionId, analysisType: _researchAuditType, model: _researchModel,
        maxOutputTokens: _researchMaxOutputTokens, ...payload } });
    return true;
  } catch (_) {
    console.log(`[ResearchAI:${_researchAuditType}] audit persistence unavailable; no secret or prompt recorded`);
    return false;
  }
}

async function researchCapacityPreflight() {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET || !_researchAuditToken) {
    return { allowed: false, reasonCode: 'PREFLIGHT_CONFIG_MISSING' };
  }
  const crypto = require('crypto');
  const base = 'https://fapi.binance.com';
  let offset = 0;
  let account;
  try {
    const clock = await this.helpers.httpRequest({ method: 'GET', url: `${base}/fapi/v1/time`, json: true, timeout: 8000 });
    if (!Number.isFinite(Number(clock?.serverTime))) throw new Error('invalid clock');
    offset = Number(clock.serverTime) - Date.now();
    const query = `timestamp=${Date.now() + offset}&recvWindow=10000`;
    const signature = crypto.createHmac('sha256', process.env.BINANCE_API_SECRET).update(query).digest('hex');
    const balances = await this.helpers.httpRequest({ method: 'GET', url: `${base}/fapi/v2/balance?${query}&signature=${signature}`,
      headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }, json: true, timeout: 10000 });
    account = (Array.isArray(balances) ? balances : []).find(row => row.asset === 'USDT');
    if (!account) return { allowed: false, reasonCode: 'ACCOUNT_BALANCE_MISSING' };
  } catch (_) {
    return { allowed: false, reasonCode: 'BINANCE_UNAVAILABLE' };
  }

  let capacity;
  try {
    const endpoint = (process.env.EXECUTION_ENGINE_URL || 'http://position_guard:3091/executions').replace(/\/executions\/?$/, '/portfolio-capacity');
    capacity = await this.helpers.httpRequest({ method: 'GET', url: endpoint,
      headers: { Authorization: `Bearer ${_researchAuditToken}` }, json: true, timeout: 12000 });
  } catch (_) {
    return { allowed: false, reasonCode: 'PORTFOLIO_GUARD_UNAVAILABLE' };
  }

  let circuit;
  let capital;
  try {
    [circuit, capital] = await Promise.all([
      this.helpers.httpRequest({ method: 'GET', url: `${_researchDashboard}/cb/status`, json: true, timeout: 8000 }),
      this.helpers.httpRequest({ method: 'GET', url: `${_researchDashboard}/api/learning/capital-status?balance=${encodeURIComponent(account.balance || 0)}`, json: true, timeout: 8000 })
    ]);
  } catch (_) {
    return { allowed: false, reasonCode: 'RISK_GUARD_UNAVAILABLE' };
  }

  const available = Number(account.availableBalance || 0);
  const minimumMargin = Number(capacity.limits?.minimumTradeMargin || 5);
  const metrics = {
    accountEquity: Number(capacity.account?.equity ?? account.balance ?? 0),
    availableMargin: available,
    remainingMargin: Number(capacity.capacity?.remainingMargin ?? 0),
    marginUsagePct: Number(capacity.account?.marginUsagePct ?? 0),
    openRiskPct: Number(capacity.risk?.openRiskPct ?? 0),
    remainingRiskPct: Number(capacity.risk?.remainingRiskPct ?? 0),
    maxRiskPct: Number(capacity.risk?.maximumRiskPct ?? 0),
    maxMarginUsagePct: Number(capacity.limits?.maxMarginUsagePct ?? 0),
    openPositions: Array.isArray(capacity.positions) ? capacity.positions.length : null
  };
  if (circuit?.active) return { allowed: false, reasonCode: 'CIRCUIT_BREAKER_ACTIVE', metrics };
  if (capital?.halted) return { allowed: false, reasonCode: 'CAPITAL_PROTECTION_ACTIVE', metrics };
  if (available < minimumMargin) return { allowed: false, reasonCode: 'AVAILABLE_MARGIN_BELOW_MINIMUM', metrics };
  if (!capacity?.allowed) {
    const reason = String(capacity.primaryReason?.code || 'PORTFOLIO_CAPACITY_FULL').toUpperCase();
    return { allowed: false, reasonCode: /^[A-Z0-9_]{1,64}$/.test(reason) ? reason : 'PORTFOLIO_CAPACITY_FULL', metrics };
  }
  return { allowed: true, metrics };
}

const _researchPreflight = await researchCapacityPreflight.call(this);
if (!_researchPreflight.allowed) {
  const _reasonLabels = {
    PREFLIGHT_CONFIG_MISSING: 'faltan credenciales internas de verificación',
    ACCOUNT_BALANCE_MISSING: 'Binance no devolvió el balance USDT',
    BINANCE_UNAVAILABLE: 'no se pudo verificar el balance en Binance',
    PORTFOLIO_GUARD_UNAVAILABLE: 'no se pudo verificar el riesgo y margen del portafolio',
    RISK_GUARD_UNAVAILABLE: 'no se pudo verificar el circuito y la protección de capital',
    CIRCUIT_BREAKER_ACTIVE: 'el circuit breaker está activo',
    CAPITAL_PROTECTION_ACTIVE: 'la protección de capital está activa',
    AVAILABLE_MARGIN_BELOW_MINIMUM: 'el margen disponible es menor al mínimo de una operación'
  };
  const _reason = _reasonLabels[_researchPreflight.reasonCode] || 'los límites de riesgo o margen no permiten otra operación';
  let _estimatedInputTokensSaved = null;
  try {
    const estimate = await this.helpers.httpRequest({ method: 'GET',
      url: `${_researchDashboard}/api/knowledge/ai-usage/estimate?analysisType=${_researchAuditType}`,
      headers: { 'X-Aterum-Workflow-Token': _researchAuditToken }, json: true, timeout: 5000 });
    _estimatedInputTokensSaved = Number.isFinite(Number(estimate.averageInputTokens)) ? Number(estimate.averageInputTokens) : null;
  } catch (_) { /* input-token estimate remains unknown until enough runs are recorded */ }
  const _auditSaved = await persistResearchAudit.call(this, {
    status: _researchPreflight.reasonCode === 'BINANCE_UNAVAILABLE' || _researchPreflight.reasonCode.endsWith('_UNAVAILABLE') || _researchPreflight.reasonCode === 'PREFLIGHT_CONFIG_MISSING'
      ? 'SKIPPED_UNAVAILABLE' : 'SKIPPED_CAPACITY',
    reasonCode: _researchPreflight.reasonCode,
    estimatedInputTokensSaved: _estimatedInputTokensSaved,
    estimatedOutputTokensSaved: _researchMaxOutputTokens,
    ...(_researchPreflight.metrics || {})
  });
  const _m = _researchPreflight.metrics || {};
  const _line = (label, value, suffix = '') => value == null ? '' : `\n${label}: ${Number(value).toFixed(2)}${suffix}`;
  const _telegramText = `⏸️ ANÁLISIS ${_researchAuditType.toUpperCase()} OMITIDO\n\nMotivo: ${_reason}.\nClaude no fue consultado; tokens consumidos: 0.${_line('Margen libre', _m.availableMargin, ' USDT')}${_line('Capacidad de margen restante', _m.remainingMargin, ' USDT')}${_line('Riesgo abierto', _m.openRiskPct, '%')}${_line('Riesgo restante', _m.remainingRiskPct, '%')}${_line('Límite de riesgo', _m.maxRiskPct, '%')}${_line('Límite de uso de margen', _m.maxMarginUsagePct, '%')}\n\n${_auditSaved ? 'Registro guardado en Knowledge.' : 'No se pudo guardar la auditoría de esta omisión.'}`;
  return [{ json: { text: _telegramText, analysisSkipped: true, reasonCode: _researchPreflight.reasonCode } }];
}
