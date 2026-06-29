'use strict';

const http = require('http');
const config = require('./config');
const f = require('./format');
const { ApiClient } = require('./api');
const { AuditStore } = require('./audit');
const { TelegramClient, keyboardFor } = require('./telegram');
const { createCommands } = require('./commands');
const knowledge = require('./knowledge');

const KNOWN_COMMANDS = new Set([
  'start','help','guide','tutorial','menu','new','status','balance','positions','performance','research','learning',
  'health','logs','news','ai','context','ask','why','history','changes','simulate','simulator','scan','rebuild-report',
  'rebuild_report','users','role','enable','disable'
]);

function identity(update) {
  const message = update.message || update.callback_query?.message || {};
  const user = update.message?.from || update.callback_query?.from || {};
  const chat = message.chat || {};
  return {
    chatId: String(chat.id || ''),
    chatType: chat.type || null,
    groupName: chat.title || null,
    userId: String(user.id || ''),
    username: user.username || null,
    firstName: user.first_name || null,
    displayName: user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(' ') || 'usuario',
    messageId: message.message_id || null
  };
}

function commandFrom(update, botUsername = '') {
  const data = String(update.callback_query?.data || '');
  if (data.startsWith('command:')) return { command: data.slice('command:'.length), args: [], source: 'callback' };
  if (data.startsWith('evidence:')) return { command: 'evidence', args: [data.slice('evidence:'.length)], source: 'callback' };
  if (data.startsWith('help:')) return { command: 'help', args: [data.slice('help:'.length)], source: 'callback' };
  if (data.startsWith('guide:')) return { command: 'guide', args: [data.slice('guide:'.length)], source: 'callback' };
  if (data.startsWith('context:')) {
    const [, mode, topic] = data.split(':');
    return { command: 'explain', args: [mode, topic], source: 'callback' };
  }
  if (data === 'nav:home' || data === 'nav:back') return { command: data, args: [], source: 'callback' };

  const text = String(update.message?.text || '').trim();
  if (!text) return null;
  const parts = text.split(/\s+/);
  if (parts[0].startsWith('/')) {
    return { command: parts[0].slice(1).split('@')[0].toLowerCase(), args: parts.slice(1), source: 'message' };
  }
  const mention = `@${String(botUsername || '').replace(/^@/, '')}`.toLowerCase();
  if (mention !== '@' && parts[0].toLowerCase() === mention && parts[1]) {
    const candidate = parts[1].replace(/^\//, '').toLowerCase();
    if (KNOWN_COMMANDS.has(candidate)) return { command: candidate, args: parts.slice(2), source: 'mention' };
    return { command: 'ask', args: parts.slice(1), source: 'mention' };
  }
  const chatType = update.message?.chat?.type;
  const replyingToBot = String(update.message?.reply_to_message?.from?.username || '').toLowerCase() === String(botUsername || '').toLowerCase();
  if (chatType === 'private' || replyingToBot) return { command: 'ask', args: parts, source: 'conversation' };
  return null;
}

function chatAuthorized(configValue, actor) {
  return configValue.allowedChatIds.size > 0 && configValue.allowedChatIds.has(actor.chatId);
}

function mention(actor) {
  return `[${f.escape(actor.displayName)}](tg://user?id=${actor.userId})`;
}

function directSources(command) {
  const map = {
    status: ['mysql:ping', 'redis:PING', 'external:Binance', 'external:Telegram'],
    health: ['mysql:ping', 'redis:PING', 'external:Binance', 'external:Telegram'],
    logs: ['mysql:events', 'n8n-sqlite:execution_entity'],
    scan: ['mysql:scan_events'], simulator: ['n8n-sqlite:workflow_entity'],
    users: ['mysql:telegram_users'], role: ['mysql:telegram_users'],
    enable: ['mysql:telegram_users'], disable: ['mysql:telegram_users']
  };
  return map[command] || [];
}

async function main() {
  if (!config.token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!config.allowedChatIds.size) throw new Error('TELEGRAM_CHAT_ID or TELEGRAM_ALLOWED_CHAT_IDS is required');

  const api = new ApiClient(config);
  const audit = new AuditStore(config);
  const telegram = new TelegramClient(config);
  const deps = { config, api, audit, telegram };
  const commands = createCommands(deps);
  const navigation = new Map();
  const runtime = { ready: false, bot: null, lastPollAt: null, lastUpdateAt: null, lastError: null, startedAt: new Date().toISOString() };

  await audit.initialize();
  await audit.bootstrapAdmins([...config.allowedUserIds]);
  runtime.bot = await telegram.getMe();
  const webhook = await telegram.getWebhookInfo();
  if (webhook.url) throw new Error(`Telegram webhook is active at ${webhook.url}; long polling was not started`);
  await telegram.setCommands();
  let offset = (await audit.lastUpdateId()) + 1;
  runtime.ready = true;

  const server = http.createServer((req, res) => {
    if (req.url !== '/healthz') { res.writeHead(404); return res.end('not found'); }
    const healthy = runtime.ready && (!runtime.lastPollAt || Date.now() - runtime.lastPollAt < (config.pollTimeout + 45) * 1000);
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: healthy, service: 'aterum-telegram-control', bot: runtime.bot?.username || null,
      startedAt: runtime.startedAt, lastPollAt: runtime.lastPollAt, lastUpdateAt: runtime.lastUpdateAt, lastError: runtime.lastError
    }));
  });
  server.listen(config.port, '0.0.0.0');

  async function processUpdate(update) {
    let parsed = commandFrom(update, runtime.bot?.username);
    if (!parsed) return;
    const actor = identity(update);
    const started = Date.now();
    if (update.callback_query?.id) await telegram.answerCallbackQuery(update.callback_query.id);

    if (!chatAuthorized(config, actor)) {
      const response = '⛔ Acceso no autorizado para este chat\.';
      await telegram.send(actor.chatId, response, { menu: false, replyTo: actor.messageId }).catch(() => null);
      await audit.record({ updateId: update.update_id, ...actor, command: parsed.command, response, durationMs: Date.now() - started, result: 'unauthorized', errors: 'chat_not_allowed' });
      return;
    }

    const user = await audit.getOrCreateUser(actor);
    const context = { ...actor, role: user?.role || 'viewer', enabled: Boolean(user?.enabled) };
    const navKey = `${actor.chatId}:${actor.userId}`;
    const stack = navigation.get(navKey) || [];
    if (parsed.command === 'nav:home') {
      stack.length = 0;
      parsed = { command: 'start', args: [], source: 'callback' };
    } else if (parsed.command === 'nav:back') {
      stack.pop();
      parsed = stack.pop() || { command: 'start', args: [], source: 'callback' };
    }
    stack.push({ command: parsed.command, args: parsed.args });
    navigation.set(navKey, stack.slice(-12));

    api.startTrace();
    let response = '';
    let result = 'ok';
    let errorText = null;
    try {
      if (!context.enabled) throw new Error('Usuario deshabilitado');
      if (parsed.command === 'ask') {
        const intent = knowledge.commandIntent(parsed.args.join(' '));
        if (intent) parsed = typeof intent === 'string'
          ? { ...parsed, command: intent, args: [] }
          : { ...parsed, command: intent.command, args: intent.args || [] };
      }
      if (!commands.allowed(context.role, parsed.command)) throw new Error(`Permiso insuficiente para /${parsed.command}`);
      response = await commands.execute(parsed.command, parsed.args, context);
      response = `${mention(actor)}\n\n${response}`;
      const replyMarkup = keyboardFor(parsed.command, parsed.args);
      if (parsed.source === 'callback' && actor.messageId) {
        await telegram.edit(actor.chatId, actor.messageId, response, replyMarkup);
      } else {
        await telegram.send(actor.chatId, response, { replyTo: actor.messageId, replyMarkup, menu: false });
      }
      runtime.lastUpdateAt = new Date().toISOString();
      if (parsed.command !== 'ask') await audit.recordLocalRoute(actor.userId, parsed.command, Date.now() - started, response);
    } catch (error) {
      result = /Permiso insuficiente|deshabilitado/i.test(error.message) ? 'denied' : 'error';
      errorText = error.message;
      response = `${mention(actor)}\n\n🔴 *ERROR*\n\n${f.escape(error.message || error)}`;
      const replyMarkup = keyboardFor(parsed.command, parsed.args);
      if (parsed.source === 'callback' && actor.messageId) await telegram.edit(actor.chatId, actor.messageId, response, replyMarkup).catch(() => null);
      else await telegram.send(actor.chatId, response, { replyTo: actor.messageId, replyMarkup, menu: false }).catch(() => null);
      runtime.lastError = error.message;
    }
    const endpointsUsed = [...new Set([...api.consumeTrace(), ...directSources(parsed.command)])];
    await audit.record({
      updateId: update.update_id, ...actor, role: context.role, command: parsed.command,
      response, durationMs: Date.now() - started, result, endpointsUsed, errors: errorText
    });
  }

  let stopping = false;
  const stop = async signal => {
    if (stopping) return;
    stopping = true;
    runtime.ready = false;
    console.log(`[Telegram Control] ${signal}, stopping`);
    server.close();
    await audit.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  console.log(`[Telegram Control] @${runtime.bot.username} ready; multi-user RBAC enabled`);
  while (!stopping) {
    try {
      const updates = await telegram.getUpdates(offset);
      runtime.lastPollAt = Date.now();
      runtime.lastError = null;
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id) + 1);
        await processUpdate(update);
      }
    } catch (error) {
      runtime.lastError = error.message;
      console.error('[Telegram Control] poll:', error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Telegram Control] fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { main, identity, commandFrom, chatAuthorized };
