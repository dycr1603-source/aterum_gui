#!/usr/local/bin/node
'use strict';

const fs = require('fs');

function usage(message) {
  if (message) console.error(`curl shim: ${message}`);
  process.exit(message ? 2 : 0);
}

const args = process.argv.slice(2);
let output = null;
let timeoutMs = 0;
let method = 'GET';
let body = null;
let follow = false;
const headers = {};
const urls = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-o' || arg === '--output') {
    output = args[++i];
  } else if (arg === '-m' || arg === '--max-time') {
    timeoutMs = Math.max(0, Number(args[++i] || 0) * 1000);
  } else if (arg === '-X' || arg === '--request') {
    method = String(args[++i] || 'GET').toUpperCase();
  } else if (arg === '-H' || arg === '--header') {
    const header = String(args[++i] || '');
    const idx = header.indexOf(':');
    if (idx > 0) headers[header.slice(0, idx).trim()] = header.slice(idx + 1).trim();
  } else if (arg === '-d' || arg === '--data' || arg === '--data-raw' || arg === '--data-binary') {
    body = args[++i] || '';
    if (method === 'GET') method = 'POST';
  } else if (arg === '-L' || arg === '--location') {
    follow = true;
  } else if (arg === '-s' || arg === '-S' || arg === '-sS' || arg === '-f' || arg === '--fail') {
    continue;
  } else if (arg === '--help' || arg === '-h') {
    usage();
  } else if (/^https?:\/\//i.test(arg)) {
    urls.push(arg);
  }
}

if (!urls.length) usage('missing URL');

async function request(url, redirects = 0) {
  const normalized = url.replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1');
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(normalized, {
      method,
      headers,
      body,
      redirect: follow ? 'manual' : 'follow',
      signal: controller?.signal
    });
    if (follow && response.status >= 300 && response.status < 400 && response.headers.get('location') && redirects < 8) {
      return request(new URL(response.headers.get('location'), normalized).toString(), redirects + 1);
    }
    if (!response.ok) {
      console.error(`curl shim: HTTP ${response.status} for ${url}`);
      process.exit(22);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    if (timer) clearTimeout(timer);
  }
}

(async () => {
  const data = await request(urls[0]);
  if (output) fs.writeFileSync(output, data);
  else process.stdout.write(data);
})().catch(error => {
  console.error(`curl shim: ${error.message || error}`);
  process.exit(1);
});
