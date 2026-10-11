const previous = $input.first().json;
const slot = Number(previous.strategySlot);
if (previous.strategyV2 !== true || previous.finalStatus !== 'VERIFIED' ||
    previous.verificationResult?.verified !== true ||
    !Number.isInteger(slot) || slot < 1 || slot >= 3) return [];

const base = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
try {
  // The previous Binance order and its local persistence are verified before
  // re-reading capacity. Each slot therefore receives a fresh margin/risk cap.
  const result = await this.helpers.httpRequest({
    method: 'POST', url: `${base}/internal/strategy/cycle`, json: true,
    timeout: 600000,
    headers: { Authorization: `Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}` },
    body: {}
  });
  if (result.strategyV2 !== true) throw new Error('INVALID_STRATEGY_RESPONSE');
  return [{ json: { ...result, strategySlot: slot + 1 } }];
} catch (error) {
  return [{ json: { strategyV2: true, passAI: false, allocationAllowed: false,
    strategySlot: slot + 1, skipReason: error.message } }];
}
