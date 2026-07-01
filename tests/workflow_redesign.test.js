'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
const workflow = JSON.parse(fs.readFileSync(file, 'utf8'))[0];
const names = new Set(workflow.nodes.map(node => node.name));
const removed = [
  'Indicators and Scoring', 'Aggregate Best Setup', 'Need Visual Check',
  'AI Market Context', 'AI Market Context Image', 'Position Sizer1', 'Execute Trade1'
];

assert.strictEqual(workflow.active, false, 'repository workflow must remain safe to import');
assert.strictEqual(workflow.nodes.length, 30);
for (const name of removed) assert(!names.has(name), `${name} must not remain in V2`);
for (const name of ['Risk Guard', 'AGENTE DE MERCADO', 'Opportunity Discovery', 'Deterministic Entry Gate', 'Position Sizer', 'Execute Trade']) {
  assert(names.has(name), `${name} missing from V2`);
}

const executeCode = workflow.nodes.find(node => node.name === 'Execute Trade').parameters.jsCode;
assert(executeCode.includes("type:'OPEN_POSITION'"), 'entry must generate an execution request');
assert(executeCode.includes('EXECUTION_ENGINE_URL'), 'entry must use the centralized execution engine');
assert(executeCode.includes("execution.finalStatus!=='VERIFIED'"), 'entry must reject unverified Binance results');
assert(!executeCode.includes('/fapi/v1/order'), 'entry workflow must not mutate Binance directly');
assert(/slMonitorRequired:\s*true/.test(executeCode), 'SL Monitor handoff flag missing');
assert(!/const API_KEY\s*=\s*'[^']{20,}'/.test(executeCode), 'repository workflow contains a Binance API key');
assert(!/const API_SECRET\s*=\s*'[^']{20,}'/.test(executeCode), 'repository workflow contains a Binance API secret');

const riskTargets = workflow.connections['Risk Guard'].main[0].map(item => item.node);
const gateTargets = workflow.connections['If: AI Approves'].main.flat().map(item => item.node);
assert.deepStrictEqual(riskTargets, ['AGENTE DE MERCADO']);
assert(gateTargets.includes('Position Sizer'));
assert(gateTargets.includes('Build Entry Rejection'));
assert.deepStrictEqual(workflow.connections['Execute Trade'].main[0].map(item => item.node), ['If: Execution Verified']);
assert.deepStrictEqual(workflow.connections['If: Execution Verified'].main[0].map(item => item.node), ['Build Trade Alert']);
assert.deepStrictEqual(workflow.connections['If: Execution Verified'].main[1].map(item => item.node), ['Build Execution Failure']);
const alertCode = workflow.nodes.find(node => node.name === 'Build Trade Alert').parameters.jsCode;
assert(alertCode.includes("persistenceStatus !== 'VERIFIED'"), 'open notification lacks persistence gate');
assert(!alertCode.includes('/db/trade/open'), 'notification node still owns optimistic persistence');

const engineCode = fs.readFileSync(path.resolve(__dirname, '../position-guard/execution-engine.js'), 'utf8');
for (const type of ['OPEN_POSITION', 'MOVE_STOP_LOSS', 'MOVE_TAKE_PROFIT', 'PARTIAL_TAKE_PROFIT', 'TRAILING_STOP', 'CLOSE_POSITION']) {
  assert(engineCode.includes(`'${type}'`), `${type} execution contract missing`);
}
assert(engineCode.includes("type: trailingNative ? 'TRAILING_STOP_MARKET'"), 'native trailing order support missing');
assert(engineCode.includes("isTp ? 'TAKE_PROFIT_MARKET' : 'STOP_MARKET'"), 'native SL/TP order contract missing');
assert(engineCode.includes('await this.readUntil'), 'exchange read-back verification missing');
assert(engineCode.includes('persistVerifiedState'), 'verified local persistence boundary missing');

for (const filename of ['trailing-manager.workflow.json', 'sl-monitor.workflow.json']) {
  const managed = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../bot-control/workflows/current/${filename}`), 'utf8'));
  const combined = managed.nodes.map(node => node.parameters?.jsCode || '').join('\n');
  assert(combined.includes('executeVerified'), `${filename} does not use verified executions`);
  assert(!/method:\s*['"](?:POST|DELETE)['"][\s\S]{0,180}\/fapi\/v1\/(?:order|algoOrder|allOpenOrders)/.test(combined),
    `${filename} still mutates Binance directly`);
}

console.log('workflow redesign tests: ok');
