'use strict';

const SPECIAL = /([_\*\[\]\(\)~`>#+\-=|{}.!\\])/g;

function escape(value) {
  return String(value ?? '').replace(SPECIAL, '\\$1');
}

function bold(value) {
  return `*${escape(value)}*`;
}

function code(value) {
  return `\`${String(value ?? '').replace(/([`\\])/g, '\\$1')}\``;
}

function number(value, decimals = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(decimals) : 'N/D';
}

function money(value, signed = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'N/D';
  const sign = signed ? (parsed > 0 ? '+' : parsed < 0 ? '-' : '') : (parsed < 0 ? '-' : '');
  return `${sign}$${Math.abs(parsed).toFixed(2)}`;
}

function percent(value, signed = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'N/D';
  const sign = signed && parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(2)}%`;
}

function date(value) {
  if (!value) return 'N/D';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function duration(value) {
  const milliseconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function list(items, limit = 4) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return escape('Sin datos registrados');
  return values.slice(0, limit).map(item => `• ${escape(typeof item === 'string' ? item : item?.recommendation || item?.title || JSON.stringify(item))}`).join('\n');
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/\\([_\*\[\]\(\)~`>#+\-=|{}.!\\])/g, '$1')
    .replace(/\*/g, '')
    .replace(/`/g, '');
}

function bar(value, max = 10, filledChar = '█', emptyChar = '░') {
  const filled = Math.max(0, Math.min(Math.floor((Number(value) || 0) / (Number(max) || 1)), 10));
  return `${filledChar.repeat(filled)}${emptyChar.repeat(10 - filled)}`;
}

function progressBar(value, max = 100, showPercent = true) {
  const pct = Number(value) / Math.max(1, Number(max)) * 100;
  const filled = Math.max(0, Math.min(Math.floor(pct / 10), 10));
  const empty = 10 - filled;
  const pctStr = showPercent ? ` ${pct.toFixed(1)}%` : '';
  return `▓▓▓▓▓▓▓▓▓▓▓▓${pctStr} `;
}

function formatExecutionHeader(symbol, direction, sideEmoji) {
  const dir = String(direction || '').toUpperCase() || 'N/A';
  return `🔹 ${sideEmoji} ${dir} ${symbol}`;
}

function formatRiskPct(riskPct) {
  const p = Number(riskPct) || 0;
  const sign = p > 0 ? '+' : p < 0 ? '' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function formatErrorSnippet(error, maxLength = 200) {
  const msg = String(error || 'unknown');
  return msg.length > maxLength ? `${msg.slice(0, maxLength)}...` : msg;
}

function buildClosingBox(lines) {
  const maxLen = Math.max(...(lines.map(l => l.length)), 0);
  const border = '━'.repeat(maxLen + 4);
  return [`┏${border}┓`, ...lines, `┗${border}┛`].filter(Boolean);
}

function formatTradeSummary(symbol, direction, entry, sl, tp, qty, leverage, pnl = null) {
  const sideEmoji = (String(direction || '').toUpperCase() === 'LONG' ? '🟢' : '🔴');
  const lines = [
    `🔹 ${sideEmoji} ${direction} ${symbol}`,
    `   Entrada: $${Number(entry).toFixed(2)}`,
    `   Stop:   $${Number(sl).toFixed(2)}`,
    `   TP:     $${Number(tp).toFixed(2)}`,
    `   Cant.: ${Number(qty).toFixed(6)}`,
    `   Lev:   ${Number(leverage)}x`,
    pnl !== null ? `   PnL:   ${Number(pnl).toFixed(2)} USDT` : ''
  ].filter(l => l.trim()).join('\n');
  return lines;
}

function formatBalanceUsage(balance, usedPct) {
  const used = Number(balance) * Number(usedPct) / 100;
  const barText = bar(used, Number(balance));
  return `💰 Balance: $${Number(balance).toFixed(2)}\n📊 Uso: ${barText} ${usedPct}%`;
}

module.exports = { escape, bold, code, number, money, percent, date, duration, parseJson, list, stripMarkdown, bar, progressBar, formatExecutionHeader, formatRiskPct, formatErrorSnippet, buildClosingBox, formatTradeSummary, formatBalanceUsage };
