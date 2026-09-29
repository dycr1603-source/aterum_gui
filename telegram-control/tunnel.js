'use strict';

const fs = require('fs');

function isTrustedGuiUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash
      && /(^|\.)ngrok(-free)?\.(app|io|dev)$/i.test(url.hostname);
  } catch (_) {
    return false;
  }
}

function readCurrentGuiTunnel(file, now = Date.now(), maxAgeMs = 30000) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const checkedAt = Date.parse(state.updatedAt);
    if (!isTrustedGuiUrl(state.url) || !Number.isFinite(checkedAt)
      || checkedAt > now + 5000 || now - checkedAt > maxAgeMs) return null;
    return {
      url: new URL(state.url).origin,
      updatedAt: new Date(checkedAt).toISOString(),
      browserConfirmationRequired: state.browserConfirmationRequired === true
    };
  } catch (_) {
    return null;
  }
}

module.exports = { isTrustedGuiUrl, readCurrentGuiTunnel };
