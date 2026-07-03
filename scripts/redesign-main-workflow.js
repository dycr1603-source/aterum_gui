'use strict';

const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3];
const sanitize = process.argv.includes('--sanitize');
if (!input || !output) throw new Error('Usage: node scripts/redesign-main-workflow.js input.json output.json');

const exported = JSON.parse(fs.readFileSync(input, 'utf8'));
const workflow = Array.isArray(exported) ? exported[0] : exported;
const codeDir = path.resolve(__dirname, '../bot-control/workflows/code');
const code = name => fs.readFileSync(path.join(codeDir, name), 'utf8').trim();
function patchExecuteTradeProtection(source) {
  const oldError = "    const err = e.response?.data || e.message;\n    throw new Error(JSON.stringify(err));";
  const newError = `    const err = e.response?.body
      ?? e.response?.data
      ?? e.cause?.response?.body
      ?? e.cause?.response?.data
      ?? e.context?.data
      ?? e.error
      ?? e.message;
    const status = e.response?.statusCode ?? e.statusCode ?? e.cause?.response?.statusCode ?? null;
    throw new Error(JSON.stringify({ status, error: err, message: e.message }));`;
  const oldVerification = `  const verified = await req.call(this, 'GET', '/fapi/v1/algoOrder', { algoId: slOrder.algoId });
  if(String(verified.algoStatus || '').toUpperCase() !== 'NEW'){
    throw new Error(\`Native stop not active after creation: \${verified.algoStatus || 'UNKNOWN'}\`);
  }`;
  const newVerification = `  let verified = null;
  let verificationError = null;
  for(let attempt = 1; attempt <= 5; attempt++){
    await new Promise(r => setTimeout(r, attempt * 250));
    try{
      verified = await req.call(this, 'GET', '/fapi/v1/algoOrder', { algoId: slOrder.algoId });
      break;
    }catch(e){
      verificationError = e;
      log(\`[SL] Verification pending attempt \${attempt}/5: \${e.message}\`);
    }
  }
  if(!verified) throw verificationError || new Error('Native stop verification timed out');
  if(String(verified.algoStatus || '').toUpperCase() !== 'NEW'){
    throw new Error(\`Native stop not active after creation: \${verified.algoStatus || 'UNKNOWN'}\`);
  }`;
  const oldStopCatch = `}catch(stopError){
  log(\`[SL] CRITICAL native stop failed: \${stopError.message}\`);
  try{`;
  const newStopCatch = `}catch(stopError){
  log(\`[SL] CRITICAL native stop failed: \${stopError.message}\`);
  if(slOrder?.algoId){
    try{
      await req.call(this, 'DELETE', '/fapi/v1/algoOrder', { algoId: slOrder.algoId });
      log(\`[SL] Unverified algo cancelled algoId=\${slOrder.algoId}\`);
    }catch(cancelError){
      log(\`[SL] Could not cancel unverified algo: \${cancelError.message}\`);
    }
  }
  try{`;
  const oldStopCreate = "  slOrder = await req.call(this, 'POST', '/fapi/v1/algoOrder', stopParams);";
  const newStopCreate = `  try{
    slOrder = await req.call(this, 'POST', '/fapi/v1/algoOrder', stopParams);
  }catch(closePositionError){
    log(\`[SL] closePosition contract rejected, retrying confirmed quantity: \${closePositionError.message}\`);
    const quantityParams = {
      ...stopParams,
      quantity: positionSize,
      clientAlgoId: \`aterum_sl_qty_\${symbol}_\${Date.now()}\`.slice(0, 36)
    };
    delete quantityParams.closePosition;
    slOrder = await req.call(this, 'POST', '/fapi/v1/algoOrder', quantityParams);
  }`;
  const nativeTp = `// ── TAKE PROFIT — EXCHANGE-SIDE ──────────────────────────────────────────────
// TP y SL usan closePosition para no competir por la cantidad reducible.
let tpOrder = null;
try{
  const tpParams = {
    algoType: 'CONDITIONAL', symbol, side: closeSide, positionSide,
    type: 'TAKE_PROFIT_MARKET', triggerPrice: adjTP, closePosition: 'true',
    workingType: 'MARK_PRICE', priceProtect: 'false',
    clientAlgoId: \`aterum_tp_entry_\${symbol}_\${Date.now()}\`.slice(0, 36)
  };
  log(\`[TP] Native TAKE_PROFIT_MARKET: \${JSON.stringify(tpParams)}\`);
  try{
    tpOrder = await req.call(this, 'POST', '/fapi/v1/algoOrder', tpParams);
  }catch(closePositionError){
    log(\`[TP] closePosition contract rejected, retrying confirmed quantity: \${closePositionError.message}\`);
    const quantityParams = {
      ...tpParams,
      quantity: positionSize,
      clientAlgoId: \`aterum_tp_qty_\${symbol}_\${Date.now()}\`.slice(0, 36)
    };
    delete quantityParams.closePosition;
    tpOrder = await req.call(this, 'POST', '/fapi/v1/algoOrder', quantityParams);
  }
  let tpVerified = null;
  let tpVerificationError = null;
  for(let attempt = 1; attempt <= 5; attempt++){
    await new Promise(r => setTimeout(r, attempt * 250));
    try{
      tpVerified = await req.call(this, 'GET', '/fapi/v1/algoOrder', { algoId: tpOrder.algoId });
      break;
    }catch(e){
      tpVerificationError = e;
      log(\`[TP] Verification pending attempt \${attempt}/5: \${e.message}\`);
    }
  }
  if(!tpVerified) throw tpVerificationError || new Error('Native take profit verification timed out');
  if(String(tpVerified.algoStatus || '').toUpperCase() !== 'NEW'){
    throw new Error(\`Native take profit not active after creation: \${tpVerified.algoStatus || 'UNKNOWN'}\`);
  }
  log(\`[TP] Native TAKE_PROFIT_MARKET verified algoId=\${tpOrder.algoId} trigger=\${adjTP}\`);
}catch(tpError){
  log(\`[TP] FINAL ERROR: \${tpError.message}\`);
}`;

  if (!source.includes(oldError)) throw new Error('Execute Trade error wrapper contract not found');
  if (!source.includes(oldVerification)) throw new Error('Execute Trade native stop verification contract not found');
  if (!source.includes(oldStopCatch)) throw new Error('Execute Trade native stop catch contract not found');
  if (!source.includes(oldStopCreate)) throw new Error('Execute Trade native stop creation contract not found');
  let patched = source
    .replace(oldError, newError)
    .replace(oldVerification, newVerification)
    .replace(oldStopCatch, newStopCatch)
    .replace(oldStopCreate, newStopCreate);
  const tpStart = patched.indexOf('// ── TAKE PROFIT');
  const tpEnd = patched.indexOf('log(`[SL] Protección nativa activa', tpStart);
  if (tpStart === -1 || tpEnd === -1) throw new Error('Execute Trade take-profit contract not found');
  patched = patched.slice(0, tpStart) + nativeTp + '\n\n' + patched.slice(tpEnd);
  return patched.replace('tpOrderId:     tpOrder?.orderId || null,', 'tpOrderId:     tpOrder?.algoId || null,');
}
const remove = new Set([
  'Indicators and Scoring', 'Aggregate Best Setup', 'DETECTOR DE RSI EXTREMO', 'Need Visual Check',
  'Execute Command', 'Claude Code Command', 'Parse Output Of Claude', 'AI Market Context',
  'AI Market Context Image', 'Research Learning Gate Image', 'If: AI Approves1', 'Position Sizer1',
  'Execute Trade1', 'Monitor SL Global of Image', 'Build Trade Alert of Image',
  'Telegram: Trade Opened of Image', 'Delete Image1', 'Build AI Skip Message Image',
  'Telegram: AI Skip Image', 'Delete Image'
]);

