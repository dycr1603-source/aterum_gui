#!/usr/bin/env node
'use strict';

// Offline n8n workflow deployment. n8n must be stopped so its SQLite writer is unique.
// The only network-dependent action in this script is Docker talking to the local daemon.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
require('../services/load_env');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, 'bot-control/workflows/current');
const STATE_FILE = path.join(ROOT, '.local/workflow-sync.json');
const VOLUME = process.env.ATERUM_N8N_VOLUME || 'aterum_n8n_data';
const N8N_IMAGE = process.env.ATERUM_N8N_IMAGE || 'aterum-n8n-compat:local';
const SQLITE_IMAGE = process.env.ATERUM_SQLITE_IMAGE || 'aterum-dashboard:local';
const WORKFLOWS = [
  ['sl-monitor.workflow.json', 'ZYhtV8yWXjNukrW4', 'SL Monitor'],
  ['trailing-manager.workflow.json', 'q32UEjoj5wNiBHil', 'Trailing Manager'],
  ['recommendation-review-engine.workflow.json', 'RecommendationReviewEngine', 'Recommendation Review Engine'],
  ['advanced-ai-trading-bot-v2-clean.workflow.json', 'Cz4TfvaVAygWGRJm', 'Advanced AI Trading Bot v2 - Clean'],
];

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function graphHash(w) {
  return digest(JSON.stringify(stable({ name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings })));
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    env: process.env, ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${String(result.stderr || result.stdout).trim().slice(0, 1200)}`);
  return result.stdout.trim();
}
function sql(query) {
  const output = run('docker', ['run', '--rm', '--network', 'none', '-v', `${VOLUME}:/data:ro`,
    '--entrypoint', 'sqlite3', SQLITE_IMAGE, '-json', '-readonly', '/data/database.sqlite', query]);
  return output ? JSON.parse(output) : [];
}
function snapshot() {
  const workflows = sql('SELECT id,name,active,versionId,activeVersionId,nodes,connections,settings FROM workflow_entity');
  const histories = sql('SELECT workflowId,versionId,name,nodes,connections FROM workflow_history');
  const credentials = sql('SELECT id,name,type FROM credentials_entity');
  const sharedCredentials = sql('SELECT credentialsId,projectId FROM shared_credentials');
  return { workflows, histories, credentials, sharedCredentials };
}
function parseWorkflowRow(row) {
  return { ...row, nodes: JSON.parse(row.nodes), connections: JSON.parse(row.connections), settings: JSON.parse(row.settings) };
}
function requireStopped() {
  const services = run('docker', ['ps', '--filter', 'label=com.docker.compose.project=aterum',
    '--format', '{{.Label "com.docker.compose.service"}}']).split('\n').filter(Boolean);
  if (services.includes('n8n')) throw new Error('N8N_MUST_BE_STOPPED: run docker compose stop n8n before syncing');
  if (services.includes('telegram_control')) throw new Error('TELEGRAM_CONSUMER_MUST_BE_STOPPED: stop telegram_control before syncing');
}
function missingEnv(names) {
  return names.filter(name => !process.env[name] || /^(change_me|your_|placeholder)/i.test(process.env[name]));
}
function n8nCli(args, importDir) {
  return run('docker', ['run', '--rm', '--network', 'none', '--user', '1000:1000',
    '-v', `${VOLUME}:/home/node/.n8n`, '-v', `${importDir}:/imports:ro`,
    '-e', 'N8N_ENCRYPTION_KEY', '--entrypoint', 'n8n', N8N_IMAGE, ...args]);
}
function atomicState(value) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, STATE_FILE);
}
function sourceWorkflow(file, id, name, telegramCredential) {
  const original = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8'));
  const source = Array.isArray(original) ? original[0] : original;
  if (source.id !== id || source.name !== name || !Array.isArray(source.nodes)) throw new Error(`SOURCE_MISMATCH: ${file}`);
  // Delcon's workflow version, static state and credential ID are never imported.
  const w = { id, name, active: false, nodes: structuredClone(source.nodes),
    connections: source.connections || {}, settings: source.settings || { executionOrder: 'v1' } };
  for (const node of w.nodes) for (const [type, ref] of Object.entries(node.credentials || {})) {
    if (type !== 'telegramApi') throw new Error(`UNMAPPED_CREDENTIAL: ${name}/${node.name}/${type}`);
    if (!telegramCredential) throw new Error(`MISSING_INTEGRATION: n8n Telegram API credential required by ${name}/${node.name}`);
    node.credentials[type] = { id: telegramCredential.id, name: telegramCredential.name };
  }
  return w;
}
function ensureTelegramCredential(current, tempDir) {
  const refs = WORKFLOWS.some(([file]) => fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8').includes('telegramApi'));
  if (!refs) return null;
  let candidates = current.credentials.filter(c => c.type === 'telegramApi');
  if (process.env.ATERUM_TELEGRAM_CREDENTIAL_ID) candidates = candidates.filter(c => c.id === process.env.ATERUM_TELEGRAM_CREDENTIAL_ID);
  if (candidates.length > 1) throw new Error('MULTIPLE_TELEGRAM_CREDENTIALS: set ATERUM_TELEGRAM_CREDENTIAL_ID in local .env');
  if (candidates.length === 1) {
    const credential = candidates[0];
    if (!current.sharedCredentials.some(s => s.credentialsId === credential.id)) throw new Error('TELEGRAM_CREDENTIAL_NOT_SHARED_WITH_PROJECT');
    return credential;
  }
  const missing = missingEnv(['TELEGRAM_BOT_TOKEN']);
  if (missing.length) throw new Error('MISSING_INTEGRATION: Telegram Bot API needs TELEGRAM_BOT_TOKEN in local .env');
  const credential = { id: crypto.randomUUID(), name: 'Aterum Telegram (Saitama local)', type: 'telegramApi' };
  const file = path.join(tempDir, 'telegram-credential.json');
  fs.writeFileSync(file, JSON.stringify([{ ...credential, data: { accessToken: process.env.TELEGRAM_BOT_TOKEN } }]),
    { mode: 0o600, flag: 'wx' });
  try { n8nCli(['import:credentials', '--input=/imports/telegram-credential.json'], tempDir); }
  finally { fs.unlinkSync(file); }
  const updated = snapshot();
  if (!updated.credentials.some(c => c.id === credential.id && c.type === credential.type)
      || !updated.sharedCredentials.some(s => s.credentialsId === credential.id)) throw new Error('TELEGRAM_CREDENTIAL_IMPORT_NOT_VERIFIED');
  console.log('Credencial local Telegram creada y asignada al proyecto n8n (valor oculto).');
  return credential;
}
function verifySaved(actual, desired) {
  if (!actual || graphHash(parseWorkflowRow(actual)) !== graphHash(desired)) throw new Error(`SAVED_VERSION_MISMATCH: ${desired.name}`);
  if (!actual.versionId) throw new Error(`SAVED_VERSION_MISSING: ${desired.name}`);
}
function verifyPublished(actual, history, desired) {
  if (actual.active !== 1 || actual.activeVersionId !== actual.versionId) throw new Error(`PUBLISHED_VERSION_MISMATCH: ${desired.name}`);
  const published = history.find(h => h.workflowId === desired.id && h.versionId === actual.activeVersionId);
  if (!published || graphHash({ name: published.name || desired.name, nodes: JSON.parse(published.nodes),
    connections: JSON.parse(published.connections), settings: desired.settings }) !== graphHash(desired))
    throw new Error(`PUBLISHED_CONTENT_MISMATCH: ${desired.name}`);
}
function assertNoConflict(current, desired, record) {
  const sameId = current.workflows.filter(w => w.id === desired.id);
  const sameName = current.workflows.filter(w => w.name === desired.name);
  if (sameId.length > 1 || sameName.length > 1 || sameName.some(w => w.id !== desired.id))
    throw new Error(`DUPLICATE_WORKFLOW: ${desired.name}`);
  if (sameId.length && sameId[0].name !== desired.name) throw new Error(`WORKFLOW_ID_COLLISION: ${desired.id}`);
  if (sameId.length && !record) throw new Error(`UNMANAGED_WORKFLOW: ${desired.name}; inspect locally before adopting`);
  if (sameId.length && record) {
    const liveHash = graphHash(parseWorkflowRow(sameId[0]));
    const allowed = [record.deployedHash];
    if (record.status === 'importing' && record.previousHash) allowed.push(record.previousHash);
    if (!allowed.includes(liveHash) || (record.status !== 'importing' && record.savedVersionId
      && sameId[0].versionId !== record.savedVersionId))
      throw new Error(`LOCAL_WORKFLOW_MODIFIED: ${desired.name}; refusing to overwrite`);
  }
  return sameId[0] || null;
}
function requiredForPublish(name) {
  const common = ['N8N_ENCRYPTION_KEY', 'BINANCE_API_KEY', 'BINANCE_API_SECRET', 'EXECUTION_ENGINE_TOKEN'];
  if (name === 'Recommendation Review Engine') return ['N8N_ENCRYPTION_KEY'];
  if (name === 'SL Monitor') return [...common, 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  if (name === 'Trailing Manager') return common;
  // Research nodes explicitly fall back to ANTHROPIC_API_KEY when the dedicated key is absent.
  return [...common, 'ANTHROPIC_API_KEY', 'RESEARCH_AI_AUDIT_TOKEN'];
}
function main(argv = process.argv.slice(2)) {
  const publish = argv.includes('--publish');
  if (argv.some(arg => arg !== '--publish')) throw new Error('USAGE: node scripts/sync-local-workflows.js [--publish]');
  if (process.env.N8N_TRADING_DISABLED !== '1') throw new Error('SAFETY_BLOCK: set N8N_TRADING_DISABLED=1 in local .env');
  const missingCore = missingEnv(['N8N_ENCRYPTION_KEY']);
  if (missingCore.length) throw new Error('MISSING_INTEGRATION: local n8n requires N8N_ENCRYPTION_KEY');
  requireStopped();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-workflow-sync-'));
  fs.chmodSync(tempDir, 0o700);
  try {
    let current = snapshot();
    const credential = ensureTelegramCredential(current, tempDir);
    current = snapshot();
    const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { schema: 1, workflows: {} };
    if (state.schema !== 1) throw new Error('UNSUPPORTED_SYNC_STATE');
    const desired = WORKFLOWS.map(([file, id, name]) => sourceWorkflow(file, id, name, credential));
    // All conflicts and missing integrations are checked before changing any workflow.
    for (const w of desired) assertNoConflict(current, w, state.workflows[w.id]);
    if (publish) for (const w of desired) {
      const missing = missingEnv(requiredForPublish(w.name));
      if (missing.length) throw new Error(`MISSING_INTEGRATION: ${w.name} needs ${missing.join(', ')} in local .env`);
    }
    for (const w of desired) {
      const deployedHash = graphHash(w);
      const existing = current.workflows.find(row => row.id === w.id);
      if (!existing || graphHash(parseWorkflowRow(existing)) !== deployedHash) {
        // Record the intended result before import, so a crash after import is recoverable.
        state.workflows[w.id] = { name: w.name, deployedHash,
          previousHash: existing ? graphHash(parseWorkflowRow(existing)) : null,
          sourceHash: digest(fs.readFileSync(path.join(WORKFLOW_DIR,
            WORKFLOWS.find(([, id]) => id === w.id)[0]))), status: 'importing' };
        atomicState(state);
        const file = path.join(tempDir, `${w.id}.json`);
        fs.writeFileSync(file, JSON.stringify(w), { mode: 0o600, flag: 'wx' });
        try { n8nCli(['import:workflow', `--input=/imports/${w.id}.json`], tempDir); }
        finally { fs.unlinkSync(file); }
        current = snapshot();
        verifySaved(current.workflows.find(row => row.id === w.id), w);
        state.workflows[w.id].status = 'saved';
        state.workflows[w.id].savedVersionId = current.workflows.find(row => row.id === w.id).versionId;
        delete state.workflows[w.id].previousHash;
        atomicState(state);
        console.log(`${w.name}: versión guardada verificada; despublicado por la importación.`);
      } else {
        verifySaved(existing, w);
        state.workflows[w.id] = { name: w.name, deployedHash, savedVersionId: existing.versionId,
          sourceHash: digest(fs.readFileSync(path.join(WORKFLOW_DIR,
            WORKFLOWS.find(([, id]) => id === w.id)[0]))), status: existing.active ? 'published' : 'saved' };
        atomicState(state);
        console.log(`${w.name}: sin cambios; versión guardada verificada.`);
      }
      const saved = current.workflows.find(row => row.id === w.id);
      if (publish && (!saved.active || saved.activeVersionId !== saved.versionId)) {
        n8nCli(['publish:workflow', `--id=${w.id}`, `--versionId=${saved.versionId}`], tempDir);
        current = snapshot();
      }
      if (publish) {
        verifyPublished(current.workflows.find(row => row.id === w.id), current.histories, w);
        state.workflows[w.id].status = 'published';
        atomicState(state);
        console.log(`${w.name}: versión publicada verificada.`);
      } else console.log(`${w.name}: publicación ${saved.active && saved.activeVersionId === saved.versionId ? 'vigente' : 'pendiente'}; entradas bloqueadas.`);
    }
    const final = snapshot();
    for (const w of desired) {
      const row = final.workflows.find(x => x.id === w.id);
      verifySaved(row, w);
      if (publish) verifyPublished(row, final.histories, w);
    }
    console.log(`Sin duplicados: ${desired.length} workflows gestionados; N8N_TRADING_DISABLED=1.`);
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { graphHash, sourceWorkflow, assertNoConflict, verifySaved, verifyPublished, main };
