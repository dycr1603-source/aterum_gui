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

module.exports = { escape, bold, code, number, money, percent, date, duration, parseJson, list, stripMarkdown };