workflow.nodes = workflow.nodes.filter(node => !remove.has(node.name));
const byName = new Map(workflow.nodes.map(node => [node.name, node]));
const legacyDailyCode = byName.get('Daily PnL Report')?.parameters?.jsCode || '';
const runtimeKey = legacyDailyCode.match(/const API_KEY\s*=\s*'([^']+)'/)?.[1];
const runtimeSecret = legacyDailyCode.match(/const API_SECRET\s*=\s*'([^']+)'/)?.[1];
let riskGuardCode = code('risk-guard-v2.js');
if (!sanitize && runtimeKey && runtimeSecret) {
  riskGuardCode = riskGuardCode
    .replace('process.env.BINANCE_API_KEY', JSON.stringify(runtimeKey))
    .replace('process.env.BINANCE_API_SECRET', JSON.stringify(runtimeSecret));
}
byName.get('Risk Guard').parameters.jsCode = riskGuardCode;
byName.get('AGENTE DE MERCADO').parameters.jsCode = code('market-context-v2.js');
byName.get('Market Scanner').parameters.jsCode = code('opportunity-discovery-v2.js');
byName.get('Research Learning Gate').parameters.jsCode = code('research-learning-gate-v2.js');
byName.get('Build AI Skip Message').parameters.jsCode = code('build-entry-rejection-v2.js');
byName.get('Execute Trade').parameters.jsCode = patchExecuteTradeProtection(byName.get('Execute Trade').parameters.jsCode);

