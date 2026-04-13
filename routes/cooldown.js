'use strict';

const express = require('express');
const router = express.Router();
const shared = require('../shared');

const { symbolCooldowns } = shared;

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function resolveCooldownEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'number') {
    return { expiresAt: entry, minutes: null };
  }
  if (typeof entry === 'object') {
    return {
      expiresAt: Number(entry.expiresAt) || 0,
      minutes: entry.minutes != null ? Number(entry.minutes) : null
    };
  }
  return null;
}

function setCooldown(symbol, minutes) {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  const expiresAt = Date.now() + safeMinutes * 60 * 1000;
  symbolCooldowns[symbol] = { expiresAt, minutes: safeMinutes };
  return { expiresAt, minutes: safeMinutes };
}

function cleanExpired() {
  const now = Date.now();
  Object.keys(symbolCooldowns).forEach((symbol) => {
    const entry = resolveCooldownEntry(symbolCooldowns[symbol]);
    if (!entry || !entry.expiresAt || entry.expiresAt <= now) {
      delete symbolCooldowns[symbol];
    }
  });
}

router.post('/cooldown/set', (req, res) => {
  const symbol = normalizeSymbol(req.body?.symbol);
  const minutes = Number(req.body?.minutes ?? 60);

  if (!symbol) {
    return res.status(400).json({ error: 'El símbolo es obligatorio' });
  }

  const result = setCooldown(symbol, minutes);
  return res.json({ ok: true, symbol, expiresAt: result.expiresAt, minutes: result.minutes });
});

router.get('/cooldown/status', (req, res) => {
  cleanExpired();
  const now = Date.now();
  const active = {};

  Object.entries(symbolCooldowns).forEach(([symbol, rawEntry]) => {
    const entry = resolveCooldownEntry(rawEntry);
    if (!entry || !entry.expiresAt || entry.expiresAt <= now) return;
    const minutesLeft = Math.max(0, Math.ceil((entry.expiresAt - now) / 60000));
    active[symbol] = { expiresAt: entry.expiresAt, minutesLeft };
  });

  return res.json({ active, count: Object.keys(active).length });
});

router.delete('/cooldown/:symbol', (req, res) => {
  const symbol = normalizeSymbol(req.params.symbol);
  if (symbol && symbolCooldowns[symbol]) {
    delete symbolCooldowns[symbol];
  }
  return res.json({ ok: true, symbol });
});

module.exports = router;
