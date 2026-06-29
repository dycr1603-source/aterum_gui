'use strict';

const f = require('./format');

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
}

const ARTICLES = [
  { id: 'learning', patterns: [/learning/, /aprendizaje/], title: 'Learning Engine', text: 'Evalúa evidencia histórica y aplica factores o bloqueos auditables según muestra, confianza y límites de capital. No cambia indicadores ni ejecuta operaciones por sí mismo.' },
  { id: 'research', patterns: [/research/, /investigacion/], title: 'Research', text: 'Convierte trades, rechazos y análisis post-trade en informes, riesgos, oportunidades y recomendaciones persistidas. Research interpreta evidencia; no opera.' },
  { id: 'expectancy', patterns: [/expectancy/, /expectativa/], title: 'Expectancy', text: 'Es el resultado promedio esperado por operación: combina la probabilidad de ganar, la ganancia media y la pérdida media. Un valor positivo sugiere edge en la muestra observada.' },
  { id: 'drawdown', patterns: [/drawdown/, /caida maxima/], title: 'Drawdown', text: 'Mide la caída desde un máximo de capital hasta un mínimo posterior. Describe profundidad de pérdida, no sólo el PnL de una operación.' },
  { id: 'bot', patterns: [/como funciona el bot/, /que hace el bot/, /^bot$/], title: 'Bot de trading', text: 'n8n obtiene mercado y contexto, evalúa scoring y guardas, ejecuta sólo si se cumplen los contratos y persiste el resultado. Telegram Control observa esos datos; no participa en la decisión.' },
  { id: 'score', patterns: [/score/, /puntaje/], title: 'Score', text: 'Resume confirmaciones cuantitativas de una señal. Debe interpretarse junto al threshold y los factores persistidos; superar el score no garantiza por sí solo una entrada.' },
  { id: 'simulator', patterns: [/simulator/, /simulador/], title: 'Simulator', text: 'Reconstruye resultados hipotéticos con datos históricos. Es evidencia comparativa y no una orden real; sus contratos deben compararse con producción antes de extraer conclusiones.' },
  { id: 'circuit-breaker', patterns: [/circuit breaker/, /\bcb\b/], title: 'Circuit Breaker', text: 'Detiene temporalmente entradas cuando se cumplen condiciones de protección operativa. Su estado y expiración se almacenan para que la decisión sea visible.' },
  { id: 'rejection', patterns: [/rechaz/, /operacion rechazada/], title: 'Operación rechazada', text: 'Es una señal que no atravesó todos los filtros. El motivo persistido permite distinguir una protección útil de un falso negativo sin inventar el resultado.' },
  { id: 'trailing', patterns: [/trailing/], title: 'Trailing', text: 'Gestiona el stop de una posición abierta por etapas. Telegram sólo muestra su estado; la lógica permanece en los workflows existentes.' },
  { id: 'profit-factor', patterns: [/profit factor/, /\bpf\b/], title: 'Profit Factor', text: 'Es ganancias brutas divididas por pérdidas brutas. Mayor que 1 indica beneficio bruto superior a pérdida bruta en la muestra; con pocas operaciones puede ser inestable.' },
  { id: 'capital-guard', patterns: [/capital guard/, /guardia de capital/], title: 'Capital Guard', text: 'Compara pérdida diaria, semanal, drawdown y rachas con límites configurados. Puede detener entradas, pero no cierra posiciones ni altera la estrategia.' },
  { id: 'panic-mode', patterns: [/panic mode/, /modo panico/], title: 'Panic Mode', text: 'Es un estado de protección excepcional. Debe interpretarse mediante el estado real persistido y su causa; Telegram no lo activa ni lo desactiva.' }
];

