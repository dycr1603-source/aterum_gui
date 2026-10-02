'use strict';
// Conservative rollout limits, not a fitted or proven profitable strategy.
const policy = Object.freeze({ version: 'entry-quality-v1', maxOpenPositions: 2,
  minVolumeRatio: 0.8, maxTrendExtensionAtr: 2, minConfidence: 0.6,
  minDecisionMargin: 0.2, minNetRewardRisk: 1.2, feeRateFloor: 0.001 });
function screen(d, capacity, entry) {
  const i = d.indicators || {};
  const valid = ['atr','ema21','volRatio'].every(k => typeof i[k] === 'number' && Number.isFinite(i[k]))
    && i.atr > 0 && i.ema21 > 0 && i.volRatio >= 0 && Number.isFinite(entry) && entry > 0;
  const reasons = [];
  if (!valid || !Array.isArray(capacity?.positions)) reasons.push('JEV_QUALITY_DATA_MISSING');
  if (capacity?.positions?.length >= policy.maxOpenPositions) reasons.push('JEV_POSITION_LIMIT');
  if (valid && i.volRatio < policy.minVolumeRatio) reasons.push('JEV_LOW_VOLUME');
  const extension = valid ? (entry - i.ema21) / i.atr : null;
  const blockedSides = valid ? ['LONG','SHORT'].filter(side =>
    extension * (side === 'LONG' ? 1 : -1) > policy.maxTrendExtensionAtr) : ['LONG','SHORT'];
  return { version: policy.version, allowed: reasons.length === 0, reasons, blockedSides,
    metrics: { volumeRatio: i.volRatio ?? null, extensionAtr: extension, openPositions: capacity?.positions?.length ?? null }, policy };
}
function validateSelection(answer, entry, stop, target, feeRate = policy.feeRateFloor) {
  const side = answer.choice;
  const margin = answer.probabilities[side] - Math.max(...Object.entries(answer.probabilities)
    .filter(([k]) => k !== side).map(([,v]) => v));
  const fee = Math.max(policy.feeRateFloor, feeRate);
  const reward = Math.abs(target-entry) - fee*(entry+target);
  const risk = Math.abs(entry-stop) + fee*(entry+stop);
  const netRewardRisk = reward / risk;
  const reasons = [];
  if (answer.confidence < policy.minConfidence || margin < policy.minDecisionMargin) reasons.push('JEV_UNCERTAIN_ENTRY');
  if (!Number.isFinite(netRewardRisk) || netRewardRisk < policy.minNetRewardRisk) reasons.push('JEV_NET_REWARD_RISK');
  return { allowed: reasons.length === 0, reasons, confidence: answer.confidence,
    decisionMargin: margin, netRewardRisk, feeRate: fee };
}
module.exports = { policy, screen, validateSelection };
