const d = $input.first().json;
const verification = d.verificationResult || {};
const position = verification.after?.position;
const requested = verification.requested || {};
const allocation = verification.portfolioAllocation || {};

if (d.success !== true || d.finalStatus !== 'VERIFIED' || verification.verified !== true
  || verification.pipelineVerified !== true || verification.persistenceStatus !== 'VERIFIED'
  || !d.exchangeOrderId || !position) {
  throw new Error(`TRADE_OPENED notification blocked for unverified lifecycle state (${d.finalStatus || 'UNKNOWN'})`);
}

// The two-indicator engine has no synthetic technical score provenance.
if (d.strategyV2 === true) {
  if (d.strategy?.indicators?.length !== 2 || !d.jev?.risk || allocation.allowed !== true) throw new Error('STRATEGY_OPEN_PROVENANCE_MISSING');
  const text = ['✅ ATERUM · BINANCE CONFIRMED', `${d.symbol} ${position.side || d.direction}`,
    `Entry: ${position.entryPrice} · SL: ${requested.stopLoss} · TP: ${requested.takeProfit}`,
    `Leverage: ${d.leverage}x · capital at risk (incl. costs): ${d.jev.risk.riskAtStop} USDT`,
    `Expected net R: ${d.jev.risk.expectedR} · JEV confidence: ${d.jev.confidence}%`,
    ...d.strategy.indicators.map(i => `${i.name}: ${JSON.stringify(i.value)} / ${i.signal}`),
    `Binance order: ${d.exchangeOrderId} · execution: ${d.executionId}`].join('\n');
  return [{json:{...d,text,notificationEventKey:`open:${d.executionId}`,notificationState:'TRADE_OPENED_VERIFIED_STRATEGY'}}];
}

const contributions = Array.isArray(d.contributionTable) ? d.contributionTable : [];
const opportunity = d.opportunityDecision || {};
const universe = d.opportunityUniverse || {};
if (!contributions.length || !Number.isFinite(Number(d.technicalScore))
  || !Number.isFinite(Number(d.finalScore)) || !opportunity.rank || allocation.allowed !== true) {
  throw new Error('TRADE_OPENED notification blocked because verified decision provenance is incomplete');
}