const INTENTS = [
  { command: 'status', patterns: [/estado (del )?sistema/, /como esta aterum/, /resumen general/] },
  { command: 'balance', patterns: [/balance/, /capital disponible/, /equity/] },
  { command: 'positions', patterns: [/posiciones? abiertas?/, /que posiciones/] },
  { command: 'performance', patterns: [/performance/, /rendimiento/, /profit factor actual/, /win rate actual/] },
  { command: 'research', patterns: [/ultimo research/, /ultimo informe/] },
  { command: 'learning', patterns: [/estado (del )?learning/, /reglas activas/] },
  { command: 'health', patterns: [/salud (del )?sistema/, /servicios? (estan|esta)/] },
  { command: 'news', patterns: [/noticias? actuales?/, /ultimas noticias/] },
  { command: 'changes', patterns: [/ultimos cambios/, /que cambio/] }
];

function commandIntent(question) {
  const text = normalize(question);
  for (const intent of INTENTS) if (intent.patterns.some(pattern => pattern.test(text))) return intent.command;
  const symbol = text.match(/\b([a-z0-9]{3,18}usdt)\b/i)?.[1]?.toUpperCase();
  if (symbol && /historial|trades|operaciones/.test(text)) return { command: 'history', args: [symbol] };
  if (symbol && /por que|decision|explica/.test(text)) return { command: 'why', args: [symbol] };
  return null;
}

function answer(question) {
  const text = normalize(question);
  const definitional = /^(que es|que significa|como funciona|para que sirve|define|explica(?:me)?)(\s|$)/.test(text) || text.split(' ').length <= 3;
  if (!definitional) return null;
  const article = ARTICLES.find(item => item.patterns.some(pattern => pattern.test(text)));
  if (!article) return null;
  return `📚 ${f.bold(article.title)}\n\n${f.escape(article.text)}\n\n${f.escape('Fuente: conocimiento local de Aterum. No se consultó Claude.')}`;
}

const COMMAND_HELP = {
  status: ['Estado', 'Consolida cuenta, Capital Guard, último Research y salud de servicios.', 'Dashboard State, Learning Summary, Research y health probes.'],
  balance: ['Balance', 'Muestra balance, equity, disponible, margen y PnL con la misma instantánea del Dashboard.', 'Dashboard State y estadísticas persistidas.'],
  positions: ['Posiciones', 'Enumera posiciones reales y enlaza su estado con Learning cuando existe evidencia asociada.', 'Dashboard State y Learning Decisions.'],
  performance: ['Performance', 'Resume Win Rate, Profit Factor, Expectancy, Drawdown y PnL observados.', 'Research Summary y estadísticas de cierres.'],
  research: ['Research', 'Muestra el último informe persistido, riesgos, oportunidades y cambios activos.', 'Research API y Learning Changes.'],
  learning: ['Learning', 'Muestra reglas, decisiones, impacto y modo operativo persistido.', 'Learning API.'],
  health: ['Salud', 'Comprueba servicios sin ejecutar acciones administrativas.', 'Health probes, MySQL, Redis, Binance y Telegram.'],
  news: ['Noticias', 'Muestra el feed real que ya utiliza Intelligence.', 'Intelligence API.'],
  why: ['Explicación', 'Reconstruye una decisión histórica y deja N/D donde no existe evidencia persistida.', 'Trades y Learning Decisions.'],
  ask: ['Copiloto', 'Responde localmente cuando puede y usa Claude sólo para razonamiento transversal.', 'APIs existentes resumidas; nunca ejecuta operaciones.'],
  ai: ['Eficiencia IA', 'Audita cuántas respuestas fueron locales, cacheadas o generadas por Claude.', 'telegram_ai_usage.']
};

function contextual(topic, mode = 'meaning') {
  const [title, meaning, evidence] = COMMAND_HELP[topic] || ['Aterum Control', 'Esta vista utiliza datos reales disponibles y no inventa campos ausentes.', 'APIs existentes y persistencia del sistema.'];
  const text = mode === 'evidence' ? evidence : mode === 'how' ? `Consulta ${evidence}, normaliza la respuesta y la presenta sin mover lógica de negocio.` : mode === 'more' ? `${meaning} Los valores N/D significan que la evidencia no fue persistida o no está disponible.` : meaning;
  return `ℹ️ ${f.bold(title)}\n\n${f.escape(text)}\n\n${f.escape('Explicación local. Claude no fue utilizado.')}`;
}

module.exports = { normalize, commandIntent, answer, contextual, ARTICLES };
