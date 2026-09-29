'use strict';

const fs = require('fs');
const path = require('path');

const workflowPath = path.resolve(__dirname, '../bot-control/workflows/current/trailing-manager.workflow.json');
const codePath = path.resolve(__dirname, '../bot-control/workflows/code/trailing-manager-profit.js');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const code = fs.readFileSync(codePath, 'utf8').replace(/\n$/, '');
const senderCode = fs.readFileSync(path.resolve(__dirname, '../bot-control/workflows/code/send-trailing-notification.js'), 'utf8').trimEnd();

const node = workflow.nodes.find(item => item.name === 'Trailing Manager Code');
if (!node || typeof node.parameters?.jsCode !== 'string') throw new Error('Trailing Manager Code node missing');
for (const contract of ['executeVerified(this.helpers', 'webhook/sl-monitor-set', 'planProtection(']) {
  if (!code.includes(contract)) throw new Error(`trailing-manager-profit.js: contract missing: ${contract}`);
}
node.parameters.jsCode = code;
const sender = workflow.nodes.find(item => item.name === 'Telegram: SL Updated');
if (!sender) throw new Error('Trailing Telegram sender missing');
sender.type = 'n8n-nodes-base.code';
sender.typeVersion = 2;
sender.parameters = { jsCode: senderCode };
delete sender.credentials;
delete sender.webhookId;
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n');
console.log('Patched trailing details and persisted Telegram sender');
