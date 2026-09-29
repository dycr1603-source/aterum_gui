'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
require('../services/load_env');
const { isInhibited } = require('../services/host_control_state');

const REPO = path.resolve(__dirname, '..');
const GUI_URL = process.env.ATERUM_GUI_LOCAL_URL || 'http://127.0.0.1:3001';
const N8N_HEALTH_URL = process.env.ATERUM_N8N_HEALTH_URL || 'http://127.0.0.1:5678/healthz';
const NGROK_BIN = process.env.NGROK_BIN || path.join(os.homedir(), '.local/bin/ngrok');
const RUNTIME_DIR = process.env.RUNTIME_DIRECTORY || '/run/aterum-gui-tunnel';
const STATE_FILE = process.env.ATERUM_TUNNEL_STATE || '/var/lib/aterum-gui-tunnel/state.json';
const CURRENT_STATE_FILE = process.env.ATERUM_TUNNEL_CURRENT_STATE || '/var/lib/aterum-gui-tunnel/current.json';
const API_URL = 'http://127.0.0.1:4040/api/tunnels';
const BOOT_ID = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
const WAIT_LIMIT = 12;
const POLL_MS = 5000;

let child = null;
let stopping = false;
let reusedExisting = false;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function yamlString(value) {
  if (/[\r\n]/.test(value)) throw new Error('Invalid line break in access credentials');
  return "'" + value.replace(/'/g, "''") + "'";
}
function safeError(error) {
  let message = String(error?.message || error || 'unknown error');
  for (const secret of [process.env.NGROK_AUTHTOKEN, process.env.TELEGRAM_BOT_TOKEN, process.env.DEFAULT_ADMIN_PASSWORD]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/https?:\/\/[^\s]+/g, value => {
    try { const url = new URL(value); return url.origin; } catch (_) { return '[URL]'; }
  }).slice(0, 300);
}
function logError(label, error) { console.error(`[aterum-gui-tunnel] ${label}: ${safeError(error)}`); }

async function request(url, options = {}, timeoutMs = 6000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function guiIsReady() {
  const response = await request(GUI_URL, { redirect: 'manual' });
  return response.status >= 200 && response.status < 400;
}
async function n8nIsReady() {
  const response = await request(N8N_HEALTH_URL);
  return response.ok;
}
async function waitForDependencies() {
  let lastGuiError = 'not ready', lastN8nError = 'not ready';
  for (let attempt = 1; attempt <= WAIT_LIMIT && !stopping; attempt++) {
    const [gui, n8n] = await Promise.allSettled([guiIsReady(), n8nIsReady()]);
    if (gui.status === 'fulfilled' && gui.value && n8n.status === 'fulfilled' && n8n.value) {
      console.log('[aterum-gui-tunnel] GUI and n8n healthy');
      return;
    }
    lastGuiError = gui.status === 'rejected' ? safeError(gui.reason) : gui.value ? '' : 'HTTP not ready';
    lastN8nError = n8n.status === 'rejected' ? safeError(n8n.reason) : n8n.value ? '' : 'HTTP not healthy';
    console.log(`[aterum-gui-tunnel] waiting for GUI/n8n (${attempt}/${WAIT_LIMIT})`);
    await sleep(POLL_MS);
  }
  throw new Error(`DEPENDENCIES_UNAVAILABLE gui=${lastGuiError} n8n=${lastN8nError}`);
}

function writeNgrokConfig() {
  const authtoken = String(process.env.NGROK_AUTHTOKEN || '').trim();
  if (!authtoken || /^(change_me|replace_me|example)/i.test(authtoken)) throw new Error('NGROK_AUTHTOKEN is not configured in .env');
  fs.mkdirSync(RUNTIME_DIR, { recursive: true, mode: 0o700 });
  const configFile = path.join(RUNTIME_DIR, 'ngrok.yml');
  const policyFile = path.join(RUNTIME_DIR, 'traffic-policy.yml');
  fs.writeFileSync(configFile,
    'version: "3"\nagent:\n  authtoken: ' + yamlString(authtoken) + '\n', { mode: 0o600 });
  fs.rmSync(policyFile, { force: true });
  return { configFile };
}

async function getExistingTunnel() {
  const response = await request(API_URL);
  if (!response.ok) return null;
  const data = await response.json();
  return (data.tunnels || []).find(tunnel => tunnel.proto === 'https' && /:3001\/?$/.test(String(tunnel.config?.addr || '')));
}

function streamNgrokLogs(stream) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop() || '';
    for (const line of lines) if (line.trim()) console.log('[ngrok] ' + safeError({ message: line }));
  });
}
function startNgrok({ configFile }) {
  child = spawn(NGROK_BIN, [
    'http', '3001', '--config', configFile,
    '--log', 'stdout', '--log-format', 'logfmt', '--log-level', 'info'
  ], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
  child.once('error', error => logError('could not start ngrok', error));
  streamNgrokLogs(child.stdout); streamNgrokLogs(child.stderr);
  child.once('exit', (code, signal) => {
    console.log(`[aterum-gui-tunnel] ngrok exited code=${code} signal=${signal || 'none'}`);
    child = null;
  });
  return child;
}

async function waitForTunnel() {
  for (let attempt = 1; attempt <= WAIT_LIMIT && !stopping; attempt++) {
    if (child && child.exitCode !== null) throw new Error('NGROK_EXITED_BEFORE_TUNNEL_READY');
    try {
      const tunnel = await getExistingTunnel();
      if (tunnel) return tunnel;
    } catch (_) { /* local ngrok inspection API is still starting */ }
    console.log(`[aterum-gui-tunnel] waiting for ngrok HTTPS endpoint (${attempt}/${WAIT_LIMIT})`);
    await sleep(POLL_MS);
  }
  throw new Error('NGROK_TUNNEL_NOT_READY');
}

async function verifyPublicTunnel(publicUrl) {
  const loginUrl = new URL('/login', publicUrl).toString();
  const browserHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
  const response = await request(loginUrl, { headers: browserHeaders, redirect: 'manual' });
  if (!response.ok) throw new Error(`PUBLIC_GUI_UNAVAILABLE_HTTP_${response.status}`);
  let html = await response.text();
  const hasLogin = value => /name=["']username["']/i.test(value) && /name=["']password["']/i.test(value);
  const browserConfirmationRequired = !hasLogin(html) && /ngrok/i.test(html);
  if (browserConfirmationRequired) {
    console.warn('[aterum-gui-tunnel] ngrok free browser interstitial is active; visitors must confirm "Visit Site" once per browser every 7 days');
    const verified = await request(loginUrl, {
      headers: { ...browserHeaders, 'ngrok-skip-browser-warning': '1' },
      redirect: 'manual'
    });
    if (!verified.ok) throw new Error(`PUBLIC_GUI_UNAVAILABLE_HTTP_${verified.status}`);
    html = await verified.text();
  }
  if (!hasLogin(html)) throw new Error('PUBLIC_URL_DID_NOT_SERVE_ATERUM_LOGIN');
  const privateResponse = await request(new URL('/api/account', publicUrl).toString(), {
    headers: { ...browserHeaders, 'ngrok-skip-browser-warning': '1' }, redirect: 'manual'
  });
  if (privateResponse.status !== 401) throw new Error('PUBLIC_GUI_SESSION_GUARD_MISSING');
  return { browserConfirmationRequired };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return null; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  const temp = STATE_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temp, STATE_FILE);
}
function saveCurrentTunnel(tunnel, browserConfirmationRequired = false) {
  const temp = CURRENT_STATE_FILE + '.tmp';
  const state = {
    url: new URL(tunnel.public_url).origin,
    updatedAt: new Date().toISOString(),
    browserConfirmationRequired: Boolean(browserConfirmationRequired)
  };
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o644 });
  fs.chmodSync(temp, 0o644);
  fs.renameSync(temp, CURRENT_STATE_FILE);
}
function clearCurrentTunnel() {
  try { fs.unlinkSync(CURRENT_STATE_FILE); } catch (error) { if (error.code !== 'ENOENT') logError('could not clear current URL', error); }
  try { fs.unlinkSync(CURRENT_STATE_FILE + '.tmp'); } catch (_) {}
}
function composeDashboardId() {
  const result = execFileSync('/usr/bin/docker', ['compose', 'ps', '-q', 'dashboard'], {
    cwd: REPO, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  if (!/^[a-f0-9]{12,64}$/i.test(result)) throw new Error('DASHBOARD_CONTAINER_NOT_RUNNING');
  return result;
}
function announce(url, attempt, browserConfirmationRequired) {
  const containerId = composeDashboardId();
  execFileSync('/usr/bin/docker', ['exec', containerId, 'node', '/app/scripts/announce-gui-tunnel.js', url, BOOT_ID, String(attempt), browserConfirmationRequired ? '1' : '0'], {
    cwd: REPO, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe']
  });
}
async function announceWithRetries(url, browserConfirmationRequired) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      announce(url, attempt, browserConfirmationRequired);
      console.log('[aterum-gui-tunnel] Telegram announcement delivered');
      return 'SENT';
    } catch (error) {
      const detail = String(error.stderr || error.message || '');
      if (/TELEGRAM_UNKNOWN|DELIVERY_UNKNOWN|DELIVERY_UNKNOWN/.test(detail)) {
        throw new Error('TELEGRAM_DELIVERY_UNKNOWN; not retrying to avoid duplicate message');
      }
      logError(`Telegram send attempt ${attempt}/3`, error);
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }
  throw new Error('TELEGRAM_DELIVERY_FAILED_AFTER_3_ATTEMPTS');
}

