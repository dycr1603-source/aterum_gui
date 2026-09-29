'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const workflowId = process.env.N8N_TRADING_WORKFLOW_ID || 'Cz4TfvaVAygWGRJm';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const payloadPath = process.argv[2] || '/tmp/aterum-research-ai-workflow.json';
if (!fs.existsSync(payloadPath)) throw new Error('workflow payload missing');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const desired = Array.isArray(payload) ? payload[0] : payload;
const desiredNodes = JSON.stringify(desired.nodes);
const desiredConnections = JSON.stringify(desired.connections);
const protectedNames = new Set(['Daily Analysis Report', 'Weekly Deep Analysis']);
for (const name of protectedNames) {
  const node = desired.nodes.find(item => item.name === name);
  if (!node?.parameters?.jsCode?.includes('researchCapacityPreflight.call(this)')) {
    throw new Error(`${name}: preflight not found in payload`);
  }
}

const backupDir = path.join(path.dirname(databasePath), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const backupPath = path.join(backupDir, `database.sqlite.before-research-ai-${stamp}`);
fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);

const db = new DatabaseSync(databasePath);
try {
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('BEGIN IMMEDIATE');
  const current = db.prepare('SELECT id,active,nodes,connections,versionId,activeVersionId,versionCounter FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || Number(current.active) !== 1) throw new Error('expected active trading workflow not found');
  const currentNodes = JSON.parse(current.nodes);
  const targetNodes = new Map(desired.nodes.map(node => [node.name, node]));
  if (currentNodes.length !== desired.nodes.length) throw new Error('workflow node count changed; refusing publish');
  for (const oldNode of currentNodes) {
    const next = targetNodes.get(oldNode.name);
    if (!next) throw new Error(`workflow node missing: ${oldNode.name}`);
    if (!protectedNames.has(oldNode.name) && JSON.stringify(oldNode) !== JSON.stringify(next)) {
      throw new Error(`unexpected change outside research reports: ${oldNode.name}`);
    }
    if (protectedNames.has(oldNode.name) && oldNode.parameters.jsCode.includes('researchCapacityPreflight.call(this)')) {
      throw new Error(`${oldNode.name}: active workflow already contains preflight`);
    }
  }
  if (JSON.stringify(JSON.parse(current.connections)) !== desiredConnections) throw new Error('workflow connections changed; refusing publish');

  const versionId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const activeHistory = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?').get(workflowId, current.activeVersionId);
  if (!activeHistory) throw new Error('active workflow history version not found');
  db.prepare(`INSERT INTO workflow_history
      (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, workflowId, 'Aterum Codex', now, now, desiredNodes, desiredConnections,
      desired.name, 0, desired.description || activeHistory.description || null,
      JSON.stringify(desired.nodeGroups ?? (activeHistory.nodeGroups ? JSON.parse(activeHistory.nodeGroups) : null)));
  db.prepare(`UPDATE workflow_entity SET nodes=?,connections=?,versionId=?,activeVersionId=?,
      versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
    .run(desiredNodes, desiredConnections, versionId, versionId, now, workflowId);
  db.exec('COMMIT');
  console.log(`Published protected research preflight to active workflow ${workflowId}; backup=${backupPath}`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally {
  db.close();
}
