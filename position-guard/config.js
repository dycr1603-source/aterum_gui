'use strict';

function secret(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  return /^change_me/i.test(value) ? '' : value;
}

module.exports = {
  apiKey: secret('POSITION_GUARD_BINANCE_API_KEY', process.env.BINANCE_API_KEY),
  apiSecret: secret('POSITION_GUARD_BINANCE_API_SECRET', process.env.BINANCE_API_SECRET),
  telegramToken: secret('TELEGRAM_BOT_TOKEN'),
  telegramChatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
  dashboardBase: String(process.env.INTERNAL_DASHBOARD_BASE || 'http://dashboard:3001').replace(/\/$/, ''),
  chartBase: String(process.env.INTERNAL_CHART_BASE || 'http://dashboard:3000').replace(/\/$/, ''),
  n8nBase: String(process.env.INTERNAL_N8N_BASE || 'http://dashboard:5678').replace(/\/$/, ''),
  n8nDatabase: process.env.N8N_SQLITE_DB || '/n8n-data/database.sqlite',
  pollMs: Math.max(1000, Number(process.env.POSITION_GUARD_POLL_MS || 5000)),
  unprotectedGraceMs: Math.max(10000, Number(process.env.POSITION_GUARD_UNPROTECTED_GRACE_MS || 60000)),
  healthMs: Math.max(30000, Number(process.env.POSITION_GUARD_HEALTH_MS || 60000)),
  alertCooldownMs: Math.max(60000, Number(process.env.POSITION_GUARD_ALERT_COOLDOWN_MS || 300000)),
  enforce: String(process.env.POSITION_GUARD_ENFORCE || 'true').toLowerCase() === 'true',
  port: Number(process.env.POSITION_GUARD_PORT || 3091),
  executionToken: secret('EXECUTION_ENGINE_TOKEN'),
  portfolioMaxRiskPct: Number(process.env.PORTFOLIO_MAX_RISK_PCT || 5),
  portfolioMaxMarginUsagePct: Number(process.env.PORTFOLIO_MAX_MARGIN_USAGE_PCT || 90),
  portfolioMinFreeMarginPct: Number(process.env.PORTFOLIO_MIN_FREE_MARGIN_PCT || 10),
  portfolioMaxExposurePct: Number(process.env.PORTFOLIO_MAX_EXPOSURE_PCT || 500),
  portfolioMaxSymbolExposurePct: Number(process.env.PORTFOLIO_MAX_SYMBOL_EXPOSURE_PCT || 150),
  portfolioMaxDirectionExposurePct: Number(process.env.PORTFOLIO_MAX_DIRECTION_EXPOSURE_PCT || 400),
  portfolioPlanningRiskPct: Number(process.env.PORTFOLIO_PLANNING_RISK_PCT || 1),
  portfolioPlanningMarginPct: Number(process.env.PORTFOLIO_PLANNING_MARGIN_PCT || 20),
  portfolioMinimumTradeRiskPct: Number(process.env.PORTFOLIO_MINIMUM_TRADE_RISK_PCT || 0.5),
  portfolioMinimumTradeMargin: Number(process.env.PORTFOLIO_MINIMUM_TRADE_MARGIN || 5),
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