async function ensureAnnounced(tunnel) {
  const publicUrl = String(tunnel.public_url || '');
  if (!publicUrl.startsWith('https://')) throw new Error('NGROK_DID_NOT_ASSIGN_HTTPS_URL');
  const access = await verifyPublicTunnel(publicUrl);
  const previous = loadState();
  const tunnelId = String(tunnel.id || tunnel.public_url);
  const changed = !previous || previous.bootId !== BOOT_ID || previous.url !== publicUrl || previous.tunnelId !== tunnelId;
  if (changed) {
    const announcement = await announceWithRetries(publicUrl, access.browserConfirmationRequired);
    saveState({ bootId: BOOT_ID, url: publicUrl, tunnelId, announcedAt: new Date().toISOString(), announcement });
    console.log(`[aterum-gui-tunnel] verified and announced ${publicUrl}`);
  } else {
    console.log(`[aterum-gui-tunnel] existing verified URL unchanged ${publicUrl}`);
  }
  saveCurrentTunnel(tunnel, access.browserConfirmationRequired);
  return access.browserConfirmationRequired;
}

async function runTunnelSession() {
  await waitForDependencies();
  let tunnel = null;
  try { tunnel = await getExistingTunnel(); } catch (_) { /* no local agent API yet */ }
  if (tunnel) {
    reusedExisting = true;
    console.log('[aterum-gui-tunnel] found an existing port-3001 endpoint; verifying before reuse');
  } else {
    const files = writeNgrokConfig();
    const executable = startNgrok(files);
    if (executable.error) throw executable.error;
    tunnel = await waitForTunnel();
  }
  let browserConfirmationRequired = await ensureAnnounced(tunnel);
  let inspectionFailures = 0;
  while (!stopping) {
    await sleep(10000);
    if (stopping) return;
    if (child && child.exitCode !== null) throw new Error('NGROK_PROCESS_STOPPED');
    try {
      const updated = await getExistingTunnel();
      if (!updated) { inspectionFailures++; }
      else {
        inspectionFailures = 0;
        if (updated.public_url !== tunnel.public_url || updated.id !== tunnel.id) {
          tunnel = updated;
          browserConfirmationRequired = await ensureAnnounced(tunnel);
        }
        saveCurrentTunnel(tunnel, browserConfirmationRequired);
      }
    } catch (error) {
      inspectionFailures++;
      if (inspectionFailures === 1) logError('ngrok inspection API unavailable', error);
    }
    if (inspectionFailures >= WAIT_LIMIT) throw new Error('NGROK_INSPECTION_API_UNAVAILABLE');
  }
}

async function main() {
  if (isInhibited()) {
    console.log('[aterum-gui-tunnel] skipped: host stopped or retired');
    return;
  }
  const attempt = Number.parseInt(process.env.ATERUM_BOOT_RETRY_LIMIT || '12', 10);
  for (let cycle = 1; cycle <= Math.max(1, Math.min(attempt, 30)) && !stopping; cycle++) {
    try { await runTunnelSession(); return; }
    catch (error) {
      if (stopping) return;
      logError(`startup/session attempt ${cycle}`, error);
      clearCurrentTunnel();
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        await sleep(1000);
        if (child && child.exitCode === null) child.kill('SIGKILL');
      }
      child = null;
      if (cycle >= Math.max(1, Math.min(attempt, 30))) throw new Error('BOOT_RETRY_LIMIT_REACHED');
      await sleep(Math.min(60000, cycle * 5000));
    }
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  clearCurrentTunnel();
  if (child && child.exitCode === null) child.kill('SIGTERM');
});

if (require.main === module) main().catch(error => {
  logError('fatal', error);
  process.exitCode = 1;
});

module.exports = { yamlString, writeNgrokConfig, verifyPublicTunnel, startup: main };
