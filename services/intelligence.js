'use strict';

const https = require('https');
const crypto = require('crypto');
const shared = require('../shared');
const { getOpenAIClient, getAssistantModel } = require('./openai_client');

const NEWS_CACHE_MS = 5 * 60 * 1000;
let newsCache = { ts: 0, items: [] };

const NEWS_FEEDS = [
  {
    category: 'Macro',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(crypto OR bitcoin OR ethereum) macro economy OR cpi OR fed OR rates when:2d') + '&hl=en-US&gl=US&ceid=US:en'
  },
  {
    category: 'Regulación',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('crypto regulation OR sec OR etf OR lawmakers OR lawsuit when:3d') + '&hl=en-US&gl=US&ceid=US:en'
  },
  {
    category: 'Mercado',
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('bitcoin OR ethereum OR altcoins market rally OR selloff when:2d') + '&hl=en-US&gl=US&ceid=US:en'
  }
];

const SESSIONS = [
  {
    id: 'asia',
    name: 'Asia',
    subtitle: 'China',
    flag: '🇨🇳',
    openMin: 0,
    closeMin: 480,
    baseVolatility: 'media',
    defaultBehavior: 'descubrimiento de rango y barridos de liquidez'
  },
  {
    id: 'europe',
    name: 'Europa',
    subtitle: 'Europa',
    flag: '🇪🇺',
    openMin: 420,
    closeMin: 930,
    baseVolatility: 'alta',
    defaultBehavior: 'continuación de tendencia y repricing macro'
  },
  {
    id: 'us',
    name: 'USA',
    subtitle: 'Estados Unidos',
    flag: '🇺🇸',
    openMin: 810,
    closeMin: 1260,
    baseVolatility: 'alta',
    defaultBehavior: 'expansión por titulares y reversos rápidos'
  }
];

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error('HTTP ' + res.statusCode));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function decodeEntities(text) {
  return (text || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(text) {
  return decodeEntities(String(text || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 220) {
  const clean = stripHtml(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

function extractTag(block, tag) {
  const match = block.match(new RegExp('<' + tag + '(?: [^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? stripHtml(match[1]) : '';
}

function stableId(seed) {
  return crypto.createHash('md5').update(seed).digest('hex').slice(0, 14);
}

function parseFeed(xml, category) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description');
    const source = extractTag(block, 'source') || category;
    const pubDate = extractTag(block, 'pubDate');
    return {
      id: stableId(title + link),
      title,
      link,
      source,
      category,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      summary: truncate(description || title)
    };
  }).filter(item => item.title && item.link);
}

function detectAssets(text) {
  const raw = (text || '').toLowerCase();
  const assets = [];
  if (/(bitcoin|btc)/.test(raw)) assets.push('BTC');
  if (/(ethereum|eth)/.test(raw)) assets.push('ETH');
  if (/(solana|sol)/.test(raw)) assets.push('SOL');
  if (/(xrp|ripple)/.test(raw)) assets.push('XRP');
  if (/(altcoin|alts)/.test(raw)) assets.push('Altcoins');
  if (/(stablecoin|usdt|usdc)/.test(raw)) assets.push('Stablecoins');
  if (/(fed|rates|cpi|inflation|jobs|bond|treasury|macro)/.test(raw)) assets.push('BTC', 'ETH');
  return [...new Set(assets.length ? assets : ['BTC', 'ETH'])];
}

function analyzeSentiment(text) {
  const raw = (text || '').toLowerCase();
  let score = 0;
  const alcistas = ['surge', 'jump', 'approval', 'approved', 'bullish', 'rally', 'breakout', 'inflows', 'adoption', 'expands', 'gain', 'record'];
  const bajistas = ['selloff', 'bearish', 'lawsuit', 'ban', 'hack', 'liquidation', 'outflow', 'warning', 'slump', 'falls', 'recession', 'crash'];
  alcistas.forEach(word => { if (raw.includes(word)) score += 1; });
  bajistas.forEach(word => { if (raw.includes(word)) score -= 1; });
  if (score >= 2) return 'alcista';
  if (score <= -2) return 'bajista';
  return 'neutral';
}

function computeImpact(text) {
  const raw = (text || '').toLowerCase();
  const alto = ['fed', 'cpi', 'rates', 'etf', 'sec', 'ban', 'hack', 'lawsuit', 'treasury', 'regulation', 'approval', 'liquidation'];
  const medio = ['upgrade', 'launch', 'partnership', 'exchange', 'whale', 'flows', 'options', 'funding'];
  if (alto.some(word => raw.includes(word))) return 'alto';
  if (medio.some(word => raw.includes(word))) return 'medio';
  return 'bajo';
}

function hoursSince(date) {
  const ts = new Date(date).getTime();
  if (!ts || Number.isNaN(ts)) return 99;
  return Math.max(0, (Date.now() - ts) / 3600000);
}

function computeUrgency(impact, publishedAt) {
  const age = hoursSince(publishedAt);
  if (impact === 'alto' && age <= 4) return 'inmediata';
  if (impact === 'alto' || age <= 8) return 'alta';
  if (impact === 'medio' || age <= 18) return 'media';
  return 'baja';
}

function computePriorityScore(sentiment, impact, publishedAt) {
  const impactScore = impact === 'alto' ? 58 : impact === 'medio' ? 34 : 18;
  const recencyScore = hoursSince(publishedAt) <= 4 ? 28 : hoursSince(publishedAt) <= 12 ? 18 : 10;
  const sentimentScore = sentiment === 'neutral' ? 4 : 10;
  return Math.min(100, impactScore + recencyScore + sentimentScore);
}

function possibleReaction(sentiment, impact, assets) {
  if (impact === 'alto' && sentiment === 'alcista') {
    return 'Si el precio confirma, puede entrar flujo comprador con ' + assets.join(', ') + ' liderando la beta del movimiento.';
  }
  if (impact === 'alto' && sentiment === 'bajista') {
    return 'Es probable ver desapalancamiento, rangos intradía más amplios y barridas rápidas de stops en ' + assets.join(', ') + '.';
  }
  if (impact === 'medio' && sentiment === 'alcista') {
    return 'El tono mejora, pero la apertura de sesión debe confirmar si los compradores realmente extienden el impulso.';
  }
  if (impact === 'medio' && sentiment === 'bajista') {
    return 'Puede aparecer presión bajista de corto plazo, sobre todo si la liquidez sigue fina o la próxima sesión abre en modo risk-off.';
  }
  return 'Por ahora la noticia aporta contexto. Conviene esperar reacción del precio y participación de sesión antes de operar dirección.';
}

function enrichNewsItem(item) {
  const sourceText = item.title + ' ' + item.summary + ' ' + item.category;
  const sentiment = analyzeSentiment(sourceText);
  const impact = computeImpact(sourceText);
  const affectedAssets = detectAssets(sourceText);
  const urgency = computeUrgency(impact, item.publishedAt);
  const priorityScore = computePriorityScore(sentiment, impact, item.publishedAt);
  return {
    ...item,
    sentiment,
    impact,
    affectedAssets,
    urgency,
    priorityScore,
    reaction: possibleReaction(sentiment, impact, affectedAssets)
  };
}

async function fetchNews() {
  if (Date.now() - newsCache.ts < NEWS_CACHE_MS && newsCache.items.length) {
    return newsCache.items;
  }

  try {
    const feeds = await Promise.all(NEWS_FEEDS.map(feed => httpGetText(feed.url).then(xml => parseFeed(xml, feed.category))));
    const items = feeds.flat()
      .map(enrichNewsItem)
      .sort((a, b) => (b.priorityScore - a.priorityScore) || (new Date(b.publishedAt) - new Date(a.publishedAt)))
      .filter((item, index, arr) => arr.findIndex(other => other.id === item.id) === index)
      .slice(0, 10);

    newsCache = { ts: Date.now(), items };
    return items;
  } catch (error) {
    return [];
  }
}

function formatCountdown(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs <= 0) return mins + 'm';
  return hrs + 'h ' + mins + 'm';
}

function sessionStatus(def, now) {
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (currentMin >= def.openMin && currentMin < def.closeMin) {
    const untilClose = def.closeMin - currentMin;
    return { status: 'abierta', countdownMin: untilClose, countdownLabel: 'Cierra en ' + formatCountdown(untilClose) };
  }
  if (currentMin < def.openMin) {
    const untilOpen = def.openMin - currentMin;
    return { status: 'próxima', countdownMin: untilOpen, countdownLabel: 'Abre en ' + formatCountdown(untilOpen) };
  }
  const untilNextOpen = (1440 - currentMin) + def.openMin;
  return { status: 'cerrada', countdownMin: untilNextOpen, countdownLabel: 'Abre en ' + formatCountdown(untilNextOpen) };
}

async function getPerformanceContext(symbol) {
  const [overall, recent, symbolPerf] = await Promise.all([
    shared.query(`SELECT COUNT(*) as trades,
      SUM(pnl_usdt > 0) as wins,
      ROUND(AVG(r_final),2) as avg_r,
      ROUND(SUM(pnl_usdt),2) as total_pnl
      FROM trade_closes
      WHERE closed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`),
    shared.query(`SELECT t.symbol, tc.pnl_usdt, tc.r_final, tc.close_reason, tc.closed_at
      FROM trade_closes tc
      JOIN trades t ON t.id = tc.trade_id
      ORDER BY tc.closed_at DESC
      LIMIT 12`),
    symbol ? shared.query(`SELECT COUNT(*) as trades,
      SUM(tc.pnl_usdt > 0) as wins,
      ROUND(AVG(tc.r_final),2) as avg_r,
      ROUND(SUM(tc.pnl_usdt),2) as total_pnl
      FROM trade_closes tc
      JOIN trades t ON t.id = tc.trade_id
      WHERE t.symbol = ?
      AND tc.closed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`, [symbol]) : Promise.resolve(null)
  ]);

  const base = overall && overall[0] ? overall[0] : { trades: 0, wins: 0, avg_r: 0, total_pnl: 0 };
  const tradeCount = Number(base.trades || 0);
  const winRate = tradeCount ? Math.round((Number(base.wins || 0) / tradeCount) * 100) : 0;
  const recentBiasScore = (recent || []).reduce((sum, row, index) => {
    const weight = Math.max(1, 6 - index);
    return sum + (Number(row.pnl_usdt || 0) >= 0 ? weight : -weight);
  }, 0);

  return {
    overall: {
      tradeCount,
      winRate,
      avgR: Number(base.avg_r || 0),
      totalPnl: Number(base.total_pnl || 0)
    },
    recent: (recent || []).map(row => ({
      symbol: row.symbol,
      pnl: Number(row.pnl_usdt || 0),
      r: Number(row.r_final || 0),
      closeReason: row.close_reason,
      closedAt: row.closed_at
    })),
    recentBias: recentBiasScore > 4 ? 'alcista' : recentBiasScore < -4 ? 'bajista' : 'neutral',
    symbol: symbolPerf && symbolPerf[0] ? {
      tradeCount: Number(symbolPerf[0].trades || 0),
      winRate: Number(symbolPerf[0].trades || 0) ? Math.round((Number(symbolPerf[0].wins || 0) / Number(symbolPerf[0].trades || 1)) * 100) : 0,
      avgR: Number(symbolPerf[0].avg_r || 0),
      totalPnl: Number(symbolPerf[0].total_pnl || 0)
    } : null
  };
}

async function getLearningContext(symbol) {
  const sql = `SELECT t.symbol, t.final_score, t.vision_state, t.recommended_leverage, t.effective_risk_pct,
      tc.pnl_usdt, tc.r_final, tc.close_reason, tc.duration_minutes, tc.closed_at
    FROM trades t
    JOIN trade_closes tc ON t.id = tc.trade_id
    ${symbol ? 'WHERE t.symbol = ?' : ''}
    ORDER BY tc.closed_at DESC
    LIMIT 40`;
  const rows = await shared.query(sql, symbol ? [symbol] : []);
  return rows || [];
}

function getPositionContext(symbol) {
  const account = shared.accountState || {};
  const positions = Object.entries(account.positions || {}).map(([sym, pos]) => {
    const trade = shared.activeTrades[sym] || {};
    return {
      symbol: sym,
      side: pos.side,
      leverage: Number(pos.leverage || trade.leverage || 0),
      unrealized: Number(pos.unrealized || 0),
      entryPrice: Number(pos.entryPrice || trade.entryPrice || 0),
      markPrice: Number(pos.markPrice || trade.lastPrice || 0),
      margin: Number(pos.margin || trade.marginRequired || 0),
      stopLoss: Number(trade.sl || 0),
      takeProfit: Number(trade.tp || 0)
    };
  });
  const current = positions.find(pos => pos.symbol === symbol) || positions[0] || null;
  return {
    openPositions: positions.length,
    positions,
    current,
    totalUnrealized: Number(account.totalUnreal || 0),
    balance: Number(account.balance || 0),
    available: Number(account.available || 0)
  };
}

function computeBias(news, performance, positions) {
  const newsScore = news.slice(0, 6).reduce((sum, item) => {
    const weight = item.impact === 'alto' ? 2 : item.impact === 'medio' ? 1 : 0.5;
    if (item.sentiment === 'alcista') return sum + weight;
    if (item.sentiment === 'bajista') return sum - weight;
    return sum;
  }, 0);
  const perfScore = performance.recentBias === 'alcista' ? 1.5 : performance.recentBias === 'bajista' ? -1.5 : 0;
  const posScore = positions.totalUnrealized > 0 ? 0.4 : positions.totalUnrealized < 0 ? -0.4 : 0;
  const total = newsScore + perfScore + posScore;
  return {
    score: total,
    stance: total > 1.2 ? 'alcista' : total < -1.2 ? 'bajista' : 'neutral',
    confidence: Math.abs(total) > 3 ? 'alta' : Math.abs(total) > 1.5 ? 'media' : 'baja'
  };
}

function buildSessions(news, performance, positions) {
  const now = new Date();
  const bias = computeBias(news, performance, positions);
  return SESSIONS.map(def => {
    const state = sessionStatus(def, now);
    const volatility = state.status === 'abierta'
      ? def.baseVolatility
      : state.countdownMin < 120 ? 'en aumento' : 'baja';
    const direction = bias.stance === 'neutral'
      ? (def.id === 'asia' ? 'lateral' : 'mixta')
      : bias.stance;
    const risks = [];
    if (news.some(item => item.impact === 'alto' && item.sentiment === 'bajista')) risks.push('riesgo de reversión por titular fuerte');
    if (state.status !== 'abierta') risks.push('confirmación limitada hasta que entre más liquidez');
    if (positions.openPositions > 0 && positions.totalUnrealized < 0) risks.push('las posiciones abiertas ya llegan con presión');
    return {
      id: def.id,
      flag: def.flag,
      label: def.name,
      subtitle: def.subtitle,
      status: state.status,
      countdownLabel: state.countdownLabel,
      volatility,
      typicalBehavior: direction === 'lateral' ? def.defaultBehavior : direction + ' con ' + def.defaultBehavior,
      expectedDirection: direction,
      keyRisks: risks.slice(0, 3),
      timelineStartPct: +(def.openMin / 1440 * 100).toFixed(2),
      timelineEndPct: +(def.closeMin / 1440 * 100).toFixed(2)
    };
  });
}

function buildLearning(rows) {
  const trades = rows || [];
  const winners = trades.filter(row => Number(row.pnl_usdt || 0) > 0);
  const losers = trades.filter(row => Number(row.pnl_usdt || 0) <= 0);
  const avgRisk = trades.length ? trades.reduce((sum, row) => sum + Number(row.effective_risk_pct || 0), 0) / trades.length : 0;
  const avgLev = trades.length ? trades.reduce((sum, row) => sum + Number(row.recommended_leverage || 0), 0) / trades.length : 0;
  const avgWinnerDuration = winners.length ? winners.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0) / winners.length : 0;
  const avgLoserDuration = losers.length ? losers.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0) / losers.length : 0;
  const avgWinnerR = winners.length ? winners.reduce((sum, row) => sum + Number(row.r_final || 0), 0) / winners.length : 0;
  const lateLosses = losers.filter(row => ['LATE_TREND', 'PARABOLIC'].includes(row.vision_state)).length;
  const lowScoreLosses = losers.filter(row => Number(row.final_score || 0) < 60).length;

  const findings = [];

  if (losers.length && lateLosses / losers.length >= 0.35) {
    findings.push({
      tone: 'warn',
      title: 'Sueles entrar tarde en movimientos extendidos',
      detail: 'Una parte relevante de tus pérdidas recientes llegó cuando el mercado ya venía en fase tardía o parabólica.',
      recommendation: 'Exige mejor timing: espera retroceso o confirmación más limpia antes de perseguir precio.'
    });
  }

  if (winners.length >= 4 && avgLoserDuration > 0 && avgWinnerDuration < avgLoserDuration * 0.55 && avgWinnerR < 1) {
    findings.push({
      tone: 'warn',
      title: 'Estás cerrando demasiado pronto',
      detail: 'Tus operaciones ganadoras duran bastante menos que las perdedoras y el promedio de R ganador sigue contenido.',
      recommendation: 'Permite que los trades con contexto fuerte respiren un poco más antes de asegurar beneficio.'
    });
  }

  if (avgRisk > 1.2 || avgLev > 6) {
    findings.push({
      tone: 'bad',
      title: 'Tu riesgo promedio es alto',
      detail: 'El tamaño medio de riesgo y apalancamiento está por encima del rango prudente para mantener consistencia.',
      recommendation: 'Reduce riesgo por operación o apalancamiento cuando el contexto no sea claramente favorable.'
    });
  }

  if (losers.length && lowScoreLosses / losers.length >= 0.4) {
    findings.push({
      tone: 'warn',
      title: 'Estás aceptando setups débiles',
      detail: 'Muchas pérdidas recientes entraron con puntuación baja, señal de prisa o exceso de confianza.',
      recommendation: 'Filtra entradas por calidad mínima antes de tomar exposición.'
    });
  }

  if (!findings.length) {
    findings.push({
      tone: 'good',
      title: 'Tu comportamiento reciente está razonablemente alineado',
      detail: 'No apareció un error dominante en las últimas operaciones cerradas.',
      recommendation: 'Mantén disciplina y revisa contexto de sesión y titulares antes de aumentar tamaño.'
    });
  }

  return {
    summary: findings[0].title,
    findings: findings.slice(0, 3)
  };
}

function buildSignal(posture, sessions, news, positions, learning) {
  const activeSession = sessions.find(session => session.status === 'abierta');
  const highImpactNews = news.find(item => item.impact === 'alto');
  const contradiction = highImpactNews && (
    (posture.stance === 'alcista' && highImpactNews.sentiment === 'bajista') ||
    (posture.stance === 'bajista' && highImpactNews.sentiment === 'alcista')
  );

  let action = 'NO OPERAR';
  if (activeSession && posture.score >= 1.8 && !contradiction) action = 'LONG';
  if (activeSession && posture.score <= -1.8 && !contradiction) action = 'SHORT';

  const confidence = Math.abs(posture.score) > 3 ? 'alta' : Math.abs(posture.score) > 1.8 ? 'media' : 'baja';
  const risk = contradiction || !activeSession ? 'alto' : positions.current && positions.current.unrealized < 0 ? 'alto' : confidence === 'alta' ? 'medio' : 'alto';

  const drivers = [];
  drivers.push('Sesgo general ' + posture.stance + ' con confianza ' + posture.confidence + '.');
  if (activeSession) drivers.push('La sesión activa es ' + activeSession.label + ' con volatilidad ' + activeSession.volatility + '.');
  else drivers.push('No hay una sesión principal abierta, así que la liquidez es limitada.');
  if (highImpactNews) drivers.push('La noticia dominante llega con impacto ' + highImpactNews.impact + ' y tono ' + highImpactNews.sentiment + '.');
  if (learning.findings[0]) drivers.push('Patrón del usuario detectado: ' + learning.findings[0].title + '.');

  const explanation = action === 'NO OPERAR'
    ? 'El contexto aún no justifica una entrada con ventaja clara. Conviene esperar confirmación de sesión o reacción del precio.'
    : 'La lectura actual permite una señal operativa, pero solo si la ejecución respeta confirmación y control de riesgo.';

  return {
    action,
    confidence,
    risk,
    explanation,
    drivers: drivers.slice(0, 4)
  };
}

function buildAlerts(news, sessions, positions, signal, learning) {
  const alerts = [];
  const activeSession = sessions.find(session => session.status === 'abierta');
  const upcomingVol = sessions.find(session => session.status === 'próxima' && session.countdownLabel);
  const topNews = news[0];

  if (upcomingVol && upcomingVol.countdownLabel && upcomingVol.countdownLabel.includes('m') && (upcomingVol.volatility === 'alta' || upcomingVol.volatility === 'en aumento')) {
    alerts.push({
      level: 'alta',
      title: 'Volatilidad entrando en ' + upcomingVol.label,
      detail: upcomingVol.countdownLabel + '. Ajusta urgencia y evita perseguir precio sin confirmación.'
    });
  }

  if (topNews && topNews.impact === 'alto') {
    alerts.push({
      level: topNews.sentiment === 'bajista' ? 'crítica' : 'media',
      title: 'Noticia prioritaria detectada',
      detail: topNews.title + '. Urgencia ' + topNews.urgency + ' y score ' + topNews.priorityScore + '/100.'
    });
  }

  if (positions.current && positions.current.unrealized < 0 && positions.current.leverage >= 5) {
    alerts.push({
      level: 'crítica',
      title: 'Tu posición está bajo presión',
      detail: positions.current.symbol + ' va con PnL abierto negativo y ' + positions.current.leverage + 'x de apalancamiento.'
    });
  }

  if (signal.action === 'NO OPERAR') {
    alerts.push({
      level: 'media',
      title: 'Señal bloqueada',
      detail: 'El modelo prefiere no operar hasta que mejore la alineación entre sesión, noticias y flujo del mercado.'
    });
  }

  if (learning.findings[0] && learning.findings[0].tone !== 'good') {
    alerts.push({
      level: 'media',
      title: 'Patrón de riesgo del usuario',
      detail: learning.findings[0].title + '. ' + learning.findings[0].recommendation
    });
  }

  return alerts.slice(0, 4);
}

function buildInsights(news, sessions, performance, positions, signal, learning) {
  const activeSession = sessions.find(session => session.status === 'abierta');
  const topNews = news[0];
  const insights = [];

  insights.push({
    tone: signal.action === 'LONG' ? 'good' : signal.action === 'SHORT' ? 'bad' : 'warn',
    title: 'Señal profesional: ' + signal.action,
    detail: signal.explanation
  });

  if (activeSession) {
    insights.push({
      tone: activeSession.expectedDirection === 'alcista' ? 'good' : activeSession.expectedDirection === 'bajista' ? 'bad' : 'info',
      title: activeSession.flag + ' ' + activeSession.label + ' está ' + activeSession.status,
      detail: activeSession.expectedDirection + ' con volatilidad ' + activeSession.volatility + '. ' + activeSession.countdownLabel + '.'
    });
  } else {
    insights.push({
      tone: 'warn',
      title: 'Ventana de baja liquidez',
      detail: 'No hay una gran sesión abierta. Conviene bajar urgencia y exigir confirmación extra.'
    });
  }

  if (topNews) {
    insights.push({
      tone: topNews.sentiment === 'alcista' ? 'good' : topNews.sentiment === 'bajista' ? 'bad' : 'info',
      title: 'Presión informativa: ' + topNews.impact,
      detail: topNews.title + ' — ' + topNews.reaction
    });
  }

  if (positions.current) {
    insights.push({
      tone: positions.current.unrealized >= 0 ? 'good' : 'bad',
      title: 'Vigilancia de posición: ' + positions.current.symbol + ' ' + positions.current.side,
      detail: 'PnL abierto ' + (positions.current.unrealized >= 0 ? '+' : '-') + '$' + Math.abs(positions.current.unrealized).toFixed(2) + ' con ' + positions.current.leverage + 'x.'
    });
  }

  insights.push({
    tone: learning.findings[0]?.tone || 'info',
    title: 'Aprendizaje del usuario',
    detail: learning.findings[0]?.title || 'Todavía no hay un patrón dominante.'
  });

  if (performance.overall.tradeCount) {
    insights.push({
      tone: performance.overall.winRate >= 55 ? 'good' : performance.overall.winRate >= 45 ? 'warn' : 'bad',
      title: 'Salud del sistema',
      detail: 'Win rate 30D de ' + performance.overall.winRate + '% con promedio ' + performance.overall.avgR + 'R.'
    });
  }

  return insights.slice(0, 6);
}

function fallbackNews(symbol) {
  const assets = symbol ? [symbol.replace('USDT', ''), 'BTC'] : ['BTC', 'ETH'];
  return [{
    id: 'fallback-intel',
    title: 'Feed de noticias no disponible',
    link: '#',
    source: 'Aterum',
    category: 'Sistema',
    publishedAt: new Date().toISOString(),
    summary: 'Se usa contexto interno de rendimiento, sesiones y posiciones mientras el feed externo vuelve a responder.',
    sentiment: 'neutral',
    impact: 'medio',
    urgency: 'media',
    priorityScore: 64,
    affectedAssets: assets,
    reaction: 'Da más peso al timing de sesión y a la telemetría interna antes de abrir nueva exposición.'
  }];
}

function pageContext(page) {
  return {
    dashboard: 'Estás en Trading: priorizo posición, precio y ejecución.',
    analytics: 'Estás en Análisis: priorizo rendimiento, métricas y consistencia.',
    aidata: 'Estás en Inteligencia: priorizo noticias, sesiones y señales.'
  }[page] || 'Estás en la plataforma principal: priorizo contexto operativo y riesgo.';
}

function buildAssistantStarters(page, positions, signal) {
  const current = positions?.current;
  const base = {
    dashboard: [
      '¿Debo mantener mi posición actual?',
      '¿La entrada está llegando tarde?',
      '¿Dónde está el riesgo más claro ahora?',
      '¿Qué invalidaría esta lectura?'
    ],
    analytics: [
      '¿Qué error se repite más en mi historial?',
      '¿Mi riesgo promedio está sano?',
      '¿Estoy cerrando demasiado pronto?',
      '¿Qué debería ajustar para mejorar consistencia?'
    ],
    aidata: [
      '¿Conviene entrar ahora?',
      '¿Qué significa esta noticia para BTC?',
      '¿La sesión activa favorece continuidad o reversión?',
      '¿Qué riesgo tengo en mi posición actual?'
    ]
  }[page] || [
    '¿Cuál es la mejor lectura del mercado ahora?',
    '¿Qué riesgo debería vigilar primero?',
    '¿Qué señal pesa más en este momento?',
    '¿Conviene operar o esperar?'
  ];

  const contextual = [];
  if (current?.symbol) contextual.push('¿Qué tan vulnerable está mi ' + current.side + ' en ' + current.symbol + '?');
  if (signal?.action && signal.action !== 'NO OPERAR') contextual.push('¿Qué tendría que pasar para invalidar el ' + signal.action + ' actual?');

  return [...new Set(contextual.concat(base))].slice(0, 4);
}

async function getSummary({ symbol = '', page = 'aidata' } = {}) {
  const [newsItems, performance, learningRows] = await Promise.all([
    fetchNews(),
    getPerformanceContext(symbol),
    getLearningContext(symbol)
  ]);

  const positions = getPositionContext(symbol);
  const news = newsItems.length ? newsItems : fallbackNews(symbol);
  const posture = computeBias(news, performance, positions);
  const sessions = buildSessions(news, performance, positions);
  const learning = buildLearning(learningRows);
  const signal = buildSignal(posture, sessions, news, positions, learning);
  const alerts = buildAlerts(news, sessions, positions, signal, learning);
  const insights = buildInsights(news, sessions, performance, positions, signal, learning);

  return {
    generatedAt: new Date().toISOString(),
    page,
    pageContext: pageContext(page),
    symbol: symbol || null,
    posture: {
      bias: posture.stance,
      confidence: posture.confidence,
      score: posture.score,
      summary: posture.stance === 'alcista'
        ? 'El tono general favorece continuidad compradora si la sesión activa confirma.'
        : posture.stance === 'bajista'
          ? 'El tono general es defensivo y exige respeto por riesgo de reversión o venta.'
          : 'El contexto está mixto. Mejor dejar que sesión y reacción del precio definan dirección.'
    },
    signal,
    alerts,
    learning,
    performance,
    positions,
    sessions,
    news,
    insights,
    assistantStarters: buildAssistantStarters(page, positions, signal)
  };
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatMoney(value, { signed = false, decimals = 2 } = {}) {
  const num = toNumber(value);
  if (num == null) return null;
  const prefix = signed ? (num >= 0 ? '+' : '-') : '';
  return prefix + '$' + Math.abs(num).toFixed(decimals);
}

function formatPrice(value) {
  const num = toNumber(value);
  if (num == null) return null;
  const decimals = Math.abs(num) >= 100 ? 2 : Math.abs(num) >= 1 ? 4 : 6;
  return '$' + num.toFixed(decimals);
}

function formatPct(value, digits = 2) {
  const num = toNumber(value);
  if (num == null) return null;
  return num.toFixed(digits) + '%';
}

function joinNatural(items) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return clean[0] + ' y ' + clean[1];
  return clean.slice(0, -1).join(', ') + ' y ' + clean[clean.length - 1];
}

function chooseVariant(seed, variants) {
  if (!variants.length) return '';
  const hash = crypto.createHash('md5').update(String(seed || 'aterum')).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % variants.length;
  return variants[index];
}

function inferIntent(question) {
  const q = String(question || '').toLowerCase();
  if (/(noticia|titular|btc|eth|macro|regula|sec|fed|cpi)/.test(q)) return 'news';
  if (/(riesgo|stop|posición|posicion|exposición|exposicion|peligro|pnl)/.test(q)) return 'risk';
  if (/(sesión|sesion|asia|europa|usa|volatilidad|liquidez)/.test(q)) return 'session';
  if (/(rendimiento|historial|racha|win rate|acierto|promedio|analytics|análisis|analisis)/.test(q)) return 'analytics';
  if (/(entrar|entrada|setup|comprar|vender|long|short|operar|ahora)/.test(q)) return 'entry';
  return 'overview';
}

function normalizeClientPosition(raw, fallbackSymbol = '') {
  if (!raw || typeof raw !== 'object') return null;
  const symbol = String(raw.symbol || raw.activo || fallbackSymbol || '').trim().toUpperCase();
  const side = String(raw.side || raw.direccion || raw.sentido || '').trim().toUpperCase();
  const normalized = {
    symbol,
    side: side === 'LONG' || side === 'SHORT' ? side : '',
    leverage: toNumber(raw.leverage ?? raw.apalancamiento) || 0,
    unrealized: toNumber(raw.unrealized ?? raw.pnl ?? raw.pnlAbierto ?? raw.pnl_actual),
    entryPrice: toNumber(raw.entryPrice ?? raw.entrada ?? raw.entry ?? raw.precioEntrada),
    markPrice: toNumber(raw.markPrice ?? raw.precioActual ?? raw.price ?? raw.ultimoPrecio),
    margin: toNumber(raw.margin ?? raw.margen ?? raw.invested ?? raw.invertido),
    stopLoss: toNumber(raw.stopLoss ?? raw.sl ?? raw.stop ?? raw.stop_loss),
    takeProfit: toNumber(raw.takeProfit ?? raw.tp ?? raw.objetivo ?? raw.take_profit),
    qty: toNumber(raw.qty ?? raw.cantidad ?? raw.size),
    invested: toNumber(raw.invested ?? raw.invertido),
    notional: toNumber(raw.notional ?? raw.nocional)
  };
  return normalized.symbol || normalized.side || normalized.entryPrice != null ? normalized : null;
}

function matchSession(sessions, rawSession) {
  if (!rawSession) return sessions.find(session => session.status === 'abierta') || sessions.find(session => session.status === 'próxima') || sessions[0] || null;
  const label = typeof rawSession === 'string'
    ? rawSession
    : (rawSession.id || rawSession.name || rawSession.nombre || rawSession.label || '');
  const normalized = String(label || '').trim().toLowerCase();
  return sessions.find(session =>
    session.id === normalized ||
    String(session.label || '').toLowerCase() === normalized ||
    String(session.subtitle || '').toLowerCase() === normalized
  ) || sessions.find(session => session.status === 'abierta') || sessions[0] || null;
}

function extractAssistantContext(summary, clientContext, symbol, page) {
  const rawContext = clientContext && typeof clientContext === 'object' ? clientContext : {};
  const rawPosition = rawContext.posicion || rawContext.position || rawContext.trade || null;
  const normalizedPosition = normalizeClientPosition(rawPosition, symbol);
  const summaryPosition = summary.positions?.current || null;
  const current = normalizedPosition ? { ...summaryPosition, ...normalizedPosition } : (summaryPosition ? { ...summaryPosition } : null);
  const livePrice = toNumber(
    rawContext.precioActual ??
    rawContext.price ??
    rawContext.ultimoPrecio ??
    rawContext.mercado?.precioActual ??
    current?.markPrice
  );
  const pnl = toNumber(
    rawContext.pnl ??
    rawContext.unrealized ??
    rawContext.pnlAbierto ??
    current?.unrealized ??
    rawContext.metricas?.pnlTotal
  );
  if (current && livePrice != null) current.markPrice = livePrice;
  if (current && pnl != null) current.unrealized = pnl;

  const news = Array.isArray(rawContext.noticias) && rawContext.noticias.length ? rawContext.noticias : (summary.news || []);
  const activeSession = matchSession(summary.sessions || [], rawContext.sesion || rawContext.session);
  const signal = {
    ...summary.signal,
    action: String(rawContext.senal?.accion || rawContext.signal?.action || summary.signal?.action || 'NO OPERAR').toUpperCase(),
    confidence: rawContext.senal?.confianza || rawContext.signal?.confidence || summary.signal?.confidence || 'baja',
    risk: rawContext.senal?.riesgo || rawContext.signal?.risk || summary.signal?.risk || 'alto'
  };

  const analytics = rawContext.metricas || rawContext.analitica || null;
  const market = rawContext.mercado || {};
  const effectiveSymbol = String(
    symbol ||
    rawContext.activo ||
    rawContext.symbol ||
    current?.symbol ||
    summary.symbol ||
    ''
  ).trim().toUpperCase();

  return {
    page,
    pageContext: summary.pageContext || pageContext(page),
    symbol: effectiveSymbol,
    posture: summary.posture,
    signal,
    alerts: summary.alerts || [],
    learning: summary.learning || { findings: [] },
    performance: summary.performance || {},
    positions: summary.positions || {},
    current,
    livePrice,
    pnl,
    news,
    topNews: news[0] || null,
    activeSession,
    sessions: summary.sessions || [],
    analytics,
    market,
    generatedAt: summary.generatedAt
  };
}

function distancePct(a, b) {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left == null || right == null || !left) return null;
  return Math.abs(left - right) / Math.abs(left) * 100;
}

function sentimentContradiction(postureBias, newsItem) {
  if (!newsItem) return false;
  return (
    (postureBias === 'alcista' && newsItem.sentiment === 'bajista') ||
    (postureBias === 'bajista' && newsItem.sentiment === 'alcista')
  );
}

function buildMarketSection(ctx, seed) {
  const asset = ctx.symbol || ctx.current?.symbol || 'el mercado';
  const session = ctx.activeSession;
  const bias = ctx.posture?.bias || 'neutral';
  const summary = ctx.posture?.summary || 'El contexto sigue mixto.';
  const topNews = ctx.topNews;
  const price = ctx.livePrice ? formatPrice(ctx.livePrice) : null;

  const sessionText = session
    ? chooseVariant(seed + ':session', [
      asset + ' está en lectura ' + bias + ' con la sesión de ' + session.label + ' ' + session.status + ' y volatilidad ' + session.volatility + '.',
      'La sesión de ' + session.label + ' está ' + session.status + ' y deja a ' + asset + ' en un entorno ' + bias + ' con volatilidad ' + session.volatility + '.',
      'Ahora mismo pesa más ' + session.label + ': la ventana está ' + session.status + ' y el sesgo operativo sigue ' + bias + '.'
    ])
    : chooseVariant(seed + ':nosession', [
      'No hay una sesión principal abierta y eso deja al mercado con confirmación limitada.',
      'La liquidez sigue más fina de lo ideal porque no hay una sesión dominante empujando dirección.',
      'El mercado está fuera de una ventana principal de liquidez, así que la dirección necesita más validación.'
    ]);

  const newsText = topNews
    ? chooseVariant(seed + ':news', [
      'El titular más pesado llega con sesgo ' + topNews.sentiment + ', impacto ' + topNews.impact + ' y afecta sobre todo a ' + joinNatural(topNews.affectedAssets || []) + '.',
      'La noticia que más influye ahora tiene tono ' + topNews.sentiment + ' e impacto ' + topNews.impact + ', así que no conviene leer el precio aislado del flujo informativo.',
      'El frente informativo viene marcado por una noticia ' + topNews.sentiment + ' de impacto ' + topNews.impact + ', con posible reacción sobre ' + joinNatural(topNews.affectedAssets || []) + '.'
    ])
    : 'No hay un titular dominante por encima del contexto interno de sesiones y posiciones.';

  const priceText = price
    ? chooseVariant(seed + ':price', [
      asset + ' cotiza cerca de ' + price + ' y ese nivel debe interpretarse junto con la sesión activa.',
      'El precio de referencia ronda ' + price + ', así que el timing importa más que una lectura aislada del sesgo.',
      'Con ' + asset + ' alrededor de ' + price + ', la reacción inmediata del precio vale más que anticiparse.'
    ])
    : summary;

  return {
    tone: bias === 'alcista' ? 'good' : bias === 'bajista' ? 'bad' : 'info',
    text: [sessionText, newsText, priceText].filter(Boolean).join(' ')
  };
}

function buildRiskSection(ctx, seed) {
  const current = ctx.current;
  const learningFinding = ctx.learning?.findings?.[0];
  const contradictoryNews = sentimentContradiction(ctx.posture?.bias, ctx.topNews);

  if (current) {
    const pnl = toNumber(current.unrealized ?? ctx.pnl) || 0;
    const leverage = toNumber(current.leverage) || 0;
    const stopGap = distancePct(ctx.livePrice || current.markPrice, current.stopLoss);
    const thesisAgainstPosition =
      (current.side === 'LONG' && ctx.signal.action === 'SHORT') ||
      (current.side === 'SHORT' && ctx.signal.action === 'LONG');

    const openingLine = chooseVariant(seed + ':risk-position', [
      'Tu posición ' + current.side + ' en ' + current.symbol + ' está en ' + formatMoney(pnl, { signed: true }) + ' y eso ya condiciona el margen de error.',
      current.symbol + ' mantiene una exposición ' + current.side + ' con PnL abierto de ' + formatMoney(pnl, { signed: true }) + '.',
      'La foto actual de riesgo está dominada por tu ' + current.side + ' en ' + current.symbol + ', que va ' + formatMoney(pnl, { signed: true }) + '.'
    ]);

    const riskDetails = [];
    if (pnl < 0 && leverage >= 5) riskDetails.push('El apalancamiento de ' + leverage + 'x amplifica cualquier desplazamiento adverso.');
    else if (pnl < 0) riskDetails.push('Seguir esperando sin confirmación puede ampliar la pérdida si el flujo no gira rápido.');
    else if (pnl > 0) riskDetails.push('Vas con ventaja abierta, pero devolver beneficio por sobreconfianza sigue siendo un riesgo real.');

    if (stopGap != null && stopGap <= 0.9) {
      riskDetails.push('El precio está relativamente cerca del stop, a unos ' + formatPct(stopGap, 2) + ' de distancia.');
    }
    if (contradictoryNews) {
      riskDetails.push('Hay una contradicción entre el sesgo general y la noticia dominante, así que el mercado puede girar más rápido de lo normal.');
    }
    if (thesisAgainstPosition) {
      riskDetails.push('La señal actual ya no acompaña del todo tu dirección abierta, así que defender capital pesa más que insistir.');
    }
    if (learningFinding && learningFinding.tone !== 'good') {
      riskDetails.push(learningFinding.title + '.');
    }

    return {
      tone: pnl < 0 || thesisAgainstPosition || contradictoryNews ? 'bad' : 'warn',
      text: [openingLine].concat(riskDetails).join(' ')
    };
  }

  const flatRisk = chooseVariant(seed + ':risk-flat', [
    'No hay una posición abierta que presione la cuenta, así que el mayor riesgo es entrar sin una ventaja realmente confirmada.',
    'Al estar plano, el riesgo principal no es la pérdida flotante sino forzar una operación en un contexto todavía incompleto.',
    'Sin exposición abierta, el peligro real es confundir ruido con confirmación y abrir tamaño antes de tiempo.'
  ]);

  const flatDetails = [];
  if (!ctx.activeSession || ctx.activeSession.status !== 'abierta') flatDetails.push('La liquidez todavía no está en su mejor momento.');
  if (contradictoryNews) flatDetails.push('Además, la noticia dominante contradice parte del sesgo actual.');
  if (learningFinding && learningFinding.tone !== 'good') flatDetails.push('Tu patrón reciente también sugiere más disciplina antes de ejecutar.');

  return {
    tone: contradictoryNews ? 'bad' : 'warn',
    text: [flatRisk].concat(flatDetails).join(' ')
  };
}

function buildRecommendationSection(ctx, intent, seed) {
  const current = ctx.current;
  const sessionOpen = ctx.activeSession && ctx.activeSession.status === 'abierta';
  const contradictoryNews = sentimentContradiction(ctx.posture?.bias, ctx.topNews);
  const analytics = ctx.analytics || {};

  if (ctx.page === 'analytics' && analytics.tradesAnalizados) {
    const winRate = toNumber(analytics.tasaAcierto ?? analytics.winRate);
    const avgR = toNumber(analytics.rPromedio ?? analytics.avgR);
    const pnlTotal = toNumber(analytics.pnlTotal);
    const pieces = [];
    if (winRate != null && winRate < 45) pieces.push('Reducir riesgo y filtrar más setups débiles antes de aumentar frecuencia.');
    if (avgR != null && avgR < 0.8) pieces.push('Dejar respirar mejor los trades válidos y evitar cierres prematuros.');
    if (pnlTotal != null && pnlTotal < 0) pieces.push('Priorizar estabilidad y revisar qué condiciones del mercado están deteriorando la ejecución.');
    if (!pieces.length) pieces.push('Mantener el proceso actual, pero con foco en repetir solo los setups que mejor convierten.');
    return {
      tone: winRate != null && winRate >= 55 && (avgR == null || avgR >= 1) ? 'good' : 'warn',
      text: chooseVariant(seed + ':analytics-reco', [
        'Desde Análisis, la prioridad es ' + pieces.join(' '),
        'Viendo tus métricas, mi ajuste principal sería: ' + pieces.join(' '),
        'La mejor decisión desde esta pantalla es ' + pieces.join(' ')
      ])
    };
  }

  if (current) {
    const pnl = toNumber(current.unrealized ?? ctx.pnl) || 0;
    if (pnl < 0 && (ctx.signal.action === 'NO OPERAR' || contradictoryNews)) {
      return {
        tone: 'bad',
        text: chooseVariant(seed + ':position-defend', [
          'No aumentaría exposición aquí. Primero necesito ver confirmación real o, si no aparece, priorizaría defensa y respeto por el stop.',
          'La recomendación ahora es proteger capital: nada de promediar ni perseguir una recuperación sin señal nueva.',
          'Mi lectura es defensiva: mantén disciplina, no agregues tamaño y deja que el mercado valide antes de insistir.'
        ])
      };
    }
    if (pnl > 0) {
      return {
        tone: 'good',
        text: chooseVariant(seed + ':position-manage', [
          'Mantendría la posición solo mientras conserve estructura y el stop siga intacto; el foco es administrar ventaja, no abrir más riesgo.',
          'La gestión manda más que una entrada nueva: protege parte del recorrido y evita convertir una ganancia en ruido.',
          'Puedes sostener la tesis, pero con ejecución fría: nada de ampliar tamaño si la sesión se vuelve errática.'
        ])
      };
    }
    return {
      tone: 'warn',
      text: 'Esperaría confirmación del flujo antes de tomar una decisión agresiva sobre la posición actual.'
    };
  }

  if (ctx.signal.action === 'LONG' && sessionOpen && !contradictoryNews) {
    return {
      tone: 'good',
      text: chooseVariant(seed + ':entry-long', [
        'Sí buscaría largos, pero solo con confirmación de continuación y sin comprar una vela extendida.',
        'La ventaja está del lado LONG, aunque la ejecución ideal sigue siendo después de confirmación y con tamaño contenido.',
        'Hay contexto para largos, siempre que la entrada nazca de confirmación y no de FOMO.'
      ])
    };
  }

  if (ctx.signal.action === 'SHORT' && sessionOpen && !contradictoryNews) {
    return {
      tone: 'bad',
      text: chooseVariant(seed + ':entry-short', [
        'Favorecería cortos, pero únicamente si el mercado sigue débil y el precio no ya viene demasiado extendido.',
        'La señal admite SHORT, aunque la entrada debe llegar con estructura clara y control de tamaño.',
        'La lectura sigue bajista; si operas, que sea en SHORT confirmado y no persiguiendo aceleración tardía.'
      ])
    };
  }

  if (intent === 'news' && ctx.topNews) {
    return {
      tone: 'warn',
      text: 'Mi recomendación es dejar que la noticia se traduzca primero en reacción de precio y volumen, especialmente si Europa o USA todavía no están empujando liquidez.'
    };
  }

  return {
    tone: 'warn',
    text: chooseVariant(seed + ':wait', [
      'Hoy prefiero no forzar entrada. La ventaja todavía no es lo bastante limpia como para justificar riesgo nuevo.',
      'La recomendación operativa es esperar: falta alineación completa entre sesión, precio y flujo informativo.',
      'No abriría una operación ahora mismo. Primero necesito una confirmación más clara del mercado.'
    ])
  };
}

function buildJustificationSection(ctx) {
  const current = ctx.current;
  const items = [
    'Sesgo ' + (ctx.posture?.bias || 'neutral') + ' con confianza ' + (ctx.posture?.confidence || 'baja') + ' y señal ' + (ctx.signal?.action || 'NO OPERAR') + '.'
  ];

  if (ctx.activeSession) {
    items.push('Sesión ' + ctx.activeSession.label + ' ' + ctx.activeSession.status + ': ' + ctx.activeSession.countdownLabel + ' con volatilidad ' + ctx.activeSession.volatility + '.');
  }

  if (ctx.topNews) {
    items.push('Noticia prioritaria: ' + ctx.topNews.title + ' (' + ctx.topNews.sentiment + ', impacto ' + ctx.topNews.impact + ').');
  } else {
    items.push('No hay noticia dominante por encima del contexto interno del sistema.');
  }

  if (current) {
    const pnl = formatMoney(current.unrealized ?? ctx.pnl, { signed: true });
    const entry = formatPrice(current.entryPrice);
    items.push('Posición actual: ' + current.symbol + ' ' + current.side + (entry ? ' desde ' + entry : '') + (pnl ? ' con ' + pnl : '') + '.');
  } else if (ctx.analytics?.tradesAnalizados) {
    items.push('Métricas activas: ' + ctx.analytics.tradesAnalizados + ' trades analizados y PnL total de ' + formatMoney(ctx.analytics.pnlTotal, { signed: true }) + '.');
  } else {
    items.push('No hay posición abierta, así que el timing de entrada pesa más que la gestión de una operación viva.');
  }

  if (ctx.learning?.findings?.[0]) {
    items.push('Patrón detectado: ' + ctx.learning.findings[0].title + '.');
  }

  return {
    tone: 'info',
    bullets: items.filter(Boolean).slice(0, 5)
  };
}

function buildHeadline(ctx, recommendationTone, seed) {
  if (ctx.current && toNumber(ctx.current.unrealized ?? ctx.pnl) < 0) {
    return chooseVariant(seed + ':headline-defensive', [
      'La prioridad ahora es defender capital antes que buscar más exposición.',
      'El mercado exige gestión de riesgo, no impulsividad.',
      'La operación necesita control y no más agresividad.'
    ]);
  }
  if (ctx.signal?.action === 'LONG' && recommendationTone === 'good') {
    return chooseVariant(seed + ':headline-long', [
      'Hay una ventana favorable, pero la entrada debe ser limpia.',
      'El contexto apoya continuidad, siempre que no persigas precio.',
      'La ventaja existe, aunque depende de ejecución disciplinada.'
    ]);
  }
  if (ctx.signal?.action === 'SHORT' && recommendationTone === 'bad') {
    return chooseVariant(seed + ':headline-short', [
      'El flujo sigue frágil y la defensa pesa más que el impulso.',
      'La lectura sigue débil, pero cualquier corto exige precisión.',
      'Hay presión bajista, aunque la ejecución debe ser quirúrgica.'
    ]);
  }
  return chooseVariant(seed + ':headline-neutral', [
    'La paciencia sigue teniendo más valor que la urgencia.',
    'Todavía no veo una ventaja limpia para acelerar.',
    'La mejor lectura ahora es operar con filtro y contexto.'
  ]);
}

function buildFollowUps(ctx, intent) {
  const items = [];
  if (ctx.current?.symbol) items.push('¿Qué invalidaría mi posición en ' + ctx.current.symbol + '?');
  if (ctx.topNews) items.push('¿Cómo cambia el plan si esa noticia se confirma?');
  if (ctx.activeSession) items.push('Resume la sesión de ' + ctx.activeSession.label + ' para mi setup');
  if (ctx.signal?.action && ctx.signal.action !== 'NO OPERAR') items.push('¿Qué tendría que pasar para cancelar la señal ' + ctx.signal.action + '?');
  if (intent !== 'analytics') items.push('¿Debo esperar o ejecutar ahora?');
  if (ctx.page === 'analytics') items.push('¿Qué patrón de error debo corregir primero?');
  return [...new Set(items)].slice(0, 3);
}

function buildDynamicAnswer(summary, question, symbol, page, clientContext) {
  const ctx = extractAssistantContext(summary, clientContext, symbol, page);
  const intent = inferIntent(question);
  const seed = [
    question,
    ctx.page,
    ctx.symbol,
    ctx.posture?.bias,
    ctx.signal?.action,
    ctx.activeSession?.id,
    ctx.topNews?.id,
    ctx.current?.side,
    ctx.current?.symbol,
    ctx.current?.entryPrice,
    ctx.current?.unrealized
  ].join('|');

  const marketSection = buildMarketSection(ctx, seed);
  const riskSection = buildRiskSection(ctx, seed);
  const recommendationSection = buildRecommendationSection(ctx, intent, seed);
  const justificationSection = buildJustificationSection(ctx);
  const headline = buildHeadline(ctx, recommendationSection.tone, seed);
  const contextLine = joinNatural([
    ctx.page === 'dashboard' ? 'Trading' : ctx.page === 'analytics' ? 'Análisis' : 'Inteligencia',
    ctx.symbol || null,
    ctx.activeSession ? 'sesión ' + ctx.activeSession.label : null
  ]);

  return {
    headline,
    stance: ctx.posture?.bias || 'neutral',
    confidence: ctx.signal?.confidence || 'baja',
    signal: ctx.signal?.action || 'NO OPERAR',
    risk: ctx.signal?.risk || 'alto',
    summary: marketSection.text,
    contextLine,
    reasons: justificationSection.bullets || [],
    actions: [recommendationSection.text],
    risks: [riskSection.text],
    sections: [
      { title: 'Estado del mercado', tone: marketSection.tone, text: marketSection.text },
      { title: 'Riesgo actual', tone: riskSection.tone, text: riskSection.text },
      { title: 'Recomendación', tone: recommendationSection.tone, text: recommendationSection.text },
      { title: 'Justificación', tone: justificationSection.tone, bullets: justificationSection.bullets || [] }
    ],
    followUps: buildFollowUps(ctx, intent)
  };
}

function compactModelContext(ctx) {
  const current = ctx.current ? {
    symbol: ctx.current.symbol || null,
    side: ctx.current.side || null,
    entryPrice: ctx.current.entryPrice || null,
    markPrice: ctx.current.markPrice || ctx.livePrice || null,
    unrealized: ctx.current.unrealized ?? ctx.pnl ?? null,
    leverage: ctx.current.leverage || null,
    margin: ctx.current.margin || null,
    stopLoss: ctx.current.stopLoss || null,
    takeProfit: ctx.current.takeProfit || null,
    qty: ctx.current.qty || null,
    invested: ctx.current.invested || null,
    notional: ctx.current.notional || null
  } : null;

  return {
    solicitudUtc: new Date().toISOString(),
    pagina: ctx.page,
    descripcionPagina: ctx.pageContext,
    activo: ctx.symbol || null,
    precioActual: ctx.livePrice || null,
    pnl: ctx.pnl ?? null,
    postura: ctx.posture ? {
      bias: ctx.posture.bias,
      confidence: ctx.posture.confidence,
      score: ctx.posture.score,
      summary: ctx.posture.summary
    } : null,
    senal: ctx.signal ? {
      action: ctx.signal.action,
      confidence: ctx.signal.confidence,
      risk: ctx.signal.risk,
      explanation: ctx.signal.explanation,
      drivers: ctx.signal.drivers || []
    } : null,
    posicion: current,
    sesion: ctx.activeSession ? {
      id: ctx.activeSession.id,
      label: ctx.activeSession.label,
      status: ctx.activeSession.status,
      countdown: ctx.activeSession.countdownLabel,
      volatility: ctx.activeSession.volatility,
      expectedDirection: ctx.activeSession.expectedDirection,
      typicalBehavior: ctx.activeSession.typicalBehavior,
      keyRisks: ctx.activeSession.keyRisks || []
    } : null,
    noticias: (ctx.news || []).slice(0, 3).map(item => ({
      title: item.title,
      summary: item.summary,
      sentiment: item.sentiment,
      impact: item.impact,
      urgency: item.urgency,
      affectedAssets: item.affectedAssets || [],
      reaction: item.reaction
    })),
    alertas: (ctx.alerts || []).slice(0, 3).map(item => ({
      level: item.level,
      title: item.title,
      detail: item.detail
    })),
    aprendizaje: (ctx.learning?.findings || []).slice(0, 3).map(item => ({
      tone: item.tone,
      title: item.title,
      detail: item.detail,
      recommendation: item.recommendation
    })),
    rendimiento: ctx.performance?.overall || null,
    metricasAnaliticas: ctx.analytics || null,
    mercado: ctx.market || null,
    generadoEn: ctx.generatedAt || null
  };
}

function formatList(items, formatter) {
  return (items || [])
    .map((item, index) => formatter(item, index))
    .filter(Boolean)
    .join('\n');
}

function formatPromptContext(promptContext) {
  const current = promptContext.posicion;
  const session = promptContext.sesion;
  const signal = promptContext.senal;
  const posture = promptContext.postura;
  const performance = promptContext.rendimiento || {};

  const sections = [
    'Momento de análisis: ' + (promptContext.solicitudUtc || 'sin hora'),
    'Página actual: ' + (promptContext.pagina || 'desconocida') + (promptContext.descripcionPagina ? ' | ' + promptContext.descripcionPagina : ''),
    'Activo foco: ' + (promptContext.activo || 'portafolio'),
    promptContext.precioActual != null ? 'Precio actual: ' + promptContext.precioActual : '',
    promptContext.pnl != null ? 'PnL abierto: ' + promptContext.pnl : '',
    posture ? 'Postura del mercado: ' + posture.bias + ' | confianza ' + posture.confidence + (posture.summary ? ' | ' + posture.summary : '') : '',
    signal ? 'Señal actual: ' + signal.action + ' | confianza ' + signal.confidence + ' | riesgo ' + signal.risk + (signal.explanation ? ' | ' + signal.explanation : '') : '',
    signal?.drivers?.length ? 'Drivers de señal: ' + signal.drivers.join(', ') : '',
    current ? [
      'Posición activa:',
      '- símbolo: ' + (current.symbol || 'sin símbolo'),
      '- dirección: ' + (current.side || 'sin dirección'),
      current.entryPrice != null ? '- entrada: ' + current.entryPrice : '',
      current.markPrice != null ? '- precio marca: ' + current.markPrice : '',
      current.unrealized != null ? '- pnl: ' + current.unrealized : '',
      current.leverage != null ? '- apalancamiento: ' + current.leverage + 'x' : '',
      current.margin != null ? '- margen: ' + current.margin : '',
      current.invested != null ? '- capital invertido: ' + current.invested : '',
      current.notional != null ? '- exposición nocional: ' + current.notional : '',
      current.stopLoss != null ? '- stop loss: ' + current.stopLoss : '',
      current.takeProfit != null ? '- take profit: ' + current.takeProfit : ''
    ].filter(Boolean).join('\n') : 'Posición activa: no hay posición viva.',
    session ? [
      'Sesión dominante:',
      '- etiqueta: ' + session.label,
      '- estado: ' + session.status,
      session.countdown ? '- contador: ' + session.countdown : '',
      session.volatility ? '- volatilidad esperada: ' + session.volatility : '',
      session.expectedDirection ? '- dirección esperada: ' + session.expectedDirection : '',
      session.typicalBehavior ? '- comportamiento típico: ' + session.typicalBehavior : '',
      session.keyRisks?.length ? '- riesgos de sesión: ' + session.keyRisks.join(', ') : ''
    ].filter(Boolean).join('\n') : 'Sesión dominante: sin una sesión principal definida.',
    promptContext.alertas?.length ? 'Alertas activas:\n' + formatList(promptContext.alertas, item =>
      '- [' + (item.level || 'media') + '] ' + (item.title || 'Alerta') + (item.detail ? ' | ' + item.detail : '')
    ) : 'Alertas activas: ninguna alerta dominante.',
    promptContext.noticias?.length ? 'Noticias relevantes:\n' + formatList(promptContext.noticias, item =>
      '- [' + (item.sentiment || 'neutral') + ' / impacto ' + (item.impact || 'bajo') + '] ' + (item.title || 'Titular') +
      (item.summary ? ' | ' + item.summary : '') +
      (item.reaction ? ' | reacción probable: ' + item.reaction : '')
    ) : 'Noticias relevantes: sin titulares prioritarios.',
    promptContext.aprendizaje?.length ? 'Patrones del usuario:\n' + formatList(promptContext.aprendizaje, item =>
      '- ' + (item.title || 'Patrón') +
      (item.detail ? ' | ' + item.detail : '') +
      (item.recommendation ? ' | ajuste sugerido: ' + item.recommendation : '')
    ) : 'Patrones del usuario: todavía sin hallazgos concluyentes.',
    performance ? [
      performance.tradeCount != null ? 'Trades cerrados analizados: ' + performance.tradeCount : '',
      performance.winRate != null ? 'Tasa de acierto histórica: ' + performance.winRate + '%' : '',
      performance.totalPnl != null ? 'PnL histórico acumulado: ' + performance.totalPnl : '',
      performance.avgR != null ? 'R promedio histórico: ' + performance.avgR : ''
    ].filter(Boolean).join('\n') : '',
    promptContext.metricasAnaliticas ? 'Métricas analíticas activas: ' + JSON.stringify(promptContext.metricasAnaliticas) : ''
  ];

  return sections.filter(Boolean).join('\n\n');
}

function normalizeConversationHistory(history) {
  return (Array.isArray(history) ? history : [])
    .map(entry => {
      const role = entry && entry.role === 'assistant' ? 'assistant' : 'user';
      const content = String(entry && entry.content != null ? entry.content : '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1800);
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-8);
}

function extractMessageText(message) {
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.output_text === 'string') return part.output_text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('La respuesta del modelo llegó vacía');
  return JSON.parse(raw);
}

function sanitizeTone(tone) {
  const normalized = String(tone || '').toLowerCase();
  if (['good', 'bad', 'warn', 'info'].includes(normalized)) return normalized;
  if (normalized === 'alcista') return 'good';
  if (normalized === 'bajista') return 'bad';
  if (normalized === 'neutral') return 'info';
  return 'info';
}

function sanitizeAnswerShape(answer) {
  if (!answer || typeof answer !== 'object') {
    throw new Error('La salida del modelo no llegó en formato JSON válido');
  }

  const requiredTitles = ['Estado del mercado', 'Riesgo actual', 'Recomendación', 'Justificación'];
  const sections = Array.isArray(answer.sections) ? answer.sections : [];
  if (sections.length !== 4) {
    throw new Error('El modelo no devolvió las 4 secciones requeridas');
  }

  const normalizedSections = requiredTitles.map((title, index) => {
    const section = sections[index] || {};
    if (String(section.title || '').trim() !== title) {
      throw new Error('El modelo devolvió secciones con un formato inesperado');
    }
    const text = section.text == null ? '' : String(section.text).trim();
    const bullets = Array.isArray(section.bullets)
      ? section.bullets.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [];

    if (title !== 'Justificación' && !text) {
      throw new Error('El modelo dejó una sección sin contenido');
    }
    if (title === 'Justificación' && !bullets.length && !text) {
      throw new Error('El modelo no justificó la recomendación');
    }

    return {
      title,
      tone: sanitizeTone(section.tone),
      ...(text ? { text } : {}),
      ...(bullets.length ? { bullets } : {})
    };
  });

  const followUps = Array.isArray(answer.followUps)
    ? answer.followUps.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : [];

  return {
    headline: String(answer.headline || '').trim(),
    stance: ['alcista', 'bajista', 'neutral'].includes(String(answer.stance || '').toLowerCase())
      ? String(answer.stance || '').toLowerCase()
      : (() => { throw new Error('El modelo no devolvió una postura válida'); })(),
    confidence: ['baja', 'media', 'alta'].includes(String(answer.confidence || '').toLowerCase())
      ? String(answer.confidence || '').toLowerCase()
      : (() => { throw new Error('El modelo no devolvió un nivel de confianza válido'); })(),
    signal: ['LONG', 'SHORT', 'NO OPERAR'].includes(String(answer.signal || '').toUpperCase())
      ? String(answer.signal || '').toUpperCase()
      : (() => { throw new Error('El modelo no devolvió una señal válida'); })(),
    risk: ['bajo', 'medio', 'alto'].includes(String(answer.risk || '').toLowerCase())
      ? String(answer.risk || '').toLowerCase()
      : (() => { throw new Error('El modelo no devolvió un riesgo válido'); })(),
    contextLine: String(answer.contextLine || '').trim(),
    sections: normalizedSections,
    followUps,
    summary: normalizedSections[0].text || '',
    reasons: normalizedSections[3].bullets || [],
    actions: normalizedSections[2].text ? [normalizedSections[2].text] : [],
    risks: normalizedSections[1].text ? [normalizedSections[1].text] : []
  };
}

function buildPrimaryMessages(question, promptContext, history) {
  return [
    {
      role: 'developer',
      content:
        'Eres un analista profesional de trading crypto y gestión de riesgo. ' +
        'Debes responder SIEMPRE en español y SIEMPRE en JSON válido. ' +
        'No inventes datos, no uses frases genéricas vacías y evita repetir wording, titulares o recomendaciones de turnos anteriores si el contexto o la pregunta cambiaron. ' +
        'Si el usuario hace seguimiento de una respuesta previa, mantén continuidad conversacional y profundiza en vez de reiniciar el análisis. ' +
        'Tu salida debe tener exactamente esta forma: ' +
        '{"headline":"string","stance":"alcista|bajista|neutral","confidence":"baja|media|alta","signal":"LONG|SHORT|NO OPERAR","risk":"bajo|medio|alto","contextLine":"string","sections":[{"title":"Estado del mercado","tone":"good|warn|bad|info","text":"string"},{"title":"Riesgo actual","tone":"good|warn|bad|info","text":"string"},{"title":"Recomendación","tone":"good|warn|bad|info","text":"string"},{"title":"Justificación","tone":"good|warn|bad|info","bullets":["string","string"]}],"followUps":["string","string","string"]}. ' +
        'Las sections deben venir exactamente en ese orden. ' +
        'No devuelvas markdown ni texto fuera del JSON.'
    },
    ...normalizeConversationHistory(history),
    {
      role: 'user',
      content:
        'Contexto operativo resumido:\n' + formatPromptContext(promptContext) + '\n\n' +
        'Pregunta actual del usuario:\n' + question + '\n\n' +
        'Responde como analista senior. Sé concreto con activo, sesión, noticia, posición, PnL y riesgo cuando estén disponibles. ' +
        'No copies literalmente la redacción de mensajes previos salvo que sea imprescindible para continuidad.'
    }
  ];
}

function buildRepairMessages(rawText) {
  return [
    {
      role: 'developer',
      content:
        'Convierte la respuesta recibida en JSON válido sin agregar texto extra. ' +
        'Debes devolver exactamente este esquema: ' +
        '{"headline":"string","stance":"alcista|bajista|neutral","confidence":"baja|media|alta","signal":"LONG|SHORT|NO OPERAR","risk":"bajo|medio|alto","contextLine":"string","sections":[{"title":"Estado del mercado","tone":"good|warn|bad|info","text":"string"},{"title":"Riesgo actual","tone":"good|warn|bad|info","text":"string"},{"title":"Recomendación","tone":"good|warn|bad|info","text":"string"},{"title":"Justificación","tone":"good|warn|bad|info","bullets":["string","string"]}],"followUps":["string","string","string"]}.'
    },
    {
      role: 'user',
      content: rawText
    }
  ];
}

async function requestModelJson(messages) {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: getAssistantModel(),
    response_format: { type: 'json_object' },
    messages
  });

  const text = extractMessageText(completion.choices?.[0]?.message);
  return {
    text,
    model: completion.model || getAssistantModel()
  };
}

