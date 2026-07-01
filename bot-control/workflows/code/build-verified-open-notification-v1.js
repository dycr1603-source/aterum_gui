const d = $input.first().json;
const verification = d.verificationResult || {};
const position = verification.after?.position;
const requested = verification.requested || {};

if (d.success !== true || d.finalStatus !== 'VERIFIED' || verification.verified !== true
  || verification.pipelineVerified !== true || verification.persistenceStatus !== 'VERIFIED'
  || !d.exchangeOrderId || !position) {
  throw new Error(`TRADE_OPENED notification blocked for unverified lifecycle state (${d.finalStatus || 'UNKNOWN'})`);
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

const contributions = Array.isArray(d.contributionTable) ? d.contributionTable : [];
const contribution = component => Number(contributions.find(item => item.component === component)?.value || 0);
const signed = value => `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}`;
const technicalScore = Number(d.technicalScore ?? d.score ?? 0);
const learningDelta = Number(d.learningDecision?.scoreDelta ?? d.opportunityDecision?.learningDelta ?? 0);
const finalScore = Number(d.finalScore);
const rank = Number(d.opportunityDecision?.rank || d.rank || 0);
const universe = d.opportunityUniverse || {};
const tf4hScore = contribution('trend_4h');
const macroScore = contribution('macro');
const intelligenceScore = contribution('intelligence');
const intelligence = d.marketContext?.intelligenceSignal || {};
const rawIntelligence = Number(side === 'LONG'
  ? intelligence.scoreAdjustment?.ifLong : intelligence.scoreAdjustment?.ifShort) || 0;
const intelligenceReason = intelligenceScore === 0 && rawIntelligence !== 0
  ? `ignored: ${String(intelligence.confidence || 'unknown')} confidence does not meet the scoring gate`
  : 'applied to technical score';
const sizing = d.sizingInfo || {};

const text = [
  '━━━━━━━━━━━━━━━━━━━━━━━',
  '✅ TRADE OPENED',
  '━━━━━━━━━━━━━━━━━━━━━━━',
  `${d.symbol} ${side}`,
  '',
  'Decision:',
  rank > 0 ? `Portfolio Rank: #${rank} of ${Number(universe.candidates || universe.refreshed || 0)} evaluated (${Number(universe.total || 0)} universe)` : null,
  `Technical Score: ${technicalScore.toFixed(2)}/100`,
  `Learning Adjustment: ${signed(learningDelta)}`,
  `Final Decision Score: ${finalScore.toFixed(2)}/100`,
  `4H ${d.tf4h?.status || 'N/A'}: score ${signed(tf4hScore)}, size ${Number(sizing.tf4hMultiplier || 1).toFixed(2)}x`,
  `Intelligence ${intelligence.signal || 'N/A'} (${intelligence.confidence || 'N/A'}): score ${signed(intelligenceScore)} — ${intelligenceReason}`,
  `Macro ${d.marketContext?.market_bias || 'N/A'}: score ${signed(macroScore)}, size ${Number(sizing.macroSizeMultiplier || 1).toFixed(2)}x`,
  `Regime ${sizing.regime || d.aiResult?.regime || 'N/A'}: size ${Number(sizing.regimeMultiplier || 1).toFixed(2)}x`,
  `Score Sizing Multiplier: ${Number(sizing.scoreMultiplier || 1).toFixed(2)}x`,
  '',
  'Execution: VERIFIED',
  'Binance: CONFIRMED',
  'Persistence: VERIFIED',
  `Execution ID: ${d.executionId}`,
  '',
  `Entry: ${entryPrice}`,
  `Quantity: ${quantity}`,
  `Stop Loss: ${stopLoss}`,
  `Take Profit: ${takeProfitPrice}`,
  '',
  `Market Order ID: ${d.exchangeOrderId}`,
  `Stop Order ID: ${stop.algoId || stop.orderId || 'VERIFIED'}`,
  `Take Profit Order ID: ${takeProfit.algoId || takeProfit.orderId || 'VERIFIED'}`,
  '━━━━━━━━━━━━━━━━━━━━━━━'
].filter(line => line !== null).join('\n');

return [{ json: { ...d, text, notificationState: 'TRADE_OPENED_VERIFIED' } }];
