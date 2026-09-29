'use strict';

// Publishes only the "Trailing Manager Code" node into the active n8n Trailing Manager version.
// Run with n8n stopped, e.g.:
//   docker compose stop n8n
//   cp scripts/publish-active-trailing-manager.js /tmp/ && \
//     docker compose run --rm --no-deps --entrypoint node n8n /imports/publish-active-trailing-manager.js \
//     /repo-workflows/trailing-manager.workflow.json
//   docker compose start n8n
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const workflowId = process.env.N8N_TRAILING_WORKFLOW_ID || 'q32UEjoj5wNiBHil';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const payloadPath = process.argv[2] || '/repo-workflows/trailing-manager.workflow.json';
const dryRun = process.argv.includes('--dry-run');
const protectedName = 'Trailing Manager Code';

if (!fs.existsSync(payloadPath)) throw new Error('workflow payload missing');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const desired = Array.isArray(payload) ? payload[0] : payload;
const desiredCode = desired.nodes.find(node => node.name === protectedName)?.parameters?.jsCode;
if (!desiredCode?.includes('function planProtection(')) throw new Error(`${protectedName}: profit-aware protection not found in payload`);
const desiredConnections = JSON.stringify(desired.connections);

let backupPath = null;
if (!dryRun) {
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  backupPath = path.join(backupDir, `database.sqlite.before-trailing-profit-${stamp}`);
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
}

const db = new DatabaseSync(databasePath);
try {
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('BEGIN IMMEDIATE');
  const current = db.prepare('SELECT id,active,nodes,connections,versionId,activeVersionId FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || Number(current.active) !== 1) throw new Error('expected active Trailing Manager workflow not found');
  if (current.versionId !== current.activeVersionId) throw new Error('Trailing Manager has an unpublished draft; refusing publish');
  const currentNodes = JSON.parse(current.nodes);
  if (JSON.stringify(JSON.parse(current.connections)) !== desiredConnections) throw new Error('workflow connections changed; refusing publish');

  // Keep live node ids/positions/credentials; replace only the protected node's code.
  const nextNodes = currentNodes.map(node => {
    const wanted = desired.nodes.find(item => item.name === node.name);
    if (!wanted) throw new Error(`workflow node missing from payload: ${node.name}`);
    if (node.name !== protectedName) {
      if (JSON.stringify(node.parameters) !== JSON.stringify(wanted.parameters)) {
        throw new Error(`unexpected change outside ${protectedName}: ${node.name}`);
      }
      return node;
    }
    if (node.parameters.jsCode.includes('function planProtection(')) throw new Error('active workflow already contains profit-aware protection');
    return { ...node, parameters: { ...node.parameters, jsCode: desiredCode } };
  });
  if (currentNodes.length !== desired.nodes.length) throw new Error('workflow node count changed; refusing publish');

  const nodesJson = JSON.stringify(nextNodes);
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const activeHistory = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?').get(workflowId, current.activeVersionId);
  if (!activeHistory) throw new Error('active workflow history version not found');
  db.prepare(`INSERT INTO workflow_history
      (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, workflowId, 'Aterum Codex', now, now, nodesJson, current.connections,
      activeHistory.name, 0, activeHistory.description || null, activeHistory.nodeGroups ?? null);
  db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
      versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
    .run(nodesJson, versionId, versionId, now, workflowId);
  if (dryRun) {
    db.exec('ROLLBACK');
    console.log(`Dry run OK: Trailing Manager ${workflowId} would move ${current.activeVersionId} -> new version`);
  } else {
    db.exec('COMMIT');
    console.log(`Published profit-aware Trailing Manager to ${workflowId} version ${versionId}; backup=${backupPath}`);
  }
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally {
  db.close();
}