async function generateAssistantAnswer(summary, question, symbol, page, clientContext, history) {
  const context = extractAssistantContext(summary, clientContext, symbol, page);
  const promptContext = compactModelContext(context);
  const primary = await requestModelJson(buildPrimaryMessages(question, promptContext, history));

  try {
    return {
      answer: sanitizeAnswerShape(parseJsonObject(primary.text)),
      model: primary.model
    };
  } catch (primaryError) {
    const repaired = await requestModelJson(buildRepairMessages(primary.text));
    return {
      answer: sanitizeAnswerShape(parseJsonObject(repaired.text)),
      model: repaired.model
    };
  }
}

async function answerQuestion({ question = '', symbol = '', page = 'aidata', context = {}, history = [] } = {}) {
  const summary = await getSummary({ symbol, page });
  const result = await generateAssistantAnswer(summary, question, symbol, page, context, history);
  return {
    question,
    context: {
      page,
      symbol: summary.symbol || symbol || context.activo || context.symbol || null,
      openPositions: summary.positions.openPositions,
      bias: summary.posture.bias,
      signal: summary.signal.action,
      currentSession: summary.sessions.find(session => session.status === 'abierta')?.label || null
    },
    historyUsed: normalizeConversationHistory(history).length,
    provider: 'openai',
    model: result.model,
    answer: result.answer,
    summary
  };
}

module.exports = {
  getSummary,
  answerQuestion
};
