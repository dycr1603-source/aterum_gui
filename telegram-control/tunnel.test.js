'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isTrustedGuiUrl, readCurrentGuiTunnel } = require('./tunnel');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-tunnel-'));
const file = path.join(dir, 'current.json');
const now = Date.now();
try {
  assert.equal(isTrustedGuiUrl('https://sample.ngrok-free.dev'), true);
  assert.equal(isTrustedGuiUrl('https://sample.ngrok-free.dev.evil.example'), false);
  assert.equal(isTrustedGuiUrl('http://sample.ngrok-free.dev'), false);
  assert.equal(readCurrentGuiTunnel(file, now), null);

  fs.writeFileSync(file, JSON.stringify({ url: 'https://sample.ngrok-free.dev', updatedAt: new Date(now - 10000).toISOString() }));
  assert.deepEqual(readCurrentGuiTunnel(file, now), {
    url: 'https://sample.ngrok-free.dev', updatedAt: new Date(now - 10000).toISOString(),
    browserConfirmationRequired: false
  });

  fs.writeFileSync(file, JSON.stringify({
    url: 'https://sample.ngrok-free.dev', updatedAt: new Date(now - 10000).toISOString(),
    browserConfirmationRequired: true
  }));
  assert.equal(readCurrentGuiTunnel(file, now).browserConfirmationRequired, true);

  fs.writeFileSync(file, JSON.stringify({ url: 'https://sample.ngrok-free.dev', updatedAt: new Date(now - 31000).toISOString() }));
  assert.equal(readCurrentGuiTunnel(file, now), null);
  fs.writeFileSync(file, JSON.stringify({ url: 'https://example.com', updatedAt: new Date(now).toISOString() }));
  assert.equal(readCurrentGuiTunnel(file, now), null);
  console.log('telegram current GUI tunnel state: ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