byName.get('Market Scanner').name = 'Opportunity Discovery';
byName.get('Research Learning Gate').name = 'Deterministic Entry Gate';
byName.get('Build AI Skip Message').name = 'Build Entry Rejection';
byName.get('Telegram: AI Skip Image1').name = 'Telegram: Entry Rejected';
byName.get('Setup Instructions').parameters.content = `## Aterum Decision Pipeline V2

Risk Guard (hard blockers only) -> deterministic market context -> complete universe discovery -> freshness scheduler -> additive score -> portfolio ranking -> bounded Learning bias -> Position Sizer -> Execute Trade.

Research, Review and historical Learning contribute through explicit additive values. Entry no longer calls a generative model or visual veto.`;

workflow.connections = {
  ...workflow.connections,
  'Main Schedule': { main: [[{ node: 'Risk Guard', type: 'main', index: 0 }]] },
  'Risk Guard': { main: [[{ node: 'AGENTE DE MERCADO', type: 'main', index: 0 }]] },
  'AGENTE DE MERCADO': { main: [[{ node: 'If: Risk OK', type: 'main', index: 0 }]] },
  'If: Risk OK': { main: [
    [{ node: 'Opportunity Discovery', type: 'main', index: 0 }],
    [{ node: 'Telegram: Risk Halt', type: 'main', index: 0 }]
  ] },
  'Opportunity Discovery': { main: [[{ node: 'If: Setup Found', type: 'main', index: 0 }]] },
  'If: Setup Found': { main: [
    [{ node: 'Deterministic Entry Gate', type: 'main', index: 0 }],
    [{ node: 'Telegram: No Setup', type: 'main', index: 0 }]
  ] },
  'Deterministic Entry Gate': { main: [[{ node: 'If: AI Approves', type: 'main', index: 0 }]] },
  'If: AI Approves': { main: [
    [{ node: 'Position Sizer', type: 'main', index: 0 }],
    [{ node: 'Build Entry Rejection', type: 'main', index: 0 }]
  ] },
  'Build Entry Rejection': { main: [[{ node: 'Telegram: Entry Rejected', type: 'main', index: 0 }]] }
};
for (const name of remove) delete workflow.connections[name];
delete workflow.connections['Market Scanner'];
delete workflow.connections['Research Learning Gate'];
delete workflow.connections['Build AI Skip Message'];
delete workflow.connections['Telegram: AI Skip Image1'];
for (const [source, groups] of Object.entries(workflow.connections)) {
  for (const outputs of groups.main || []) {
    for (const target of outputs || []) {
      if (remove.has(target.node)) throw new Error(`Connection ${source} still references removed node ${target.node}`);
    }
  }
}

workflow.name = 'Advanced AI Trading Bot v2 - Clean';
workflow.active = false;
workflow.versionId = undefined;
workflow.activeVersionId = null;
workflow.updatedAt = undefined;
workflow.createdAt = undefined;

if (sanitize) {
  for (const node of workflow.nodes) {
    if (!node.parameters?.jsCode) continue;
    node.parameters.jsCode = node.parameters.jsCode
      .replace(/const API_KEY\s*=\s*'[^']{20,}';/g, 'const API_KEY = process.env.BINANCE_API_KEY;')
      .replace(/const API_SECRET\s*=\s*'[^']{20,}';/g, 'const API_SECRET = process.env.BINANCE_API_SECRET;')
      .replace(/const ANTHROPIC_KEY\s*=\s*'[^']{20,}';/g, 'const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;');
  }
}

fs.writeFileSync(output, JSON.stringify([workflow], null, 2) + '\n');
console.log(JSON.stringify({ nodes: workflow.nodes.length, removed: [...remove], output }, null, 2));
