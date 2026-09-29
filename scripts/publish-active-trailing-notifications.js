'use strict';

// Run with n8n stopped. Only the message builder and sender are published.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const workflowId = process.env.N8N_TRAILING_WORKFLOW_ID || 'q32UEjoj5wNiBHil';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const payloadPath = process.argv[2] || '/repo-workflows/trailing-manager.workflow.json';
const dryRun = process.argv.includes('--dry-run');
const desired = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const targets = new Map(desired.nodes.map(n => [n.name, n]));
const names = new Set(['Trailing Manager Code', 'Telegram: SL Updated']);
const nextCode = targets.get('Trailing Manager Code')?.parameters?.jsCode;
const sender = targets.get('Telegram: SL Updated');
if (!nextCode?.includes('const protectionLabel=') || sender?.type !== 'n8n-nodes-base.code'
    || !sender.parameters.jsCode.includes('/internal/notifications/telegram'))
  throw new Error('Reviewed notification code missing');
const policy = code => code.slice(code.indexOf('// ── Protection policy'), code.indexOf('// ── Fetch estado'));
const db = new DatabaseSync(databasePath);
try {
  db.exec('PRAGMA busy_timeout=5000');
  const current = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || !current.active || current.versionId !== current.activeVersionId)
    throw new Error('Active workflow missing or unpublished draft present');
  const nodes = JSON.parse(current.nodes);
  if (JSON.stringify(JSON.parse(current.connections)) !== JSON.stringify(desired.connections)
      || nodes.length !== desired.nodes.length) throw new Error('Workflow topology differs');
  for (const n of nodes) {
    const wanted = targets.get(n.name);
    if (!wanted || wanted.id !== n.id) throw new Error('Node identity differs');
    if (!names.has(n.name) && (n.type !== wanted.type || JSON.stringify(n.parameters) !== JSON.stringify(wanted.parameters)))
      throw new Error('Unexpected change outside notifications');
  }
  const oldCode = nodes.find(n => n.name === 'Trailing Manager Code').parameters.jsCode;
  if (!oldCode.includes('function planProtection(') || policy(oldCode) !== policy(nextCode))
    throw new Error('Protection policy would change');
  if (nodes.find(n => n.name === 'Telegram: SL Updated').type === 'n8n-nodes-base.code'
      && oldCode === nextCode) { console.log('Trailing notifications already published'); process.exit(0); }
  for (const name of names) new Function('return (async()=>{' + targets.get(name).parameters.jsCode + '})');
  const history = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?')
    .get(workflowId, current.activeVersionId);
  if (!history) throw new Error('Active history missing');
  if (dryRun) { console.log('Dry run OK: only trailing message builder and persisted sender change'); process.exit(0); }
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `database.sqlite.before-trailing-notifications-${Date.now()}`);
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  const updated = nodes.map(n => {
    if (!names.has(n.name)) return n;
    const wanted = targets.get(n.name);
    const next = { ...n, type: wanted.type, typeVersion: wanted.typeVersion, parameters: wanted.parameters };
    if (n.name === 'Telegram: SL Updated') { delete next.credentials; delete next.webhookId; }
    return next;
  });
  const versionId = crypto.randomUUID();
  const at = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const json = JSON.stringify(updated);
  db.exec('BEGIN IMMEDIATE');
  db.prepare(`INSERT INTO workflow_history
    (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(versionId, workflowId, 'Aterum Codex', at, at, json,
      current.connections, current.name, 0, history.description || null, history.nodeGroups || null);
  db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
    versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
    .run(json, versionId, versionId, at, workflowId);
  db.exec('COMMIT');
  console.log(`Published trailing notifications version ${versionId}; backup=${backupPath}`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally { db.close(); }
