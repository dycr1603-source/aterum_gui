'use strict';
// Offline snapshot update only. Does not activate or import workflows.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../bot-control/workflows');
const read = file => fs.readFileSync(path.join(root, 'code', file), 'utf8');
const file = path.join(root, 'current/advanced-ai-trading-bot-v2-clean.workflow.json');
const raw = JSON.parse(fs.readFileSync(file));
const w = Array.isArray(raw) ? raw[0] : raw;
const node = name => w.nodes.find(n => n.name === name);
if (!node('Jev Entry Gate')) w.nodes.push({ id: 'jev-entry-gate', name: 'Jev Entry Gate', type: 'n8n-nodes-base.code',
  typeVersion: 2, position: [1240, 0], parameters: {} });
node('Jev Entry Gate').parameters.jsCode = read('jev-entry-gate.js');
w.connections['If: Setup Found'].main[0][0].node = 'Jev Entry Gate';
w.connections['Jev Entry Gate'] = { main: [[{ node: 'Deterministic Entry Gate', type: 'main', index: 0 }]] };
const gate = node('Deterministic Entry Gate');
if (!gate.parameters.jsCode.includes('if (d.jevBlocked)')) gate.parameters.jsCode = gate.parameters.jsCode.replace(
  'const d = $input.first().json;', 'const d = $input.first().json;\nif (d.jevBlocked) return [{ json: d }];');
// Model owns strategy; capital/service failures retain their veto.
gate.parameters.jsCode = gate.parameters.jsCode.replace('const passAI = decision.allowed === true;', `const jevOwnsStrategy = d.jev?.mode === 'enforce' && ['LONG', 'SHORT'].includes(d.jev.decision);
const strategyOnlyRejection = ['SCORE_BELOW_THRESHOLD', 'LEARNING_HARD_BLOCK'].includes(decision.primaryReason)
  && decision.capital?.halted === false;
const passAI = decision.allowed === true || (jevOwnsStrategy && strategyOnlyRejection);`);
if (!gate.parameters.jsCode.includes("decisionAuthority: jevOwnsStrategy")) gate.parameters.jsCode = gate.parameters.jsCode.replace('learningDecision: decision,',
  "learningDecision: decision,\n  decisionAuthority: jevOwnsStrategy ? 'JEV' : 'BASELINE',");
gate.parameters.jsCode = gate.parameters.jsCode.replace('primaryReason: decision.primaryReason,',
  "primaryReason: jevOwnsStrategy && passAI ? 'JEV_APPROVED' : decision.primaryReason,");
node('Position Sizer').parameters.jsCode = read('position-sizer-v1-efficiency-gate.js');
node('Build Trade Alert').parameters.jsCode = read('build-verified-open-notification-v1.js');
node('Build Entry Rejection').parameters.jsCode = read('build-entry-rejection-v2.js');
node('Build Execution Failure').parameters.jsCode = read('build-execution-failure-notification-v2.js');
let execute = node('Execute Trade').parameters.jsCode;
if (!execute.includes('const decisionHex')) {
  execute = execute.replace('const executionId=crypto.randomUUID();', `const decisionHex=d.jev?.mode==='enforce'?d.jev.id?.slice(0,32):null;
const executionId=decisionHex ? [decisionHex.slice(0,8),decisionHex.slice(8,12),decisionHex.slice(12,16),decisionHex.slice(16,20),decisionHex.slice(20)].join('-') : crypto.randomUUID();
if(d.jev?.mode==='enforce' && (!['LONG','SHORT'].includes(d.jev.decision) || Date.now()>d.jev.expiresAt || d.symbol!==d.jev.symbol)){
  return [{json:{...d,success:false,executionId,finalStatus:'FAILED',error:'JEV_INVALID_OR_EXPIRED',verificationResult:{verified:false}}}];
}`);
  execute = execute.replace('maxAttempts:3,tradeContext:{', "maxAttempts:d.jev?.mode==='enforce'?1:3,tradeContext:{\n        jev:d.jev?{id:d.jev.id,mode:d.jev.mode}:null,");
}
if (!execute.includes('TRADING_DISABLED_BY_CONFIGURATION')) execute = execute.replace(
  "const positionSide=d.side==='BUY'?'LONG':'SHORT';",
  "if(process.env.N8N_TRADING_DISABLED==='1') return [{json:{...d,success:false,executionId,finalStatus:'REJECTED',error:'TRADING_DISABLED_BY_CONFIGURATION',verificationResult:{verified:false}}}];\nconst positionSide=d.side==='BUY'?'LONG':'SHORT';");
node('Execute Trade').parameters.jsCode = execute;
fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
// Only replace shared notification nodes, not order/close logic.
for (const filename of fs.readdirSync(path.join(root, 'current')).filter(f => f.endsWith('.workflow.json'))) {
  const target = path.join(root, 'current', filename);
  const data = JSON.parse(fs.readFileSync(target));
  for (const workflow of Array.isArray(data) ? data : [data]) {
    for (const n of workflow.nodes || []) {
      if (n.name.startsWith('Telegram:') && n.type === 'n8n-nodes-base.code' &&
          (n.parameters.jsCode.includes('api.telegram.org') || n.parameters.jsCode.includes('/internal/notifications/telegram'))) {
        n.parameters.jsCode = read('send-telegram-notification-v1.js');
      }
    }
  }
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
}
const manifestFile = path.join(root, 'current/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile));
manifest.generatedAt = new Date().toISOString();
manifest.source = 'Jev integration, offline snapshots (activation unchanged)';
for (const item of manifest.workflows) {
  const data = fs.readFileSync(path.join(root, 'current', item.filename));
  item.sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const workflow = JSON.parse(data);
  item.nodeCount = (Array.isArray(workflow) ? workflow[0] : workflow).nodes.length;
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
