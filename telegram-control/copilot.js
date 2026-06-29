'use strict';

const crypto = require('crypto');
const f = require('./format');
const knowledge = require('./knowledge');

function compact(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > 500 ? text.slice(0, 499) + '…' : text;
  }
  if (depth > 3) return '[resumido]';
  if (Array.isArray(value)) return value.slice(0, 5).map(item => compact(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (/image|binary|html|stack|token|secret|password/i.test(key)) continue;
    output[key] = compact(item, depth + 1);
  }
  return output;
}

function estimateTokens(value) { return Math.max(1, Math.ceil(String(value || '').length / 4)); }

function keyFor(question) {
  return crypto.createHash('sha256').update(knowledge.normalize(question)).digest('hex');
}

function createCopilot({ config, api, audit }) {
  async function contextFor(question) {
    const text = knowledge.normalize(question);
    const sources = {};
    const jobs = [];
    const add = (name, promise) => jobs.push(Promise.resolve(promise).then(value => { sources[name] = compact(value); }));

    if (/simul/.test(text)) add('simulator', api.simulatorReport());
    if (/noticia|macro|intelligence|mercado/.test(text)) add('intelligence', api.intelligence());
    if (/research|recomend|riesgo|oportunidad/.test(text)) {
      add('research_summary', api.researchSummary());
      add('research_latest', api.latestReport());
      add('recommendations', api.recommendations(12));
      add('recommendation_performance', api.recommendationsPerformance());
    }
    if (/learning|regla|cambio|capital|guard|drawdown|racha/.test(text)) {
      add('learning_summary', api.learningSummary());
      add('learning_rules', api.learningRules());
      add('learning_changes', api.learningChanges(12));
    }
    if (/trade|operacion|posicion|pnl|profit|expect|win rate|symbol|usdt|rechaz|post trade/.test(text)) {
      add('trades_stats', api.stats());
      add('post_trade', api.aiData(30, 90));
      add('learning_decisions', api.learningDecisions(40));
    }
    if (!jobs.length) {
      add('research_summary', api.researchSummary());
      add('learning_summary', api.learningSummary());
      add('trades_stats', api.stats());
    }
    await Promise.all(jobs);
    let serialized = JSON.stringify(sources);
    if (serialized.length > config.aiMaxInputChars) {
      serialized = JSON.stringify({ context_excerpt: serialized.slice(0, config.aiMaxInputChars - 100), truncated: true });
    }
    return serialized;
  }

  async function callClaude(question, context) {
    if (!config.anthropicConfigured) throw new Error('Claude no está configurado. Define una ANTHROPIC_API_KEY válida para consultas de razonamiento.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.anthropicApiKey
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: config.aiMaxTokens,
        temperature: 0.1,
        system: 'Eres el copiloto read-only de Aterum. Responde en español, de forma breve y verificable. Usa únicamente el JSON dado. Distingue hechos de inferencias, menciona las fuentes por nombre y escribe N/D cuando falte evidencia. No propongas ejecutar órdenes ni cambiar trading, Research, Learning o n8n.',
        messages: [{ role: 'user', content: `Pregunta: ${question}\n\nContexto mínimo real:\n${context}` }]
      }),
      signal: AbortSignal.timeout(config.requestTimeoutMs + 15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Anthropic HTTP ${response.status}`);
    return {
      text: (body.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim(),
      inputTokens: Number(body.usage?.input_tokens || 0),
      outputTokens: Number(body.usage?.output_tokens || 0)
    };
  }

  async function answer(question, actor = {}) {
    const started = Date.now();
    const clean = String(question || '').trim();
    if (!clean) throw new Error('Escribe una pregunta después de /ask.');
    const local = knowledge.answer(clean);
    const baseline = estimateTokens(clean) + 900;
    if (local) {
      await audit.recordAiUsage({ userId: actor.userId, questionHash: keyFor(clean), route: 'knowledge', estimatedTokens: baseline, savedTokens: baseline, durationMs: Date.now() - started });
      return local;
    }

    const hash = keyFor(clean);
    const cached = await audit.getAiCache(hash);
    if (cached) {
      await audit.recordAiUsage({ userId: actor.userId, questionHash: hash, route: 'cache', estimatedTokens: baseline, savedTokens: baseline, durationMs: Date.now() - started, cacheHit: true, model: cached.model });
      return `🧠 ${f.bold('COPILOTO ATERUM')}\n\n${f.escape(cached.response)}\n\n${f.escape('Respuesta cacheada; no se consumieron tokens nuevos.')}`;
    }

    const context = await contextFor(clean);
    const result = await callClaude(clean, context);
    const estimated = estimateTokens(clean) + estimateTokens(context) + config.aiMaxTokens;
    await audit.setAiCache(hash, clean, result.text, config.anthropicModel, config.aiCacheTtlSeconds);
    await audit.recordAiUsage({
      userId: actor.userId, questionHash: hash, route: 'claude', estimatedTokens: estimated,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      savedTokens: Math.max(0, estimated - result.inputTokens - result.outputTokens),
      durationMs: Date.now() - started, model: config.anthropicModel
    });
    return `🧠 ${f.bold('COPILOTO ATERUM')}\n\n${f.escape(result.text)}\n\n${f.escape(`Claude usado: ${config.anthropicModel} · contexto compacto ${estimateTokens(context)} tokens estimados.`)}`;
  }

  return { answer };
}

module.exports = { createCopilot, compact, estimateTokens, keyFor };
