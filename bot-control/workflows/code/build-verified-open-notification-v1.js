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

const lines = [
  '━━━━━━━━━━━━━━━━━━━━━━━',
  '✅ TRADE ABIERTO',
  '━━━━━━━━━━━━━━━━━━━━━━━',
  `💎 ${d.symbol}   ${side === 'SHORT' ? '🔴 SHORT' : '🟢 LONG'}   ⚡ ${d.leverage}x`,
  `⏰ ${timestamp}`,
  '',
  '━━━ ¿POR QUÉ SE APROBÓ? ━━━',
  `✔ Ranking #${rank} de ${evaluated} evaluados (${totalUniverse} universo)`,
  `✔ Score final ${num(finalScore, 2)}/100 · umbral ${num(threshold, 0)}`,
  `✔ 4H ${tf4h.status || 'N/A'} ${side}`,
  '✔ Portfolio, correlación y riesgo disponibles',
  '✔ Binance + persistencia verificados',
  higherRanked ? `ℹ Superiores descartados: ${clean(higherRanked, 150)}` : '✔ Mayor oportunidad elegible',
  '',
  '━━━ PIPELINE DE DECISIÓN ━━━',
  `Universo       ✅ PASS  ${totalUniverse} activos`,
  `↓ Ranking      ✅ PASS  #${rank}`,
  `↓ Portfolio    ✅ PASS  riesgo restante ${num(portfolioRisk.remainingRiskPct)}%`,
  '↓ Correlación  ✅ PASS  sin blocker',
  `↓ Macro        ${macroGate}`,
  `↓ Intelligence ${intelligenceState}`,
  '↓ AI Score     ⚪ NOT USED',
  `↓ Learning     ${learningApplied === 0 ? '⚪ NO ADJUSTMENT' : `✅ ${signed(learningApplied)}`}`,
  '↓ Ejecución    ✅ VERIFIED',
  '↓ Persistencia ✅ VERIFIED',
  '',
  '━━━ PUNTUACIÓN REAL ━━━',
  'Core técnico · 1H + calidad de mercado',
  bar(coreScore),
  `↓ 4H ${tf4h.status || 'N/A'}  ${signed(tf4hScore)}`,
  bar(after4h),
  `↓ Macro ${market.market_bias || 'N/A'}  ${signed(macroScore)}`,
  bar(afterMacro),
  intelligenceIgnored
    ? `↓ Intelligence ${intelligence.signal || 'N/A'} · IGNORADO (${intelligence.confidence || 'N/A'})`
    : `↓ Intelligence ${intelligence.signal || 'N/A'}  ${signed(intelligenceScore)}`,
  bar(afterIntelligence),
  `Technical Composite  ${num(technicalScore, 2)}/100`,
  `↓ Learning aplicado  ${signed(learningApplied)}`,
  '───────────────────────',
  'FINAL SCORE',
  bar(finalScore),
  '',
  '━━━ PRECIOS ━━━',
  `🎯 Entry  $${num(entryPrice, entryPrice >= 100 ? 2 : 4)}`,
  `🛑 SL     $${num(stopLoss, stopLoss >= 100 ? 2 : 4)}  (${num(slDistance)}%)`,
  `🏁 TP     $${num(takeProfitPrice, takeProfitPrice >= 100 ? 2 : 4)}  (${num(tpDistance)}%)`,
  `⚖ R:R    1:${num(rr, 2)}`,
  '',
  '━━━ POSICIÓN Y RIESGO ━━━',
  `Cantidad        ${num(quantity, 6)} ${(d.symbol || '').replace('USDT', '')}`,
  `Margen          $${num(margin)} · leverage ${d.leverage}x`,
  `Riesgo real     $${num(verifiedRisk)} (${num(verifiedRiskPct)}%)`,
  `Max loss/gain   -$${num(verifiedRisk)} / +$${num(verifiedGain)}`,
  `Sizing          score ${num(sizing.scoreMultiplier || 1)}x · 4H ${num(sizing.tf4hMultiplier || 1)}x · macro ${num(macroMultiplier)}x · régimen ${num(sizing.regimeMultiplier || 1)}x`,
  `Target/final    ${sizing.effectiveRisk || 'N/A'} / ${sizing.actualRisk || num(verifiedRiskPct) + '%'}`,
  '',
  '━━━ CUENTA · PREFLIGHT REAL ━━━',
  `Equity          $${num(equity)} · disponible $${num(account.availableMargin)}`,
  `Margen usado    $${num(account.marginUsed)} (${num(account.marginUsagePct)}%)`,
  `Posiciones      ${openBefore} antes · ${openBefore + 1} verificadas ahora`,
  `Riesgo usado    ${num(portfolioRisk.openRiskPct)}% / máx ${num(portfolioRisk.maximumRiskPct)}%`,
  `Capacidad       riesgo ${num(portfolioRisk.remainingRiskPct)}% · margen $${num(capacity.remainingMargin)}`,
  `Exposición      ${num(exposure.totalPct)}% / máx ${num(limits.maxExposurePct)}%`,
  '',
  '━━━ ÓRDENES VERIFICADAS ━━━',
  `MARKET        ✅ ${d.exchangeOrderId}`,
  `STOP LOSS     ✅ ${stop.algoId || stop.orderId || 'VERIFIED'}`,
  `TAKE PROFIT   ✅ ${takeProfit.algoId || takeProfit.orderId || 'VERIFIED'}`,
  `Execution ID  ${d.executionId}`,
  '',
  '━━━ INTELLIGENCE ━━━',
  `Señal          ${intelligence.signal || 'N/A'} · confianza ${intelligence.confidence || 'N/A'}`,
  `Contribución   ${intelligenceIgnored ? 'IGNORED' : intelligenceScore === 0 ? 'NO ADJUSTMENT' : signed(intelligenceScore)}`,
  intelligenceIgnored ? 'Motivo          Confianza bajo el umbral de scoring' : `Sesgo           ${intelligence.bias || 'N/A'}`,
  '',
  '━━━ AI CONTEXT ━━━',
  'Score AI       NOT USED · ajuste deshabilitado',
  `Régimen        ${sizing.regime || d.aiResult?.regime || 'N/A'} · sizing ${num(sizing.regimeMultiplier || 1)}x`,
  `Leverage       ${d.leverage}x aplicado · cap 4H ${leverageCap}x`,
  '',
  '━━━ MACRO Y 4H ━━━',
  `Macro          ${market.market_bias || 'N/A'} · score ${signed(macroScore)} · size ${num(macroMultiplier)}x`,
  `Fear & Greed   ${market.fearGreed?.value ?? 'N/A'} (${market.fearGreed?.classification || 'N/A'})`,
  `BTC / ETH      ${num(market.btcChange)}% / ${num(market.ethChange)}%`,
  `4H             ${tf4h.trend || 'N/A'} · ${tf4h.status || 'N/A'} · RSI ${num(tf4h.rsi, 1)}`,
  '',
  '━━━ INDICADORES ━━━',
  `RSI14          ${num(indicators.rsi14, 1)} · ATR ${num(indicators.atr, 6)} (${num(indicators.atrPct)}%)`,
  `EMA 8/21/50    ${num(indicators.ema8, 4)} / ${num(indicators.ema21, 4)} / ${num(indicators.ema50, 4)}`,
  `VWAP           ${num(indicators.vwap, 4)} · Vol ${num(indicators.volRatio)}x`,
  `Funding        ${num(Number(indicators.fundingRate || 0) * 100, 4)}% · OI $${num(indicators.currentOI, 0)}`,
  '',
  '━━━ EXPLICACIÓN ━━━',
  `Dirección      ${side} ganó por ${num(separation, 2)} puntos`,
  `Tamaño         riesgo ${sizing.actualRisk || num(verifiedRiskPct) + '%'} tras multiplicadores y límites`,
  `Momento        score > umbral, 4H ${tf4h.status || 'N/A'}, macro ${market.market_bias || 'N/A'}`,
  `Selección      ${rank === 1 ? 'mayor candidato elegible' : `#${rank}; candidatos superiores bloqueados`}`,
  '━━━━━━━━━━━━━━━━━━━━━━━'
].filter(line => line !== null);

const text = lines.join('\n');
if (text.length > 4096) throw new Error(`Premium TRADE_OPENED notification exceeds Telegram limit (${text.length})`);
return [{ json: { ...d, text, notificationState: 'TRADE_OPENED_VERIFIED_PREMIUM' } }];
