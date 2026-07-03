'use strict';

const assert = require('assert');
const fs = require('fs');
const { failureNotificationPolicy } = require('../position-guard/execution-engine');

const transient = Object.assign(new Error('Request failed with status code 429'), { code: 429 });
assert.equal(
  failureNotificationPolicy({ type: 'MOVE_STOP_LOSS' }, transient, false, 'EXECUTION_FAILURE').notify,
  false,
  'rate-limit diagnostics must remain internal'
);

const engineSource = fs.readFileSync(require.resolve('../position-guard/execution-engine'), 'utf8');
const healthSource = fs.readFileSync(require.resolve('../position-guard/index'), 'utf8');
assert(!engineSource.includes('`Stack Trace: ${'), 'Telegram messages must not contain stack traces');
assert(!engineSource.includes('`HTTP Method: ${'), 'Telegram messages must not contain raw HTTP diagnostics');
assert(!healthSource.includes('🚨 ATERUM HEALTH'), 'health probes must not emit Telegram log messages');

for (const filename of [
  'advanced-ai-trading-bot-v2-clean.workflow.json',
  'trailing-manager.workflow.json',
  'sl-monitor.workflow.json'
]) {
  const parsed = require(`../bot-control/workflows/current/${filename}`);
  const workflow = Array.isArray(parsed) ? parsed[0] : parsed;
  assert(
    workflow.nodes.some(node => node.parameters?.jsCode?.includes('failureNotificationSuppressed')),
    `${filename} must honor internal-only failures`
  );
}

console.log('telegram noise policy tests: ok');
