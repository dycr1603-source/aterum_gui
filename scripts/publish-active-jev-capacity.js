'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const workflowId = process.env.N8N_TRADING_WORKFLOW_ID || 'Cz4TfvaVAygWGRJm';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const desired = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/aterum-jev-capacity-workflow.json', 'utf8'))[0];
const changed = ['Execute Trade', 'Build Execution Failure'];
const target = new Map(desired.nodes.map(node => [node.name, node]));
if (!target.get('Execute Trade')?.parameters?.jsCode.includes("failureCategory:'PRE_EXECUTION_CAPACITY'"))
  throw new Error('Reviewed capacity rejection missing');
if (!target.get('Build Execution Failure')?.parameters?.jsCode.includes('pre-execution-capacity:'))
  throw new Error('Reviewed notification dedupe missing');

const db = new DatabaseSync(databasePath);
try {
  db.exec('PRAGMA busy_timeout=5000');
  const current = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || Number(current.active) !== 1) throw new Error('Active trading workflow not found');
  const nodes = JSON.parse(current.nodes);
  if (nodes.length !== desired.nodes.length ||
      JSON.stringify(JSON.parse(current.connections)) !== JSON.stringify(desired.connections))
    throw new Error('Workflow topology differs from reviewed snapshot');
  const byName = new Map(nodes.map(node => [node.name, node]));
  for (const name of changed) {
    const old = byName.get(name), next = target.get(name);
    if (!old || old.type !== next?.type || old.id !== next.id) throw new Error(`Unexpected node identity: ${name}`);
    if (old.parameters.jsCode === next.parameters.jsCode) throw new Error(`${name} already published`);
  }
  const history = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?')
    .get(workflowId, current.activeVersionId);
  if (!history) throw new Error('Active workflow history missing');
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backup = path.join(backupDir, `database.sqlite.before-jev-capacity-${stamp}`);
  fs.copyFileSync(databasePath, backup, fs.constants.COPYFILE_EXCL);
  for (const name of changed) byName.get(name).parameters.jsCode = target.get(name).parameters.jsCode;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const nodesJson = JSON.stringify(nodes);
  db.exec('BEGIN IMMEDIATE');
  db.prepare(`INSERT INTO workflow_history
    (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, workflowId, 'Aterum Codex', now, now, nodesJson, current.connections,
      current.name, 0, history.description || null, history.nodeGroups || null);
  db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
    versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
    .run(nodesJson, versionId, versionId, now, workflowId);
  db.exec('COMMIT');
  console.log(`Published capacity rejection to active workflow ${workflowId}; backup=${backup}`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally { db.close(); }
