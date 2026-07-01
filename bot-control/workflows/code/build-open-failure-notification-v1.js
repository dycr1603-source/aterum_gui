const d = $input.first().json;
if (d.failureNotificationSent) return [{ json: { ...d, telegramText: null } }];

const capacity = d.portfolioCapacity || d.verificationResult?.error?.responseBody || {};
const rejection = d.rejectionReason || capacity.primaryReason || {};
const rejected = d.finalStatus === 'REJECTED' || d.status === 'PORTFOLIO_CAPACITY_REJECTED'
  || d.failureCategory === 'EXECUTION_REJECTED';
let telegramText;

if (rejected) {
  const code = String(rejection.code || 'PORTFOLIO_CAPACITY_REJECTED');
  const label = code.toLowerCase().split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  const direction = String(rejection.direction || d.positionSide || d.side || '').toUpperCase();
  const currentPct = Number(rejection.current || 0);
  const maximumPct = Number(rejection.maximum || 0);
  const equity = Number(capacity.account?.equity || 0);
  const current = equity > 0 ? equity * currentPct / 100 : currentPct;
  const maximum = equity > 0 ? equity * maximumPct / 100 : maximumPct;
  telegramText = ['❌ TRADE REJECTED', d.symbol || 'UNKNOWN', '', `Reason: ${label}`,
    direction ? `Current ${direction} Exposure: ${current.toFixed(2)} USDT (${currentPct.toFixed(2)}% equity)` : null,
    maximum > 0 ? `Maximum Allowed: ${maximum.toFixed(2)} USDT (${maximumPct.toFixed(2)}% equity)` : null,
    maximum > 0 ? `Remaining Capacity: ${Math.max(0, maximum - current).toFixed(2)} USDT` : null,
    `Execution ID: ${d.executionId || 'not-created'}`, 'No Binance order was created.',
    'Verification and persistence were not started.', 'This is an expected risk protection.']
    .filter(Boolean).join('\n');
} else if (d.failureCategory === 'PERSISTENCE_FAILURE' || d.verificationResult?.exchangeVerified === true) {
  telegramText = ['🚨 PERSISTENCE FAILED', `OPEN POSITION ${d.symbol || 'UNKNOWN'}`,
    `Execution ID: ${d.executionId || 'not-created'}`, 'Binance execution and verification succeeded.',
    'Local persistence failed. No TRADE OPENED notification was sent.',
    `Error: ${String(d.error || 'unknown').slice(0, 500)}`].join('\n');
} else if (d.failureCategory === 'VERIFICATION_FAILURE') {
  telegramText = ['⚠ VERIFICATION FAILED', `OPEN POSITION ${d.symbol || 'UNKNOWN'}`,
    `Execution ID: ${d.executionId || 'not-created'}`, 'Execution may have occurred, but Binance read-back did not confirm it.',
    'No persistence or TRADE OPENED notification occurred.',
    `Error: ${String(d.error || 'unknown').slice(0, 500)}`].join('\n');
} else {
  telegramText = ['🚨 EXECUTION FAILED', `OPEN POSITION ${d.symbol || 'UNKNOWN'}`,
    `Execution ID: ${d.executionId || 'not-created'}`, 'Binance did not execute the requested position.',
    'Verification and persistence were not started. No TRADE OPENED notification was sent.',
    `Error: ${String(d.error || 'unknown').slice(0, 500)}`].join('\n');
}

return [{ json: { ...d, telegramText } }];
