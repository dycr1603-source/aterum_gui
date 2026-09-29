'use strict';

// Run with n8n stopped. Changes the SL Monitor clock sync and Telegram destinations.
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const databasePath = process.env.N8N_SQLITE_DB || '/home/node/.n8n/database.sqlite';
const workflowId = process.env.N8N_SL_MONITOR_WORKFLOW_ID || 'ZYhtV8yWXjNukrW4';
const names = new Set(['Telegram: SL Updated', 'Telegram: Post-Trade Agent']);
const desired = '={{$env.TELEGRAM_CHAT_ID}}';
const payload = JSON.parse(fs.readFileSync('/repo-workflows/sl-monitor.workflow.json', 'utf8'));
const wanted = Array.isArray(payload) ? payload[0] : payload;
const desiredCode = wanted.nodes.find(node => node.name === 'SL Monitor Code')?.parameters?.jsCode;
if (!desiredCode?.includes('binanceTimeOffsetMs')) throw new Error('Clock sync missing from payload');
const db = new DatabaseSync(databasePath);

try {
  db.exec('BEGIN IMMEDIATE');
  const row = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get(workflowId);
  if (!row || !row.active || row.versionId !== row.activeVersionId) throw new Error('SL Monitor active version mismatch');
  const nodes = JSON.parse(row.nodes);
  const matches = nodes.filter(node => names.has(node.name));
  if (matches.length !== names.size || matches.some(node => node.type !== 'n8n-nodes-base.telegram')) throw new Error('Telegram nodes changed');
  const currentCode = nodes.find(node => node.name === 'SL Monitor Code')?.parameters?.jsCode;
  if (!currentCode?.includes('timestamp: Date.now(), recvWindow: 60000') && currentCode !== desiredCode) throw new Error('Unexpected SL Monitor code');
  if (matches.every(node => node.parameters.chatId === desired) && currentCode === desiredCode) {
    db.exec('ROLLBACK');
    console.log('SL Monitor Telegram destinations already current');
    process.exit(0);
  }
  if (matches.some(node => !node.parameters.chatId || (node.parameters.chatId.startsWith('=') && node.parameters.chatId !== desired))) throw new Error('Unexpected Telegram destination');
  const backup = `${databasePath}.before-sl-monitor-chat-${Date.now()}`;
  fs.copyFileSync(databasePath, backup, fs.constants.COPYFILE_EXCL);
  const updated = nodes.map(node => names.has(node.name) ? {
    ...node, parameters: { ...node.parameters, chatId: desired }
  } : node.name === 'SL Monitor Code' ? {
    ...node, parameters: { ...node.parameters, jsCode: desiredCode }
  } : node);
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const history = db.prepare('SELECT * FROM workflow_history WHERE workflowId=? AND versionId=?').get(workflowId, row.activeVersionId);
  if (!history) throw new Error('Active workflow history missing');
  const nodesJson = JSON.stringify(updated);
  db.prepare(`INSERT INTO workflow_history
    (versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description,nodeGroups)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(versionId, workflowId, 'Aterum Codex', now, now, nodesJson, row.connections,
      history.name, 0, history.description || null, history.nodeGroups ?? null);
  db.prepare(`UPDATE workflow_entity SET nodes=?,versionId=?,activeVersionId=?,
    versionCounter=versionCounter+1,updatedAt=? WHERE id=?`)
    .run(nodesJson, versionId, versionId, now, workflowId);
  db.exec('COMMIT');
  console.log(`Published SL Monitor clock sync and Telegram destination; backup=${backup}`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch (_) {}
  throw error;
} finally {
  db.close();
}
