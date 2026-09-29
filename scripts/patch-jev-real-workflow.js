'use strict';
const fs = require('fs');
const path = require('path');
const workflowPath = path.join(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
function replaceOnce(code, before, after) {
  if (!code.includes(before)) throw new Error(`Workflow source changed: ${before.slice(0, 80)}`);
  return code.replace(before, after);
}
function patch(workflow) {
  const node = name => {
    const found = workflow.nodes.find(item => item.name === name);
    if (!found?.parameters?.jsCode) throw new Error(`Missing ${name}`);
    return found;
  };
  node('Jev Entry Gate').parameters.jsCode = fs.readFileSync(path.join(__dirname, '../bot-control/workflows/code/jev-entry-gate.js'), 'utf8');
  let sizer = node('Position Sizer').parameters.jsCode;
  if (!sizer.includes('JEV_INVALID_LEVERAGE')) {
  sizer = replaceOnce(sizer,
    "  const leverage = Math.min(Math.max(d.leverageOverride || aiResult?.recommended_leverage || 5, 2), maxLeverage);",
    "  const jevProposal = d.jev?.mode === 'enforce' ? d.jev.proposal : null;\n  const leverage = jevProposal ? Number(jevProposal.leverage) : Math.min(Math.max(d.leverageOverride || aiResult?.recommended_leverage || 5, 2), maxLeverage);\n  if (jevProposal && (!Number.isInteger(leverage) || leverage < 1 || leverage > 10)) throw new Error('JEV_INVALID_LEVERAGE');");
  sizer = replaceOnce(sizer, "  const jevProposal = d.jev?.mode === 'enforce' ? d.jev.proposal : null;\n  const slDistance",
    '  const slDistance');
  sizer = replaceOnce(sizer, '  const requestedRiskAmount = balance * effectiveRisk;\n  let   qty        = requestedRiskAmount / slDistance;',
    '  const riskPerUnit = jevProposal ? slDistance + (currentPrice + jevProposal.sl) * 0.001 : slDistance;\n  const requestedRiskAmount = balance * effectiveRisk;\n  let   qty        = requestedRiskAmount / riskPerUnit;');
  sizer = replaceOnce(sizer, 'qtyCaps.push(remainingRiskAmount / slDistance)', 'qtyCaps.push(remainingRiskAmount / riskPerUnit)');
  sizer = replaceOnce(sizer, '  const maxLoss        = +(Math.abs(currentPrice - sl) * qty).toFixed(2);',
    '  const feeReserve = jevProposal ? qty * (currentPrice + sl) * 0.001 : 0;\n  const maxLoss        = +(Math.abs(currentPrice - sl) * qty + feeReserve).toFixed(2);');
  }
  node('Position Sizer').parameters.jsCode = sizer;
  let alert = node('Build Trade Alert').parameters.jsCode;
  if (!alert.includes('✅ ORDEN CONFIRMADA POR BINANCE'))
    alert = replaceOnce(alert, "  '✅ TRADE ABIERTO',", "  '✅ ORDEN CONFIRMADA POR BINANCE',\n  d.jev?.provider === 'typesafe-jev' ? `Jev real · ${d.jev.model || 'jev-latest'}` : d.jev?.provider === 'typesafe-adapter' ? `Haiku adapter · ${d.jev.model || 'Claude Haiku'}` : 'Proveedor: flujo original',");
  node('Build Trade Alert').parameters.jsCode = alert;
  let rejected = node('Build Entry Rejection').parameters.jsCode;
  if (!rejected.includes('⛔ OPERACIÓN RECHAZADA'))
    rejected = replaceOnce(rejected, "  'ENTRY REJECTED',", "  '⛔ OPERACIÓN RECHAZADA',\n  d.jev?.provider === 'typesafe-jev' ? 'Jev real' : d.jev?.provider === 'typesafe-adapter' ? 'Haiku adapter' : 'Flujo original',");
  if (!rejected.includes("const text = d.jevBlocked ? '' : ["))
    rejected = replaceOnce(rejected, 'const text = [', "const text = d.jevBlocked ? '' : [");
  node('Build Entry Rejection').parameters.jsCode = rejected;
  return workflow;
}
if (require.main === module) {
  const root = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  if (!Array.isArray(root) || root.length !== 1) throw new Error('Unexpected workflow snapshot');
  patch(root[0]);
  fs.writeFileSync(workflowPath, JSON.stringify(root, null, 2) + '\n');
}
module.exports = { patch };
