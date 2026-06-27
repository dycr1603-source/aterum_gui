'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [input, outputDir] = process.argv.slice(2);
if (!input || !outputDir) {
  console.error('Usage: node sanitize-workflows.js <export.json> <output-dir>');
  process.exit(1);
}

function sanitizeString(value) {
  return value
    .replace(/(const\s+API_KEY\s*=\s*)(['"`])[^'"`]+\2/g, '$1process.env.BINANCE_API_KEY')
    .replace(/(const\s+API_SECRET\s*=\s*)(['"`])[^'"`]+\2/g, '$1process.env.BINANCE_API_SECRET')
    .replace(/(const\s+ANTHROPIC_KEY\s*=\s*)(['"`])[^'"`]+\2/g, '$1process.env.ANTHROPIC_API_KEY')
    .replace(/(const\s+OPENAI_KEY\s*=\s*)(['"`])[^'"`]+\2/g, '$1process.env.OPENAI_API_KEY')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '__REDACTED_ANTHROPIC_KEY__')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '__REDACTED_API_KEY__')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, '__REDACTED_TELEGRAM_TOKEN__')
    .replace(/-100\d{8,}/g, '__TELEGRAM_CHAT_ID__')
    .replace(/((?:api[_-]?key|api[_-]?secret|password|token)\s*[:=]\s*['"])[^'"]+(['"])/gi, '$1__REDACTED__$2');
}

function sanitize(value) {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  }
  return value;
}

function slug(name) {
  return String(name || 'workflow')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
const workflows = Array.isArray(parsed) ? parsed : [parsed];
fs.mkdirSync(outputDir, { recursive: true });

for (const file of fs.readdirSync(outputDir)) {
  if (file.endsWith('.workflow.json') || file === 'manifest.json') {
    fs.rmSync(path.join(outputDir, file));
  }
}

const manifest = [];
for (const workflow of workflows) {
  const safe = sanitize(workflow);
  const activeAtExport = Boolean(safe.active);
  safe.active = false;
  const filename = `${slug(safe.name)}.workflow.json`;
  const contents = `${JSON.stringify(safe, null, 2)}\n`;
  fs.writeFileSync(path.join(outputDir, filename), contents);
  manifest.push({
    id: safe.id || null,
    name: safe.name || filename,
    activeAtExport,
    nodeCount: Array.isArray(safe.nodes) ? safe.nodes.length : 0,
    filename,
    sha256: crypto.createHash('sha256').update(contents).digest('hex')
  });
}

manifest.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: path.basename(input),
  sanitized: true,
  workflows: manifest
}, null, 2)}\n`);

console.log(`Wrote ${manifest.length} sanitized workflows to ${outputDir}`);
