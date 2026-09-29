'use strict';
const fs = require('fs');
const path = require('path');
const source = path.resolve(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
const workflow = JSON.parse(fs.readFileSync(source, 'utf8'));
const nodes = workflow[0].nodes;
const execute = nodes.find(node => node.name === 'Execute Trade');
const failure = nodes.find(node => node.name === 'Build Execution Failure');
if (!execute?.parameters?.jsCode || !failure?.parameters?.jsCode) throw new Error('Trading workflow nodes missing');

function replaceOnce(input, before, after) {
  if (!input.includes(before) || input.indexOf(before) !== input.lastIndexOf(before)) throw new Error('Workflow source changed');
  return input.replace(before, after);
}
execute.parameters.jsCode = replaceOnce(execute.parameters.jsCode,
  "return [{json:{...d,success:false,executionId,finalStatus:'FAILED',failureNotificationSent:false,\n    error:'PORTFOLIO_CAPACITY_REJECTED: no candidate allocation remains',verificationResult:{verified:false}}}];",
  "return [{json:{...d,success:false,executionId,finalStatus:'REJECTED',failureCategory:'PRE_EXECUTION_CAPACITY',failureNotificationSent:false,\n    error:d.skipReason||'PORTFOLIO_CAPACITY_REJECTED: no candidate allocation remains',verificationResult:{verified:false}}}];");
failure.parameters.jsCode = replaceOnce(failure.parameters.jsCode,
  "const engineAlreadyNotified = d.failureNotificationSent === true;",
  ["const engineAlreadyNotified = d.failureNotificationSent === true;",
   "if (d.failureCategory === 'PRE_EXECUTION_CAPACITY') {",
   "  const side = d.direction || (d.side === 'BUY' ? 'LONG' : d.side === 'SELL' ? 'SHORT' : 'N/A');",
   "  const reason = d.rejectionReason?.code || 'PORTFOLIO_CAPACITY_REJECTED';",
   "  const telegramText = ['⏸ OPERACIÓN OMITIDA POR CAPACIDAD',",
   "    `${d.symbol || 'UNKNOWN'} · ${side}`,",
   "    `Motivo: ${reason}`,",
   "    'El tamaño no supera el mínimo de viabilidad o los límites de exposición.',",
   "    'No se envió ninguna orden a Binance.'].join('\\n');",
   "  return [{json:{...d,notificationEventKey:`pre-execution-capacity:${d.symbol}:${Math.floor(Date.now()/3600000)}` ,",
   "    telegramText,notificationStatus:'PENDING_SEND'}}];",
   "}"].join('\n'));
fs.writeFileSync(source, JSON.stringify(workflow, null, 2) + '\n');
console.log('Patched reviewed workflow snapshot for pre-execution capacity rejection');
