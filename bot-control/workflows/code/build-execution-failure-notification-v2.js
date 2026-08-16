const d = $input.first().json;
const engineAlreadyNotified = d.failureNotificationSent === true;
const suppressed = d.failureNotificationSuppressed === true;
const verification = d.verificationResult || {};
const exchangeVerified = verification.exchangeVerified === true;
const persistenceFailed = d.failureCategory === 'PERSISTENCE_FAILURE' || exchangeVerified;
const verificationFailed = d.failureCategory === 'VERIFICATION_FAILURE'
  || (!exchangeVerified && /verif|read-back|visible/i.test(String(d.error || '')));
const rejected = d.finalStatus === 'REJECTED' || d.status === 'PORTFOLIO_CAPACITY_REJECTED'
  || d.failureCategory === 'EXECUTION_REJECTED';
const direction = String(d.positionSide || d.side || '').toUpperCase() || 'N/A';
const bar = (filled, total = 10) => '█'.repeat(filled) + '░'.repeat(total - filled);

let telegramText = null;
if (!engineAlreadyNotified && !suppressed) {
  const title = rejected ? '❌ TRADE RECHAZADO' : persistenceFailed ? '🚨 PERSISTENCIA PENDIENTE'
    : verificationFailed ? '⚠ VERIFICACIÓN FALLIDA' : '🚨 EJECUCIÓN FALLIDA';
  const exchangeState = exchangeVerified ? '✅ VERIFIED' : '❌ NOT VERIFIED';
  const localState = persistenceFailed ? '❌ FAILED' : '⏸ NOT STARTED';
  const capacity = d.portfolioCapacity || verification.error?.responseBody || {};
  const reason = d.rejectionReason || capacity.primaryReason || {};
  const nextAction = rejected
    ? 'No se creó ninguna orden. Revisa los límites de riesgo/capacidad.'
    : persistenceFailed
      ? 'Binance confirmó la operación; revisar monitor local y dashboard antes de modificarla.'
      : 'Binance no confirmó la operación. No se avanzó el estado local.';
  telegramText = [
    '━━━━━━━━━━━━━━━━━━━━━━━', title, '━━━━━━━━━━━━━━━━━━━━━━━', '',
    `${direction === 'SHORT' || direction === 'SELL' ? '🔴' : '🟢'} ${direction}  ·  ${d.symbol || 'UNKNOWN'}`,
    `Execution ID: ${d.executionId || 'not-created'}`, '',
    '━━━ ESTADO DEL PIPELINE ━━━',
    `Binance       [${bar(exchangeVerified ? 10 : 2)}] ${exchangeState}`,
    `Persistencia  [${bar(persistenceFailed ? 2 : 0)}] ${localState}`,
    `Final status  ${d.finalStatus || 'FAILED'}`,
    '', '━━━ SOLICITUD ━━━',
    `Tipo          ${d.type || 'OPEN_POSITION'}`,
    d.qty ? `Cantidad      ${d.qty}` : null,
    d.leverage ? `Leverage      ${d.leverage}x` : null,
    d.sl ? `Stop Loss     ${d.sl}` : null,
    d.tp ? `Take Profit   ${d.tp}` : null,
    rejected && reason.code ? `Motivo riesgo  ${reason.code}` : null,
    '', '━━━ DETALLE ━━━',
    `Error: ${String(d.error || 'unknown').slice(0, 700)}`,
    '', `Acción: ${nextAction}`, '━━━━━━━━━━━━━━━━━━━━━━━'
  ].filter(Boolean).join('\n');
}

return [{ json: { ...d, telegramText, notificationStatus: engineAlreadyNotified ? 'SENT_BY_ENGINE' : suppressed ? 'SUPPRESSED_TRANSIENT' : 'PENDING_SEND' } }];
