'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const workflowId = process.env.N8N_TRADING_WORKFLOW_ID || 'Cz4TfvaVAygWGRJm';
const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const snapshotPath = process.argv[2] || 'bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json';
const desired = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))[0];
const changed = ['Position Sizer', 'Execute Trade', 'Build Trade Alert'];
const target = new Map(desired.nodes.map(node => [node.name, node]));
const sizer = target.get('Position Sizer')?.parameters?.jsCode || '';
const execute = target.get('Execute Trade')?.parameters?.jsCode || '';
const alert = target.get('Build Trade Alert')?.parameters?.jsCode || '';
if (!sizer.includes('BASE_RISK_PCT  = 0.02') || !sizer.includes('jevRecord') ||
    !execute.includes('maxAttempts:d.jev?.mode') || !execute.includes('leveragePolicy:d.jev.leveragePolicy') ||
    !alert.includes('TRADE_OPENED notification blocked') || !alert.includes('jevLeveragePolicy'))
  throw new Error('Unexpected leverage workflow snapshot');
for (const name of changed) new Function('return (async()=>{' + target.get(name).parameters.jsCode + '})');

const db = new DatabaseSync(databasePath);
try {
  db.exec('PRAGMA busy_timeout=5000');
  const current = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get(workflowId);
  if (!current || Number(current.active) !== 1) throw new Error('Active trading workflow not found');
  const nodes = JSON.parse(current.nodes);
  if (nodes.length !== desired.nodes.length ||
      JSON.stringify(JSON.parse(current.connections)) !== JSON.stringify(desired.connections))
    throw new Error('Active workflow topology differs from reviewed snapshot');
  const byName = new Map(nodes.map(node => [node.name, node]));
  for (const name of changed) {
    const old = byName.get(name), next = target.get(name);
    if (!old || old.type !== next.type || old.id !== next.id || !old.parameters?.jsCode)
      throw new Error(`Unexpected active node: ${name}`);
  }
  const history = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?')
    .get(workflowId, current.activeVersionId);
  if (!history) throw new Error('Active workflow history missing');
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backupPath = path.join(backupDir, `database.sqlite.before-jev-leverage-${stamp}`);
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const name of changed) byName.get(name).parameters.jsCode = target.get(name).parameters.jsCode;
    const versionId = crypto.randomUUID();
    const at = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const nodesJson = JSON.stringify(nodes);
    db.prepare(`INSERT INTO workflow_history
      (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(versionId, workflowId, 'Aterum Codex', at, at, nodesJson, current.connections,
        current.name, 0, history.description || null, history.nodeGroups || null);
    db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
      versionCounter=COALESCE(versionCounter,0)+1,updatedAt=? WHERE id=?`)
      .run(nodesJson, versionId, versionId, at, workflowId);
    db.exec('COMMIT');
    console.log(`Published leverage nodes to ${workflowId}; backup=${backupPath}`);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
} finally { db.close(); }
