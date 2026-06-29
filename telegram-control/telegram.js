'use strict';

const f = require('./format');

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: '📊 Estado', callback_data: 'command:status' }, { text: '📈 Performance', callback_data: 'command:performance' }],
    [{ text: '🧠 Research', callback_data: 'command:research' }, { text: '🧬 Learning', callback_data: 'command:learning' }],
    [{ text: '🕘 Historial', callback_data: 'command:history' }, { text: '🧩 Cambios', callback_data: 'command:changes' }],
    [{ text: '📰 Noticias', callback_data: 'command:news' }, { text: '⚙ Sistema', callback_data: 'command:health' }],
    [{ text: '💬 Copiloto', callback_data: 'help:copilot' }, { text: '❓ Ayuda', callback_data: 'command:help' }]
  ]
};

function navigationKeyboard(command, args = []) {
  const rows = [];
  if (command === 'why' && args[0]) rows.push([{ text: '🧾 Ver Evidencia', callback_data: `evidence:${String(args[0]).toUpperCase()}` }]);
  if (!['help', 'start', 'guide', 'tutorial', 'menu', 'new', 'explain'].includes(command)) {
    rows.push([
      { text: '¿Qué significa?', callback_data: `context:meaning:${command}` },
      { text: 'Más información', callback_data: `context:more:${command}` }
    ]);
    rows.push([
      { text: 'Ver evidencia', callback_data: `context:evidence:${command}` },
      { text: 'Cómo funciona', callback_data: `context:how:${command}` }
    ]);
  }
  rows.push([{ text: '⬅️ Atrás', callback_data: 'nav:back' }, { text: '🏠 Inicio', callback_data: 'nav:home' }]);
  return { inline_keyboard: rows };
}

const HELP_MENU = {
  inline_keyboard: [
    [{ text: '📊 Monitoreo', callback_data: 'help:monitoring' }, { text: '🧠 Inteligencia', callback_data: 'help:intelligence' }],
    [{ text: '🧾 Evidencia', callback_data: 'help:evidence' }, { text: '💬 Copiloto', callback_data: 'help:copilot' }],
    [{ text: '🛡 Operación', callback_data: 'help:admin' }],
    [{ text: '🧭 Guía', callback_data: 'guide:1' }, { text: '🎓 Tutorial', callback_data: 'command:tutorial' }],
    [{ text: '🏠 Inicio', callback_data: 'nav:home' }]
  ]
};

function guideKeyboard(step) {
  const current = Math.max(1, Math.min(6, Number(step) || 1));
  const row = [];
  if (current > 1) row.push({ text: '⬅️ Anterior', callback_data: `guide:${current - 1}` });
  if (current < 6) row.push({ text: 'Siguiente ➡️', callback_data: `guide:${current + 1}` });
  return { inline_keyboard: [row, [{ text: '🏠 Inicio', callback_data: 'nav:home' }]].filter(items => items.length) };
}

function keyboardFor(command, args = []) {
  if (command === 'help') return HELP_MENU;
  if (command === 'guide') return guideKeyboard(args[0]);
  if (command === 'start' || command === 'menu') return MAIN_MENU;
  return navigationKeyboard(command, args);
}

class TelegramClient {
  constructor(config) {
    this.config = config;
    this.base = `https://api.telegram.org/bot${config.token}`;
  }

  async call(method, payload = {}, timeoutMs = this.config.requestTimeoutMs) {
    const response = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.description || `Telegram HTTP ${response.status}`);
    return body.result;
  }

  getMe() { return this.call('getMe'); }
  getWebhookInfo() { return this.call('getWebhookInfo'); }
  getUpdates(offset) {
    return this.call('getUpdates', {
      offset,
      timeout: this.config.pollTimeout,
      allowed_updates: ['message', 'callback_query']
    }, (this.config.pollTimeout + 10) * 1000);
  }

  answerCallbackQuery(id) {
    return this.call('answerCallbackQuery', { callback_query_id: id }).catch(() => null);
  }

  setCommands() {
    const descriptions = {
      start: 'Abrir el centro de control', help: 'Ayuda por categorías', guide: 'Guía interactiva', tutorial: 'Ejemplos de uso',
      menu: 'Abrir navegación', new: 'Últimos cambios reales', status: 'Estado general', balance: 'Balance y PnL',
      positions: 'Posiciones abiertas', performance: 'Performance', research: 'Último Research', learning: 'Learning Engine',
      health: 'Salud de servicios', logs: 'Eventos importantes', news: 'Noticias', ai: 'Uso y ahorro de IA',
      context: 'Contexto Intelligence', ask: 'Preguntar al Copiloto',
      why: 'Explicar decisión por símbolo', history: 'Historial por símbolo', changes: 'Cambios del sistema',
      simulate: 'Simulación read-only (moderator)', scan: 'Scans persistidos (moderator)',
      rebuild_report: 'Recomponer reporte (moderator)', users: 'Usuarios y roles (admin)'
    };
    return this.call('setMyCommands', {
      commands: Object.entries(descriptions).map(([command, description]) => ({ command, description }))
    });
  }

  async send(chatId, text, options = {}) {
    const chunks = splitMessage(text);
    const results = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const payload = {
        chat_id: chatId,
        text: chunks[index],
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      };
      if (options.disableNotification) payload.disable_notification = true;
      if (options.replyTo) payload.reply_parameters = { message_id: options.replyTo, allow_sending_without_reply: true };
      if (index === chunks.length - 1 && options.replyMarkup) payload.reply_markup = options.replyMarkup;
      else if (index === chunks.length - 1 && options.menu !== false) payload.reply_markup = MAIN_MENU;
      try {
        results.push(await this.call('sendMessage', payload));
      } catch (error) {
        if (!/parse entities/i.test(error.message)) throw error;
        delete payload.parse_mode;
        payload.text = f.stripMarkdown(chunks[index]);
        results.push(await this.call('sendMessage', payload));
      }
    }
    return results;
  }

  async edit(chatId, messageId, text, replyMarkup) {
    if (String(text).length > 3800) return this.send(chatId, text, { replyMarkup });
    try {
      return await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: replyMarkup
      });
    } catch (error) {
      if (/message is not modified/i.test(error.message)) return null;
      if (!/parse entities/i.test(error.message)) throw error;
      return this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: f.stripMarkdown(text),
        disable_web_page_preview: true,
        reply_markup: replyMarkup
      });
    }
  }
}

function splitMessage(text, maxLength = 3800) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let current = '';
  for (let line of lines) {
    if (line.length > maxLength) {
      if (current) { chunks.push(current); current = ''; }
      while (line.length > maxLength) {
        chunks.push(line.slice(0, maxLength));
        line = line.slice(maxLength);
      }
      current = line;
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['Sin datos'];
}

module.exports = { TelegramClient, MAIN_MENU, HELP_MENU, navigationKeyboard, guideKeyboard, keyboardFor, splitMessage };
