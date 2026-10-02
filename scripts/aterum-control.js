#!/usr/bin/env node
'use strict';

// Host lifecycle only. Does not submit orders, edit workflows or change .env.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { stateDirectory } = require('../services/host_control_state');
const { GitControl } = require('../services/host_control_git');
const { TelegramHistorySync } = require('../services/telegram_history_sync');
const exec = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const PROFILES = ['--profile', 'trading', '--profile', 'ai', '--profile', 'aux'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hostnameId = () => crypto.createHash('sha256').update(fs.readFileSync('/etc/machine-id', 'utf8').trim()).digest('hex');
const SNAPSHOT_CODE = `
const {DatabaseSync}=require('node:sqlite');const {db}=require('./shared');
(async()=>{const s=new DatabaseSync('/n8n-data/database.sqlite',{readOnly:true});
const workflows=s.prepare("SELECT COUNT(*) AS n FROM execution_entity WHERE status IN ('new','running')").get().n;
s.close();const [r]=await db.query("SELECT COUNT(*) AS n FROM trade_executions WHERE final_status IN ('REQUESTED','EXECUTING')");
console.log(JSON.stringify({workflows,executions:Number(r[0].n)}));})()
.catch(()=>{console.error('DRAIN_SNAPSHOT_UNAVAILABLE');process.exitCode=1;}).finally(()=>db.end());`;

async function publicTunnelRemaining() {
  let response;
  try { response = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(3000) }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error('TUNNEL_INSPECTION_UNAVAILABLE');
  }
  if (!response.ok) throw new Error('TUNNEL_INSPECTION_UNAVAILABLE');
  let payload;
  try { payload = await response.json(); } catch (_) { throw new Error('TUNNEL_INSPECTION_INVALID'); }
  if (!Array.isArray(payload.tunnels)) throw new Error('TUNNEL_INSPECTION_INVALID');
  return payload.tunnels.some(t => /:3001\/?$/.test(String(t.config?.addr || '')));
}

function readJson(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}
async function defaultRun(command, args) {
  try { const r = await exec(command, args, { cwd: ROOT, maxBuffer: 1024 * 1024 }); return r.stdout.trim(); }
  catch (_) { throw new Error(`COMMAND_FAILED: ${command} ${command === 'docker' ? args.slice(0, 2).join(' ') : args[0] || ''}`); }
}

