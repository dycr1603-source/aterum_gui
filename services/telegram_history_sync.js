'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const BRANCH = 'aterum-telegram-history';
const MAX_BYTES = 32 * 1024 * 1024;
const TRANSFER = fs.readFileSync(path.join(__dirname, '../scripts/telegram-sync-db.js'), 'utf8');

function seal(snapshot, recipients) {
  if (Object.keys(recipients).length < 2) throw new Error('TELEGRAM_SYNC_TWO_PUBLIC_KEYS_REQUIRED');
  const contentKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
  const clear = Buffer.from(JSON.stringify(snapshot));
  if (clear.length > MAX_BYTES) throw new Error('TELEGRAM_SNAPSHOT_TOO_LARGE');
  const packed = require('node:zlib').gzipSync(clear);
  const body = Buffer.concat([cipher.update(packed), cipher.final()]);
  const ephemeral = crypto.generateKeyPairSync('x25519');
  const wraps = {};
  for (const [hostId, pem] of Object.entries(recipients)) {
    if (!/^[0-9a-f]{64}$/.test(hostId)) throw new Error('INVALID_TELEGRAM_RECIPIENT');
    const shared = crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: crypto.createPublicKey(pem) });
    const wrapKey = Buffer.from(crypto.hkdfSync('sha256', shared, 'aterum-telegram-history-v2', hostId, 32));
    const wrapIv = crypto.randomBytes(12);
    const wrapCipher = crypto.createCipheriv('aes-256-gcm', wrapKey, wrapIv);
    const wrapped = Buffer.concat([wrapCipher.update(contentKey), wrapCipher.final()]);
    wraps[hostId] = { iv: wrapIv.toString('base64'), tag: wrapCipher.getAuthTag().toString('base64'),
      body: wrapped.toString('base64') };
  }
  return JSON.stringify({ schema: 'aterum-telegram-envelope-v2',
    ephemeral: ephemeral.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    recipients: wraps, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    body: body.toString('base64') });
}
function open(envelope, privateKey, hostId) {
  const value = JSON.parse(envelope);
  if (value.schema !== 'aterum-telegram-envelope-v2' || !value.recipients?.[hostId]) throw new Error('INVALID_TELEGRAM_ENVELOPE');
  const ephemeral = crypto.createPublicKey({ key: Buffer.from(value.ephemeral, 'base64'), format: 'der', type: 'spki' });
  const shared = crypto.diffieHellman({ privateKey: crypto.createPrivateKey(privateKey), publicKey: ephemeral });
  const wrapKey = Buffer.from(crypto.hkdfSync('sha256', shared, 'aterum-telegram-history-v2', hostId, 32));
  const wrap = value.recipients[hostId];
  const wrapDecipher = crypto.createDecipheriv('aes-256-gcm', wrapKey, Buffer.from(wrap.iv, 'base64'));
  wrapDecipher.setAuthTag(Buffer.from(wrap.tag, 'base64'));
  const contentKey = Buffer.concat([wrapDecipher.update(Buffer.from(wrap.body, 'base64')), wrapDecipher.final()]);
  const decipher = crypto.createDecipheriv('aes-256-gcm', contentKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const packed = Buffer.concat([decipher.update(Buffer.from(value.body, 'base64')), decipher.final()]);
  const clear = require('node:zlib').gunzipSync(packed, { maxOutputLength: MAX_BYTES });
  const snapshot = JSON.parse(clear.toString('utf8'));
  if (snapshot.schema !== 'aterum-telegram-history-v1' || !Array.isArray(snapshot.audit)
      || !Array.isArray(snapshot.deliveries)) throw new Error('INVALID_TELEGRAM_SNAPSHOT');
  return snapshot;
}

async function writeDocker(container, mode, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', ...(input ? ['-i'] : []), container, 'node', '-e', TRANSFER, mode],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', size = 0;
    const timeout = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) child.kill('SIGKILL');
      else stdout += chunk;
    });
    child.stderr.resume(); // Never echo database contents or credentials.
    child.on('error', () => { clearTimeout(timeout); reject(new Error('TELEGRAM_DB_TRANSFER_FAILED')); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0 || size > MAX_BYTES) reject(new Error('TELEGRAM_DB_TRANSFER_FAILED'));
      else { try { resolve(JSON.parse(stdout)); } catch (_) { reject(new Error('TELEGRAM_DB_TRANSFER_INVALID')); } }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

class TelegramHistorySync {
  constructor({ root, directory, hostId, compose, remote = 'origin', transfer = writeDocker }) {
    Object.assign(this, { root, directory, hostId, compose, remote, transfer });
    this.privateKeyFile = path.join(directory, 'telegram-history-private.pem');
    this.pendingFile = path.join(directory, 'telegram-history-pending.enc');
    this.statusFile = path.join(directory, 'telegram-history-status.json');
  }
  privateKey() {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.privateKeyFile)) {
      const pair = crypto.generateKeyPairSync('x25519');
      fs.writeFileSync(this.privateKeyFile, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }),
        { mode: 0o600, flag: 'wx' });
    }
    return fs.readFileSync(this.privateKeyFile, 'utf8');
  }
  publicKey() { return crypto.createPublicKey(this.privateKey()).export({ format: 'pem', type: 'spki' }); }
  async git(args, cwd) {
    try { return (await exec('git', args, { cwd, timeout: 30000, maxBuffer: 1048576,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim(); }
    catch (_) { throw new Error('TELEGRAM_SYNC_GIT_FAILED'); }
  }
  async container() {
    const id = String(await this.compose(['ps', '--quiet', 'dashboard'])).trim();
    if (!id) throw new Error('TELEGRAM_SYNC_DASHBOARD_NOT_RUNNING');
    return id;
  }
  async capture() {
    await this.register();
    const recipients = await this.registeredRecipients();
    const snapshot = await this.transfer(await this.container(), 'export');
    if (snapshot.schema !== 'aterum-telegram-history-v1') throw new Error('INVALID_TELEGRAM_SNAPSHOT');
    snapshot.sourceHost = this.hostId;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temp = `${this.pendingFile}.${process.pid}`;
    fs.writeFileSync(temp, seal(snapshot, recipients), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, this.pendingFile);
    return { audit: snapshot.audit.length, deliveries: snapshot.deliveries.length };
  }
  async repository(operation) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-telegram-sync-'));
    try {
      const url = await this.git(['remote', 'get-url', this.remote], this.root);
      await this.git(['init', '--quiet', dir], this.root);
      await this.git(['remote', 'add', 'origin', url], dir);
      const exists = Boolean(await this.git(['ls-remote', '--heads', 'origin', `refs/heads/${BRANCH}`], dir));
      if (exists) {
        await this.git(['fetch', '--quiet', 'origin', `refs/heads/${BRANCH}`], dir);
        await this.git(['checkout', '--quiet', '-B', BRANCH, 'FETCH_HEAD'], dir);
      } else await this.git(['checkout', '--quiet', '--orphan', BRANCH], dir);
      return await operation(dir, exists);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  async register() {
    const pem = this.publicKey();
    return this.repository(async (dir, exists) => {
      const file = path.join(dir, 'keys', `${this.hostId}.pem`);
      if (fs.existsSync(file)) {
        if (fs.readFileSync(file, 'utf8') !== pem) throw new Error('TELEGRAM_SYNC_PUBLIC_KEY_MISMATCH');
        return false;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, pem, { mode: 0o644 });
      await this.git(['add', '--', `keys/${this.hostId}.pem`], dir);
      await this.git(['-c', 'user.name=Aterum Telegram sync', '-c', 'user.email=telegram-sync@aterum.local',
        'commit', '--quiet', '-m', 'Register Telegram sync public key'], dir);
      await this.git(['push', '--quiet', ...(exists ? [] : [`--force-with-lease=refs/heads/${BRANCH}:`]),
        'origin', `HEAD:refs/heads/${BRANCH}`], dir);
      return true;
    });
  }
  async registeredRecipients() {
    return this.repository(async (dir, exists) => {
      if (!exists) throw new Error('TELEGRAM_SYNC_PUBLIC_KEYS_MISSING');
      const keyDir = path.join(dir, 'keys');
      const recipients = {};
      for (const name of fs.readdirSync(keyDir).filter(name => /^[0-9a-f]{64}\.pem$/.test(name)))
        recipients[name.slice(0, 64)] = fs.readFileSync(path.join(keyDir, name), 'utf8');
      if (recipients[this.hostId] !== this.publicKey()) throw new Error('TELEGRAM_SYNC_PUBLIC_KEY_MISMATCH');
      return recipients;
    });
  }
  async publish() {
    if (!fs.existsSync(this.pendingFile)) throw new Error('TELEGRAM_SYNC_SNAPSHOT_MISSING');
    const envelope = fs.readFileSync(this.pendingFile, 'utf8');
    open(envelope, this.privateKey(), this.hostId); // Verify local snapshot before pushing.
    const name = `snapshots/${this.hostId}.enc`;
    await this.repository(async (dir, exists) => {
      if (exists && fs.existsSync(path.join(dir, name)) && fs.readFileSync(path.join(dir, name), 'utf8') === envelope) return;
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), envelope, { mode: 0o600 });
      await this.git(['add', '--', name], dir);
      await this.git(['-c', 'user.name=Aterum Telegram sync', '-c', 'user.email=telegram-sync@aterum.local',
        'commit', '--quiet', '-m', 'Update encrypted Telegram history'], dir);
      await this.git(['push', '--quiet', ...(exists ? [] : [`--force-with-lease=refs/heads/${BRANCH}:`]),
        'origin', `HEAD:refs/heads/${BRANCH}`], dir);
    });
    fs.rmSync(this.pendingFile, { force: true });
    return true;
  }
  async pull() {
    await this.register();
    const container = await this.container();
    const result = await this.repository(async (dir, exists) => {
      if (!exists) return { snapshots: 0, auditAdded: 0, deliveriesAdded: 0 };
      const snapshotDir = path.join(dir, 'snapshots');
      const files = fs.existsSync(snapshotDir) ? fs.readdirSync(snapshotDir).filter(name => /^[0-9a-f]{64}\.enc$/.test(name)) : [];
      const totals = { snapshots: files.length, auditAdded: 0, deliveriesAdded: 0 };
      for (const name of files) {
        const snapshot = open(fs.readFileSync(path.join(snapshotDir, name), 'utf8'), this.privateKey(), this.hostId);
        if (snapshot.sourceHost !== name.slice(0, 64)) throw new Error('TELEGRAM_SYNC_SOURCE_MISMATCH');
        const imported = await this.transfer(container, 'import', JSON.stringify(snapshot));
        totals.auditAdded += imported.auditAdded;
        totals.deliveriesAdded += imported.deliveriesAdded;
      }
      return totals;
    });
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.statusFile, JSON.stringify({ ...result, importedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
    return result;
  }
}
module.exports = { TelegramHistorySync, seal, open };
