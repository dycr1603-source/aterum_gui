'use strict';

function list(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const primaryChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
const anthropicApiKey = String(process.env.TELEGRAM_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '').trim();

module.exports = {
  token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  allowedChatIds: new Set([...list(process.env.TELEGRAM_ALLOWED_CHAT_IDS), primaryChatId].filter(Boolean)),
  allowedUserIds: new Set(list(process.env.TELEGRAM_ALLOWED_USER_IDS)),
  dashboardBase: String(process.env.INTERNAL_DASHBOARD_BASE || 'http://dashboard:3001').replace(/\/$/, ''),
  n8nBase: String(process.env.INTERNAL_N8N_BASE || 'http://dashboard:5678').replace(/\/$/, ''),
  port: Number(process.env.TELEGRAM_CONTROL_PORT || 3090),
  pollTimeout: Math.max(5, Math.min(50, Number(process.env.TELEGRAM_POLL_TIMEOUT || 25))),
  requestTimeoutMs: Math.max(1000, Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS || 12000)),
  n8nDatabase: process.env.N8N_SQLITE_DB || '/n8n-data/database.sqlite',
  tradingWorkflowId: process.env.N8N_TRADING_WORKFLOW_ID || '',
  anthropicConfigured: Boolean(anthropicApiKey && !/^(change_me|replace_me|example)/i.test(anthropicApiKey)),
  anthropicApiKey,
  anthropicModel: String(process.env.TELEGRAM_CLAUDE_MODEL || 'claude-haiku-4-5-20251001').trim(),
  aiCacheTtlSeconds: Math.max(30, Number(process.env.TELEGRAM_AI_CACHE_TTL_SECONDS || 300)),
  aiMaxInputChars: Math.max(2000, Number(process.env.TELEGRAM_AI_MAX_INPUT_CHARS || 3000)),
  aiMaxTokens: Math.max(128, Math.min(1200, Number(process.env.TELEGRAM_AI_MAX_TOKENS || 400))),
  changelogPath: process.env.TELEGRAM_CHANGELOG_PATH || '/app/bot-control/CHANGELOG.md',
  db: {
    host: process.env.DB_HOST || 'mysql',
    user: process.env.DB_USER || 'tradingbot',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'trading_bot',
    connectionLimit: 4,
    timezone: process.env.DB_TIMEZONE || '+00:00'
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || ''
  }
};
