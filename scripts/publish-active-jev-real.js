'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const workflowId = process.env.N8N_TRADING_WORKFLOW_ID || 'Cz4TfvaVAygWGRJm';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const payloadPath = process.argv[2] || '/tmp/aterum-jev-real-workflow.json';
const desired = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))[0];
const changed = ['Jev Entry Gate', 'Position Sizer', 'Build Entry Rejection', 'Build Trade Alert'];
const target = new Map(desired.nodes.map(node => [node.name, node]));
for (const name of changed) if (!target.get(name)?.parameters?.jsCode) throw new Error(`Missing ${name}`);
if (!target.get('Position Sizer').parameters.jsCode.includes('BASE_RISK_PCT  = 0.02'))
  throw new Error('Active risk percentage would change');
if (!target.get('Position Sizer').parameters.jsCode.includes('riskPerUnit')) throw new Error('Fee-aware sizing missing');

const db = new DatabaseSync(databasePath);
let backupPath;
try {
  db.exec('PRAGMA busy_timeout=5000');
  const current = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || Number(current.active) !== 1) throw new Error('Active trading workflow not found');
  const nodes = JSON.parse(current.nodes);
  if (JSON.stringify(JSON.parse(current.connections)) !== JSON.stringify(desired.connections))
    throw new Error('Workflow topology differs from reviewed snapshot');
  const byName = new Map(nodes.map(node => [node.name, node]));
  if (nodes.length !== desired.nodes.length) throw new Error('Workflow node count changed');
  for (const name of changed) {
    const old = byName.get(name), next = target.get(name);
    if (!old || old.type !== next.type) throw new Error(`Unexpected node identity: ${name}`);
    if (old.parameters.jsCode === next.parameters.jsCode) throw new Error(`${name} already published`);
  }
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  backupPath = path.join(backupDir, `database.sqlite.before-jev-real-${stamp}`);
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  db.exec('BEGIN IMMEDIATE');
  for (const name of changed) byName.get(name).parameters.jsCode = target.get(name).parameters.jsCode;
  const activeHistory = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?')
    .get(workflowId, current.activeVersionId);
  if (!activeHistory) throw new Error('Active history version missing');
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const nodesJson = JSON.stringify(nodes);
  db.prepare(`INSERT INTO workflow_history
    (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, workflowId, 'Aterum Codex', now, now, nodesJson, current.connections,
      current.name, 0, activeHistory.description || null, activeHistory.nodeGroups || null);
  db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
    versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
    .run(nodesJson, versionId, versionId, now, workflowId);
  db.exec('COMMIT');
  console.log(`Published Jev real to active workflow ${workflowId}; backup=${backupPath}`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally { db.close(); }
