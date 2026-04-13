'use strict';

const fs = require('fs');
const path = require('path');

let loaded = false;

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const idx = trimmed.indexOf('=');
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadLocalEnv() {
  if (loaded) return;
  loaded = true;

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const pair = parseEnvLine(line);
    if (!pair) continue;
    if (process.env[pair.key] == null || process.env[pair.key] === '') {
      process.env[pair.key] = pair.value;
    }
  }
}

loadLocalEnv();

module.exports = {
  loadLocalEnv
};
