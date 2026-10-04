const d = $input.first().json;
const decision = d.decisionExplanation || {};
const learning = d.learningDecision || {};
const indicators = d.indicators || {};
const threshold = Number(decision.threshold ?? d.dynamicThreshold ?? 65);
const score = Number(decision.score ?? d.finalScore ?? 0);
const margin = Number(decision.margin ?? score - threshold);
const reason = d.skipReason || learning.reason || 'Rechazo sin motivo';
const contributions = Array.isArray(decision.contributions) ? decision.contributions : [];

function clean(value, max = 220) {
  return String(value || 'N/D').replace(/[<>_*[\]()~`#+|{}.!\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function signed(value) {
  const current = Number(value || 0);
  return `${current >= 0 ? '+' : ''}${current.toFixed(1)}`;
}

const primary = decision.primaryReason || learning.primaryReason || 'ENTRY_REJECTED';
const visibleContributions = contributions
  .filter(item => Number(item.value ?? item.delta ?? 0) !== 0)
  .slice(0, 10)
  .map(item => `- ${clean(item.component, 40)}: ${signed(item.value ?? item.delta)} (${clean(item.evidence || item.key, 70)})`);

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:3001/db/rejection',
    json: true,
    body: {
      ...d,
      symbol: d.symbol,
      skipReason: `${primary}: ${reason}`,
      finalScore: score,
      tf4hStatus: d.tf4h?.status || null,
      macroBias: d.marketContext?.market_bias || null,
      fearGreed: d.marketContext?.fearGreed?.value || null,
      entryReason: reason,
      setupLabel: d.setupLabel || null
    }
  });
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:3001/db/scan',
    json: true,
    body: {
      symbol: d.symbol,
      scanScore: d.scanScore,
      direction: d.direction,
      finalScore: score,
      longScore: d.longScore,
      shortScore: d.shortScore,
      passAI: false,
      skipReason: `${primary}: ${reason}`,
      indicators,
      volume24h: d.volume24h,
      priceChangePct: d.priceChangePct,
      openInterest: d.openInterest
    }
  });
} catch (error) {
  console.log('[EntryRejectionV2] telemetry:', error.message);
}


// Plain-language Telegram explanations for decision and rejection codes.
// label: what happened. why: what it protects or means. Keep both short.
const REASONS = Object.freeze({
  JEV_NO_TRADE: { label: 'Jev decidió no operar', why: 'El modelo no vio una entrada con suficiente respaldo en este momento.' },
  JEV_PROPOSAL_VALID: { label: 'propuesta válida', why: 'Pasa a dimensionamiento y controles de riesgo antes de enviar orden.' },
  JEV_POSITION_LIMIT: { label: 'ya hay 2 posiciones abiertas (límite preventivo)', why: 'Evita concentrar demasiado riesgo a la vez; las posiciones abiertas siguen gestionadas.' },
  JEV_LOW_VOLUME: { label: 'volumen de la vela insuficiente (menos de 0.8× lo normal)', why: 'Con poco volumen los movimientos son menos fiables y es más fácil una falsa ruptura.' },
  JEV_QUALITY_DATA_MISSING: { label: 'faltan datos para validar la calidad de entrada', why: 'Sin ATR, EMA21, volumen o lista de posiciones no se puede comprobar la entrada con seguridad.' },
  JEV_EXTENDED_ENTRY: { label: 'precio demasiado alejado de su media (más de 2 ATR de la EMA21)', why: 'Entrar tarde tras un movimiento fuerte aumenta el riesgo de comprar arriba o vender abajo.' },
  JEV_UNCERTAIN_ENTRY: { label: 'decisión del modelo poco clara', why: 'Se exige confianza ≥ 60% y una ventaja ≥ 20 puntos sobre la segunda opción.' },
  JEV_NET_REWARD_RISK: { label: 'recompensa/riesgo neta insuficiente (menor a 1.20)', why: 'Tras comisiones, el objetivo no compensa lo suficiente lo que se arriesga hasta el SL.' },
  JEV_NO_FEASIBLE_POSITION: { label: 'ninguna combinación viable de dirección, apalancamiento y stop loss', why: 'Con el margen y los límites actuales no cabe una posición de tamaño mínimo.' },
  JEV_NO_FEASIBLE_LEVERAGE: { label: 'ningún apalancamiento cumple los topes de riesgo', why: 'Los límites de calidad, liquidez o cuenta no dejaron ningún valor permitido.' },
  JEV_CAPACITY_UNAVAILABLE: { label: 'no se pudo validar el margen y riesgo actual', why: 'Sin datos de cuenta no se abre nada: se prefiere no operar a operar a ciegas.' },
  JEV_RISK_REJECTED: { label: 'los controles de riesgo impiden abrir otra posición', why: 'Ya se usa el riesgo o la exposición máxima permitida.' },
  JEV_STALE_DATA: { label: 'datos de mercado demasiado antiguos', why: 'El precio pudo cambiar; decidir con datos viejos es peligroso.' },
  JEV_PRICE_DRIFT: { label: 'el precio se movió demasiado desde el análisis', why: 'La entrada ya no coincide con lo que se evaluó.' },
  JEV_MARKET_UNAVAILABLE: { label: 'Binance no devolvió datos del mercado', why: 'Sin precio y filtros actuales no se puede validar la orden.' },
  JEV_API_UNAVAILABLE: { label: 'Jev no respondió correctamente', why: 'Ante un fallo del modelo el sistema no opera.' },
  JEV_TIMEOUT: { label: 'Jev tardó demasiado en responder', why: 'Ante un fallo del modelo el sistema no opera.' },
  JEV_INVALID_RESPONSE: { label: 'respuesta de Jev no válida', why: 'La respuesta no superó las validaciones; no se usa.' },
  JEV_INVALID_LEVELS: { label: 'TP/SL propuestos no válidos', why: 'Los niveles no respetan la dirección o los filtros de precio de Binance.' },
  JEV_SERVICE_UNAVAILABLE: { label: 'el servicio de decisión no está disponible', why: 'Ante un fallo del servicio el sistema no opera.' },
  JEV_DUPLICATE_OR_EXPIRED: { label: 'decisión repetida o caducada', why: 'Cada ciclo se evalúa una sola vez y la propuesta caduca a los pocos segundos.' },
  JEV_INVALID_OR_EXPIRED: { label: 'la propuesta de Jev caducó o no es válida', why: 'Solo se ejecutan propuestas recientes y del mismo símbolo.' },
  SCORE_BELOW_THRESHOLD: { label: 'puntuación por debajo del umbral', why: 'La señal técnica no es lo bastante fuerte para entrar.' },
  LEARNING_HARD_BLOCK: { label: 'bloqueado por una regla aprendida', why: 'Configuraciones parecidas dieron malos resultados en el historial.' },
  CAPITAL_PROTECTION: { label: 'protección de capital activa', why: 'Se alcanzó un límite de pérdida diaria/semanal o una racha de pérdidas.' },
  BASE_PIPELINE_REJECTED: { label: 'rechazada por los filtros base', why: 'La señal no pasó los filtros previos del flujo.' },
  RISK_HALT: { label: 'control de riesgo detuvo la evaluación', why: 'Se prefiere no operar mientras un límite está activo.' },
  CIRCUIT_BREAKER: { label: 'pausa automática por pérdidas (circuit breaker)', why: 'Tras varias pérdidas se pausa la operativa un tiempo para cortar la racha.' },
  PORTFOLIO_CAPACITY_FULL: { label: 'cartera sin capacidad disponible', why: 'No queda margen o riesgo libre para otra posición.' },
  PORTFOLIO_CAPACITY_UNAVAILABLE: { label: 'no se pudo consultar la capacidad de la cartera', why: 'Sin datos de cuenta no se abre nada.' },
  CAPITAL_GUARD_UNAVAILABLE: { label: 'no se pudo consultar la protección de capital', why: 'Sin ese control no se abre nada.' },
  RISK_SERVICE_UNAVAILABLE: { label: 'servicio de riesgo no disponible', why: 'Sin control de riesgo no se abre nada.' },
  EXCHANGE_UNAVAILABLE: { label: 'Binance no disponible', why: 'Sin conexión con el exchange no se puede operar con seguridad.' },
  DIRECTION_EXPOSURE_LIMIT: { label: 'límite de exposición en esta dirección', why: 'Ya hay demasiado tamaño en LONG o en SHORT; evita apostar todo a un mismo lado.' },
  SYMBOL_EXPOSURE_LIMIT: { label: 'límite de exposición en este símbolo', why: 'Evita concentrar demasiado en un solo activo.' },
  PORTFOLIO_EXPOSURE_FULL: { label: 'exposición total de la cartera al máximo', why: 'La suma de posiciones ya alcanza el tope permitido.' },
  PORTFOLIO_RISK_FULL: { label: 'riesgo total de la cartera al máximo', why: 'Lo que se perdería si todos los SL se activan ya alcanza el tope.' },
  MARGIN_CAPACITY_FULL: { label: 'margen disponible agotado', why: 'No queda margen libre para otra posición.' },
  CANDIDATE_RISK_EXCEEDS_BUDGET: { label: 'la operación arriesgaría más de lo permitido', why: 'La pérdida hasta el SL supera el presupuesto de riesgo restante.' },
  CANDIDATE_MARGIN_EXCEEDS_CAPACITY: { label: 'la operación necesita más margen del disponible', why: 'No hay margen libre suficiente.' },
  CANDIDATE_EXPOSURE_EXCEEDS_CAPACITY: { label: 'la operación supera la exposición permitida', why: 'El tamaño haría pasar la cartera de su tope.' },
  SIZE_REALIZATION_TOO_LOW: { label: 'tamaño resultante demasiado pequeño', why: 'Tras redondear a los mínimos de Binance la posición no sería viable.' },
  MIN_NOTIONAL: { label: 'por debajo del mínimo de Binance', why: 'La orden no alcanza el valor mínimo que exige el exchange.' },
  NO_ACCOUNT_EQUITY: { label: 'no se pudo leer el saldo de la cuenta', why: 'Sin saldo no se puede calcular el tamaño.' },
  UNPROTECTED_POSITION: { label: 'hay una posición sin protección', why: 'Primero hay que asegurar el SL de la posición existente.' },
  INVALID_CANDIDATE_ALLOCATION: { label: 'asignación de tamaño no válida', why: 'Los cálculos de tamaño no superaron las validaciones.' },
  TRADING_DISABLED_BY_CONFIGURATION: { label: 'trading desactivado por configuración', why: 'El sistema está en modo sin órdenes.' }
});
function describeReason(code) {
  const key = String(code || '');
  return REASONS[key] || { label: key ? key.toLowerCase().replace(/_/g, ' ') : 'motivo no informado', why: '' };
}
const explanation = describeReason(primary);
const text = d.jevBlocked ? '' : [
  '⛔ OPERACIÓN RECHAZADA',
  `💎 ${clean(d.symbol)} · ${d.direction === 'LONG' ? '🟢 LONG (subida)' : d.direction === 'SHORT' ? '🔴 SHORT (bajada)' : 'dirección no definida'}`,
  '', '📋 ¿Qué pasó?',
  `🔎 ${explanation.label}.`,
  explanation.why || null,
  `📝 Detalle: ${clean(reason)}`,
  '', '📊 Datos del análisis',
  `Puntuación: ${score.toFixed(1)}/100 · mínimo de referencia: ${threshold.toFixed(1)}.`,
  'Esta puntuación no es una probabilidad de ganar.',
  '', '🛡 Esta señal no pasó a la apertura de una orden.',
  '🔄 Se esperará otra oportunidad que cumpla los controles.',
  `🆔 Ciclo: ${clean(d.opportunityCycleId)}`,
  `Código de diagnóstico: ${clean(primary, 100)}`
].filter(line => line !== null).join('\n');

return [{ json: { ...d, notificationEventKey: `entry-rejection:${d.jev?.id || d.opportunityCycleId || d.symbol}`, text } }];