class HostController {
  constructor({ directory = stateDirectory(), run = defaultRun, hostId = hostnameId(), user = os.userInfo().username,
    sleep = delay, now = () => new Date().toISOString(), log = console.log, inspectTunnel = publicTunnelRemaining,
    gitControl = null, telegramSync = null } = {}) {
    Object.assign(this, { directory, run, hostId, user, sleep, now, log, inspectTunnel, gitControl, telegramSync });
    this.stateFile = path.join(directory, 'host.json');
    this.inhibitFile = path.join(directory, 'inhibited');
  }
  state() { return readJson(this.stateFile); }
  save(state) { atomicJson(this.stateFile, { ...state, hostId: this.hostId, updatedAt: this.now() }); }
  inhibit() {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.inhibitFile, 'Stopped by aterum control. Start explicitly to resume.\n', { mode: 0o600 });
  }
  compose(args) { return this.run('docker', ['compose', ...PROFILES, ...args]); }
  async containers() {
    const ids = (await this.compose(['ps', '--all', '--quiet'])).split(/\s+/).filter(Boolean);
    if (!ids.length) return [];
    const raw = await this.run('docker', ['inspect', '--format', '{{json .State}}|{{index .Config.Labels "com.docker.compose.service"}}', ...ids]);
    return raw.split('\n').filter(Boolean).map(line => {
      const at = line.lastIndexOf('|'); const state = JSON.parse(line.slice(0, at));
      return { service: line.slice(at + 1), running: state.Running, paused: state.Paused,
        restarting: state.Restarting, exitCode: state.ExitCode, health: state.Health?.Status || null };
    });
  }
  async tunnel(action) {
    const unit = `aterum-gui-tunnel@${this.user}.service`;
    const load = await this.run('systemctl', ['show', '--property=LoadState', '--value', unit]);
    if (load === 'not-found' || !load) return;
    await this.run('sudo', ['-n', 'systemctl', action, unit]);
    const active = await this.run('systemctl', ['show', '--property=ActiveState', '--value', unit]);
    if (action === 'stop' && !['inactive', 'failed'].includes(active)) throw new Error('TUNNEL_STILL_ACTIVE');
  }
  async snapshot() {
    const ids = await this.compose(['ps', '--quiet', 'dashboard']);
    if (!ids.trim()) {
      // Recovery after a partial shutdown: run only a read-only DB/SQLite query,
      // never start the Dashboard server or its schedules/dependencies.
      return JSON.parse(await this.compose(['run', '--rm', '--no-deps', '--entrypoint', 'node', 'dashboard', '-e', SNAPSHOT_CODE]));
    }
    return JSON.parse(await this.run('docker', ['exec', ids.trim(), 'node', '-e', SNAPSHOT_CODE]));
  }
  async status() {
    const state = this.state();
    const result = { mode: state?.mode || 'UNMANAGED', inhibited: fs.existsSync(this.inhibitFile),
      migrationReady: state?.migrationReady === true, containers: await this.containers() };
    this.log(JSON.stringify(result, null, 2)); return result;
  }
  async stop({ retire = false, shutdown = false, skipSync = false } = {}) {
    this.log(retire ? '[Aterum] Retirando esta PC para migración…' : '[Aterum] Iniciando apagado…');
    await this.compose(['config', '--quiet']);
    // Preflight privileges before changing persistent state.
    const load = await this.run('systemctl', ['show', '--property=LoadState', '--value', `aterum-gui-tunnel@${this.user}.service`]);
    if (load && load !== 'not-found') await this.run('sudo', ['-n', '-l', '--', '/usr/bin/systemctl', 'stop', `aterum-gui-tunnel@${this.user}.service`]);
    const previous = this.state();
    // An ordinary Windows/systemd shutdown must preserve automatic startup intent.
    if (!shutdown || retire || previous?.mode === 'RETIRED') this.inhibit();
    fs.rmSync(path.join(this.directory, 'handoff.json'), { force: true });
    this.save({ mode: retire || previous?.mode === 'RETIRED' ? 'RETIRED' : 'STOPPING', migrationReady: false,
      requiresHandoff: previous?.requiresHandoff === true });
    const errors = [];
    const attempt = async fn => { try { return await fn(); } catch (error) { errors.push(error.message); return null; } };
    this.log('[Aterum] Deteniendo ngrok…');
    await attempt(() => this.tunnel('stop'));
    const remainingTunnel = await attempt(() => this.inspectTunnel());
    if (remainingTunnel) errors.push('EXTERNAL_NGROK_TUNNEL_STILL_RUNNING');
    const before = await this.containers();
    const running = new Set(before.filter(c => c.running || c.restarting || c.paused).map(c => c.service));
    // Stop producers while the executor and databases still remain available.
    const stopService = async service => {
      if (running.has(service)) {
        this.log(`[Aterum] Deteniendo ${service}; esperando sus operaciones en curso…`);
        await this.compose(['stop', '--timeout', '-1', service]);
        this.log(`[Aterum] ${service} detenido.`);
      }
    };
    await attempt(() => stopService('telegram_control'));
    await attempt(() => stopService('n8n'));
    await attempt(() => stopService('position_guard'));
    if (this.telegramSync && !skipSync && running.has('dashboard')) {
      this.log('[Aterum] Cifrando historial local de Telegram…');
      await attempt(() => this.telegramSync.capture());
    }
    let drain = null;
    this.log('[Aterum] Comprobando ejecuciones pendientes…');
    if (running.has('dashboard') || running.has('mysql')) drain = await attempt(() => this.snapshot());
    else if (previous?.migrationReady) drain = { workflows: 0, executions: 0 };
    else errors.push('DRAIN_NOT_VERIFIED: start and reconcile before declaring migration ready');
    if (drain && (drain.workflows || drain.executions)) errors.push('PENDING_WORKFLOWS_OR_EXECUTIONS');
    if (drain) this.log(`[Aterum] Pendientes: workflows=${drain.workflows}, ejecuciones=${drain.executions}.`);
    const writers = await attempt(() => this.containers());
    for (const service of ['n8n', 'position_guard']) {
      const c = writers?.find(c => c.service === service);
      if (c && (c.running || c.restarting || c.paused || ![0, 143].includes(c.exitCode))) errors.push(`UNCLEAN_SHUTDOWN: ${service}`);
    }
    // Stops the whole Compose project, including optional services; does not remove volumes.
    // Older Python images running as PID 1 ignore default SIGTERM. SIGINT is handled
    // by Python and lets serve_forever unwind; it is not a forced SIGKILL.
    if (running.has('typesafe_adapter')) await attempt(async () => {
      this.log('[Aterum] Deteniendo adaptador Python con SIGINT…');
      const id = await this.compose(['ps', '--quiet', 'typesafe_adapter']);
      if (id.trim()) await this.run('docker', ['kill', '--signal=SIGINT', id.trim()]);
    });
    this.log('[Aterum] Deteniendo GUI, adaptador y proxy…');
    await attempt(() => this.compose(['stop', '--timeout', '-1', 'nginx', 'aterum_gui', 'typesafe_adapter', 'dashboard']));
    this.log('[Aterum] Deteniendo Redis y MariaDB; conservando los volúmenes…');
    await attempt(() => this.compose(['stop', '--timeout', '-1', 'redis', 'mysql']));
    await attempt(() => this.compose(['stop', '--timeout', '-1']));
    const after = await attempt(() => this.containers());
    if (!after || after.some(c => c.running || c.restarting || c.paused)) errors.push('CONTAINERS_NOT_ALL_STOPPED');
    for (const service of ['mysql', 'redis']) {
      const c = after?.find(c => c.service === service);
      if (c && ![0, 143].includes(c.exitCode)) errors.push(`UNCLEAN_STORAGE_SHUTDOWN: ${service}`);
    }
    if (this.telegramSync && !skipSync && (running.has('dashboard') || fs.existsSync(this.telegramSync.pendingFile))) {
      this.log('[Aterum] Publicando historial cifrado de Telegram…');
      await attempt(() => this.telegramSync.publish());
    } else if (this.telegramSync && !skipSync && retire && !previous?.migrationReady) errors.push('TELEGRAM_SYNC_SNAPSHOT_MISSING');
    const migrationReady = errors.length === 0 && drain?.workflows === 0 && drain?.executions === 0;
    const state = { mode: retire || previous?.mode === 'RETIRED' ? 'RETIRED' : 'STOPPED', migrationReady, drain, errors,
      stoppedAt: this.now(), services: after || [], requiresHandoff: previous?.requiresHandoff === true };
    this.save(state);
    if (state.mode === 'RETIRED' && migrationReady) {
      const receipt = { schema: 'aterum-handoff-v1', hostId: this.hostId, migrationReady: true,
        stoppedAt: state.stoppedAt, drain, containersStopped: true, tunnelStopped: true,
        requiresFinalBackup: true, note: 'Local receipt only. Confirm source remains stopped before takeover.' };
      atomicJson(path.join(this.directory, 'handoff.json'), receipt);
      this.log(`PC retirada. Constancia: ${path.join(this.directory, 'handoff.json')}`);
    }
    this.log(`Aterum detenido. Preparado para migración: ${migrationReady ? 'sí' : 'NO'}. Volúmenes y órdenes Binance conservados.`);
    if (migrationReady && this.gitControl) {
      this.log('[Aterum] Publicando retirada verificada en Git…');
      try { await this.gitControl.release(this.hostId); }
      catch (error) { this.save({ ...state, gitReleasePending: true }); throw error; }
    }
    if (errors.length) throw new Error(errors.join('; '));
    return state;
  }
  async healthy(services, limit = 60) {
    for (let i = 0; i < limit; i++) {
      const rows = await this.containers();
      if (services.every(s => rows.some(c => c.service === s && c.running && !c.paused && !c.restarting && c.health === 'healthy'))) return;
      await this.sleep(3000);
    }
    throw new Error('STARTUP_HEALTH_TIMEOUT');
  }
  async start({ boot = false, reactivate = false, handoff = null, firstInstall = false } = {}) {
    const previous = this.state();
    if (boot && fs.existsSync(this.inhibitFile)) { this.log('Arranque omitido: PC detenida o retirada.'); return; }
    if (!this.gitControl && previous?.mode === 'RETIRED' && !reactivate) throw new Error('PC_RETIRED: use --reactivate only after stopping the other PC');
    if (handoff) {
      const receipt = readJson(handoff);
      if (receipt?.schema !== 'aterum-handoff-v1' || !receipt.migrationReady || !receipt.containersStopped
          || !receipt.tunnelStopped || receipt.drain?.workflows !== 0 || receipt.drain?.executions !== 0
          || receipt.hostId === this.hostId) throw new Error('INVALID_HANDOFF_RECEIPT');
    }
    if (!this.gitControl && (!previous || previous.requiresHandoff) && !handoff && !firstInstall)
      throw new Error('FIRST_START_REQUIRES: --handoff <file> or --first-install for this existing sole installation');
    await this.compose(['config', '--quiet']);
    if (this.gitControl) {
      this.log('[Aterum] Consultando Git y reservando esta PC antes de iniciar servicios…');
      await this.gitControl.claim(this.hostId);
    }
    this.save({ mode: 'STARTING', migrationReady: false, requiresHandoff: previous?.requiresHandoff === true });
    // Inhibit remains until core services are healthy, preventing premature ngrok announcements.
    try {
      this.log('[Aterum] Iniciando MariaDB y Redis…');
      await this.compose(['up', '-d', 'mysql', 'redis']);
      await this.healthy(['mysql', 'redis']);
      this.log('[Aterum] Iniciando GUI, Chart API, adaptador y Position Guard…');
      await this.compose(['up', '-d', 'dashboard', 'aterum_gui', 'typesafe_adapter', 'position_guard']);
      await this.healthy(['dashboard', 'aterum_gui', 'typesafe_adapter', 'position_guard']);
      if (this.telegramSync) {
        this.log('[Aterum] Importando historial cifrado de Telegram antes de iniciar el bot…');
        const synced = await this.telegramSync.pull();
        this.syncImportCompleted = true;
        this.log(`[Aterum] Historial: ${synced.snapshots} instantáneas, ${synced.auditAdded} consultas y ${synced.deliveriesAdded} entregas nuevas.`);
      }
      // Executor reconciles before schedules and Telegram consumer are resumed.
      this.log('[Aterum] Iniciando n8n…');
      await this.compose(['up', '-d', 'n8n']);
      await this.healthy(['n8n']);
      this.log('[Aterum] Iniciando Telegram y proxy…');
      await this.compose(['up', '-d', 'telegram_control', 'nginx']);
      await this.healthy(['telegram_control', 'nginx']);
      fs.rmSync(this.inhibitFile, { force: true });
      this.log('[Aterum] Iniciando túnel ngrok…');
      await this.tunnel('start');
      this.save({ mode: 'ACTIVE', migrationReady: false, startedAt: this.now() });
      this.log('Aterum activo. Se conservaron las banderas y workflows existentes.');
    } catch (error) {
      this.log('Falló el arranque; deteniendo servicios para evitar una instalación parcial.');
      try { await this.stop({ retire: previous?.mode === 'RETIRED', skipSync: !this.syncImportCompleted }); } catch (_) {}
      if (!this.syncImportCompleted) this.save({ ...this.state(), migrationReady: false,
        startupError: 'STARTUP_INCOMPLETE_BEFORE_SYNC' });
      throw error;
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!['status', 'start', 'stop', 'migrate'].includes(command)) {
    console.log('Uso: aterum status | start [--handoff ARCHIVO | --first-install | --reactivate] | stop | migrate');
    return command ? 1 : 0;
  }
  const accepted = command === 'start' ? new Set(['--boot', '--reactivate', '--first-install', '--handoff'])
    : command === 'stop' ? new Set(['--shutdown']) : new Set();
  let handoff = null;
  for (let i = 0; i < args.length; i++) {
    if (!accepted.has(args[i])) throw new Error('UNKNOWN_ARGUMENT');
    if (args[i] === '--handoff') { handoff = args[++i]; if (!handoff || handoff.startsWith('--')) throw new Error('HANDOFF_FILE_REQUIRED'); }
  }
  const controller = new HostController({ gitControl: new GitControl({ root: ROOT }) });
  if (command === 'status') { await controller.status(); return 0; }
  controller.telegramSync = new TelegramHistorySync({ root: ROOT, directory: controller.directory,
    hostId: controller.hostId, compose: args => controller.compose(args) });
  fs.mkdirSync(controller.directory, { recursive: true, mode: 0o700 });
  const lock = path.join(controller.directory, 'lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (_) { throw new Error('CONTROL_BUSY: another command or stale lock; check before removing'); }
  try {
    if (command === 'start') await controller.start({ boot: args.includes('--boot'), reactivate: args.includes('--reactivate'),
      firstInstall: args.includes('--first-install'), handoff });
    else await controller.stop({ retire: command === 'migrate', shutdown: args.includes('--shutdown') });
  } finally { fs.rmdirSync(lock); }
  return 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { HostController, main, atomicJson };