const stop = d.exchangeResponse?.stopOrder?.create || {};
const takeProfit = d.exchangeResponse?.takeProfitOrder?.create || {};
const side = String(d.positionSide || d.side || position.side || '').toUpperCase();
const quantity = Number(position.qty);
const entryPrice = Number(position.entryPrice);
const stopLoss = Number(requested.stopLoss);
const takeProfitPrice = Number(requested.takeProfit);
if (![quantity, entryPrice, stopLoss, takeProfitPrice].every(Number.isFinite)) {
  throw new Error('TRADE_OPENED notification blocked because verified order values are incomplete');
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}
function num(value, decimals = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(decimals) : 'N/A';
}
function signed(value, decimals = 2) {
  const parsed = Number(value) || 0;
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(decimals)}`;
}
function bar(value) {
  const normalized = clamp(value);
  const filled = Math.round(normalized / 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${num(normalized, 1)}`;
}
function clean(value, maximum = 120) {
  return String(value || 'N/A').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function contribution(component) {
  return Number(contributions.find(item => item.component === component)?.value || 0);
}

const excluded = new Set(['trend_4h', 'macro', 'intelligence']);
const coreScore = contributions
  .filter(item => Object.prototype.hasOwnProperty.call(item, 'value') && !excluded.has(item.component))
  .reduce((sum, item) => sum + Number(item.value || 0), 0);
const tf4hScore = contribution('trend_4h');
const macroScore = contribution('macro');
const intelligenceScore = contribution('intelligence');
const after4h = coreScore + tf4hScore;
const afterMacro = after4h + macroScore;
const afterIntelligence = afterMacro + intelligenceScore;
const technicalScore = Number(d.technicalScore);
const finalScore = Number(d.finalScore);
if (Math.abs(clamp(afterIntelligence) - technicalScore) > 0.25) {
  throw new Error(`TRADE_OPENED scoring provenance mismatch (${clamp(afterIntelligence)} != ${technicalScore})`);
}
const learningApplied = finalScore - technicalScore;
const threshold = Number(d.dynamicThreshold || d.learningDecision?.requiredScore || 65);
const sizing = d.sizingInfo || {};
const intelligence = d.marketContext?.intelligenceSignal || {};
const rawIntelligence = Number(side === 'LONG'
  ? intelligence.scoreAdjustment?.ifLong : intelligence.scoreAdjustment?.ifShort) || 0;
const intelligenceIgnored = intelligenceScore === 0 && rawIntelligence !== 0;
const intelligenceState = intelligenceIgnored
  ? `⚪ IGNORED — ${clean(intelligence.confidence)} confidence below scoring gate`
  : intelligenceScore === 0 ? '⚪ NO ADJUSTMENT' : `✅ APPLIED ${signed(intelligenceScore)}`;

const account = allocation.account || {};
const portfolioRisk = allocation.risk || {};
const exposure = allocation.exposure || {};
const capacity = allocation.capacity || {};
const limits = allocation.limits || {};
const verifiedRisk = Math.abs(entryPrice - stopLoss) * quantity;
const verifiedGain = Math.abs(takeProfitPrice - entryPrice) * quantity;
const equity = Number(account.equity || d.balance || 0);
const verifiedRiskPct = equity > 0 ? verifiedRisk / equity * 100 : 0;
const margin = quantity * entryPrice / Math.max(1, Number(d.leverage || 1));
const slDistance = entryPrice > 0 ? Math.abs(entryPrice - stopLoss) / entryPrice * 100 : 0;
const tpDistance = entryPrice > 0 ? Math.abs(takeProfitPrice - entryPrice) / entryPrice * 100 : 0;
const rr = verifiedRisk > 0 ? verifiedGain / verifiedRisk : 0;
const openBefore = Array.isArray(allocation.positions) ? allocation.positions.length : Number(d.openCount || 0);
const rank = Number(opportunity.rank);
const evaluated = Number(universe.candidates || universe.refreshed || 0);
const totalUniverse = Number(universe.total || 0);
const oppositeScore = side === 'LONG' ? Number(opportunity.shortScore || 0) : Number(opportunity.longScore || 0);
const selectedScore = side === 'LONG' ? Number(opportunity.longScore || technicalScore) : Number(opportunity.shortScore || technicalScore);
const separation = Number(opportunity.separation ?? selectedScore - oppositeScore);
const macroMultiplier = Number(sizing.macroSizeMultiplier || 1);
const macroGate = macroMultiplier < 1 ? `⚠ SIZE REDUCED ${num(macroMultiplier, 2)}x` : '✅ PASS';
const ranking = Array.isArray(d.opportunityRanking) ? d.opportunityRanking : [];
const higherRanked = ranking.filter(candidate => Number(candidate.rank) < rank)
  .map(candidate => `${candidate.symbol}:${candidate.primaryReason || candidate.hardBlockers?.[0]?.code || 'ineligible'}`)
  .slice(0, 2).join(', ');
const indicators = d.indicators || {};
const market = d.marketContext || {};
const tf4h = d.tf4h || {};
const leverageCap = tf4h.status === 'CONTRADICTS' ? 4 : 15;
const timestamp = new Date(d.timestamp || Date.now()).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

const jevOwnsStrategy = d.jev?.mode === 'enforce';
const jevLeveragePolicy = d.jev?.leveragePolicy || null;
const directionLabel = side === 'SHORT' ? '🔴 SHORT · busca aprovechar una bajada' : '🟢 LONG · busca aprovechar una subida';
const price = value => Number(value).toLocaleString('es-CR', { maximumFractionDigits: 10 });
const lines = [
  '✅ ORDEN CONFIRMADA POR BINANCE',
  `💎 ${clean(d.symbol)} · ${directionLabel}`,
  `⏰ ${timestamp}`,
  'La apertura, las órdenes de protección y el registro local fueron verificados.',
  '', '━━━ ¿POR QUÉ SE APROBÓ? ━━━',
  jevOwnsStrategy ? `🧠 Jev eligió ${side}. La puntuación técnica es contexto, no la autorización final.`
    : `📊 Puntuación ${num(finalScore)}/100; mínimo requerido ${num(threshold, 0)}.`,
  `🔎 Candidato #${rank} entre ${evaluated} evaluados (${totalUniverse} activos en el universo).`,
  '🛡 La asignación superó los controles de margen, exposición y riesgo.',
  '', '━━━ PRECIOS ━━━',
  `🎯 Entrada confirmada: ${price(entryPrice)} USDT`,
  `🛑 Stop loss (SL): ${price(stopLoss)} USDT · salida para limitar pérdidas (${num(slDistance)}% desde la entrada).`,
  `🏁 Take profit (TP): ${price(takeProfitPrice)} USDT · objetivo de cierre con ganancia (${num(tpDistance)}%).`,
  '', '━━━ POSICIÓN Y RIESGO ━━━',
  `📦 Cantidad: ${price(quantity)} ${clean(d.symbol).replace(/USDT$/, '')}`,
  `💰 Margen estimado: ${num(margin)} USDT · capital usado como garantía.`,
  `⚡ Apalancamiento aplicado: ${d.leverage}× · exposición aproximada ${num(quantity * entryPrice)} USDT.`,
  ...(jevLeveragePolicy ? [
    `🧠 Jev seleccionó: ${jevLeveragePolicy.selectedLeverage}×; opciones permitidas: ${(jevLeveragePolicy.allowedChoices || []).join(', ')}×.`
  ] : []),
  `📉 Pérdida estimada al SL: ${num(verifiedRisk)} USDT (${equity > 0 ? num(verifiedRiskPct) + '% del capital' : 'capital no disponible'}), antes de costes.`,
  `📈 Ganancia estimada al TP: ${num(verifiedGain)} USDT, antes de costes.`,
  `⚖ Por cada 1 USDT arriesgado hasta el SL, el objetivo bruto es ${num(rr)} USDT.`,
  'ℹ Estas cifras no son ganancias garantizadas ni pérdidas máximas: comisiones, financiación y diferencias de ejecución pueden cambiarlas.',
  '', '━━━ CUENTA ANTES DE ABRIR ━━━',
  `👛 Capital: ${num(equity)} USDT · margen disponible: ${num(account.availableMargin)} USDT.`,
  `📂 Posiciones previas: ${openBefore}. Esta apertura fue verificada por separado.`,
  `🛡 Riesgo previo hasta los stops: ${num(portfolioRisk.openRiskPct)}% / límite ${num(portfolioRisk.maximumRiskPct)}%.`,
  `📊 Exposición previa: ${num(exposure.totalPct)}% del capital / límite ${num(limits.maxExposurePct)}%.`,
  '', '━━━ CONTEXTO DEL ANÁLISIS ━━━',
  `📊 Puntuación técnica: ${num(technicalScore)}/100 · ajuste por historial: ${signed(learningApplied)}.`,
  'La puntuación no representa la probabilidad de ganar.',
  `📈 Volumen: ${num(indicators.volRatio)}× el habitual · RSI (impulso del precio): ${num(indicators.rsi14, 1)}.`,
  '', '━━━ COMPROBANTES ━━━',
  `✅ Orden de entrada: ${clean(d.exchangeOrderId)}`,
  `🛑 Orden SL: ${clean(stop.algoId || stop.orderId || 'verificada')}`,
  `🏁 Orden TP: ${clean(takeProfit.algoId || takeProfit.orderId || 'verificada')}`,
  `🆔 Ejecución: ${clean(d.executionId)}`
].filter(line => line !== null);
const text = lines.join('\n');
if (text.length > 4096) throw new Error(`TRADE_OPENED notification exceeds Telegram limit (${text.length})`);
return [{ json: { ...d, notificationEventKey: `open:${d.executionId}`, text, notificationState: 'TRADE_OPENED_VERIFIED_PREMIUM' } }];
