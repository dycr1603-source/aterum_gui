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

const text = [
  '━━━━━━━━━━━━━━━━━━━━━━━',
  '✅ TRADE OPENED',
  '━━━━━━━━━━━━━━━━━━━━━━━',
  `${d.symbol} ${side}`,
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
].join('\n');

return [{ json: { ...d, text, notificationState: 'TRADE_OPENED_VERIFIED' } }];
