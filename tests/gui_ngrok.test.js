'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-ngrok-test-'));
process.env.RUNTIME_DIRECTORY = runtime;
process.env.NGROK_AUTHTOKEN = 'test-ngrok-token';
const { yamlString, writeNgrokConfig, verifyPublicTunnel } = require('../scripts/gui-ngrok-watch');
const { isPublicTunnelHost, protectPublicTunnel } = require('../middleware/auth');

(async () => {
  assert.equal(yamlString("it's"), "'it''s'");
  assert.throws(() => yamlString('bad\nvalue'), /line break/);
  const { configFile } = writeNgrokConfig();
  assert.equal(fs.statSync(configFile).mode & 0o777, 0o600);
  assert(!fs.existsSync(path.join(runtime, 'traffic-policy.yml')));
  assert(isPublicTunnelHost({ host: 'test.ngrok-free.dev' }));
  assert(!isPublicTunnelHost({ host: 'localhost:3001' }));
  let status;
  protectPublicTunnel({ headers:{ host:'test.ngrok-free.dev' }, path:'/api/account', method:'GET', session:{}, accepts:()=>false },
    { status(code){status=code;return this}, json(){return this} }, () => { throw new Error('public API bypassed guard') });
  assert.equal(status, 401);

  const originalFetch = global.fetch;
  const seen = [];
  global.fetch = async (url, options) => {
    seen.push({ url, authorization: options.headers?.authorization || null });
    if (url.endsWith('/api/account')) return { status:401, ok:false };
    return { status:200, ok:true, text:async()=>'<form><input name="username"><input name="password"></form>' };
  };
  await verifyPublicTunnel('https://test.ngrok-free.app');
  assert.equal(seen.length, 2);
  assert(seen.every(item => item.authorization === null));
  global.fetch = async () => ({ status:200, ok:true, text:async()=>'<h1>unprotected page</h1>' });
  await assert.rejects(verifyPublicTunnel('https://unsafe.ngrok-free.app'), /DID_NOT_SERVE_ATERUM_LOGIN/);
  global.fetch = originalFetch;
  fs.rmSync(runtime, { recursive:true, force:true });
  console.log('GUI ngrok policy and public health checks: ok');
})().catch(error=>{ console.error(error); process.exitCode=1; });
