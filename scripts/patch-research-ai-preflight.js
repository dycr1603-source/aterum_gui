'use strict';

const fs = require('fs');
const path = require('path');

const workflowPath = path.resolve(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
const snippetPath = path.resolve(__dirname, '../bot-control/workflows/code/research-ai-capacity-preflight.js');
const workflowExport = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const workflow = Array.isArray(workflowExport) ? workflowExport[0] : workflowExport;
const snippet = fs.readFileSync(snippetPath, 'utf8');

function patchNode(node, { type, model, maxOutputTokens }) {
  let code = node.parameters?.jsCode;
  if (typeof code !== 'string') throw new Error(`${node.name}: jsCode missing`);
  if (code.includes('_researchPreflight = await researchCapacityPreflight')) return false;
  const prefix = snippet
    .replaceAll('__ANALYSIS_TYPE__', JSON.stringify(type))
    .replaceAll('__MODEL__', JSON.stringify(model))
    .replaceAll('__MAX_OUTPUT_TOKENS__', String(maxOutputTokens));
  if (/process\.env\.RESEARCH_ANTHROPIC_API_KEY/.test(code) === false) throw new Error(`${node.name}: unexpected Claude key contract`);
  code = prefix + '\n' + code;
  code = code.replace(/(let analysis\s*=\s*'Error generando análisis';)/, "$1\nlet tokenUsage = null;");
  if (!code.includes('let tokenUsage = null;')) throw new Error(`${node.name}: analysis state contract missing`);
  const responseMarker = 'analysis = body?.content?.[0]?.text;';
  if (!code.includes(responseMarker)) throw new Error(`${node.name}: Anthropic response contract missing`);
  code = code.replace(responseMarker, `${responseMarker}\n  tokenUsage = body?.usage || null;`);
  const errorMarker = `} catch(e) { throw new Error('[${type === 'daily' ? 'DailyResearch' : 'WeeklyResearch'}] Anthropic request failed: '+e.message); }`;
  if (!code.includes(errorMarker)) throw new Error(`${node.name}: Anthropic error contract missing`);
  const errorAudit = `} catch(e) {
  await persistResearchAudit.call(this, { status:'FAILED', reasonCode:'ANTHROPIC_REQUEST_FAILED',
    inputTokens:tokenUsage?.input_tokens ?? null, outputTokens:tokenUsage?.output_tokens ?? null,
    ...(_researchPreflight.metrics || {}) });
  throw new Error('[${type === 'daily' ? 'DailyResearch' : 'WeeklyResearch'}] Anthropic request failed');
}`;
  code = code.replace(errorMarker, errorAudit);
  const analysisReady = type === 'daily' ? 'let cleanAnalysis = analysis.replace' : 'const cleanAnalysis = analysis.replace';
  if (!code.includes(analysisReady)) throw new Error(`${node.name}: post-analysis insertion point missing`);
  const audit = `await persistResearchAudit.call(this, { status:'COMPLETED', reasonCode:null,
  inputTokens:tokenUsage?.input_tokens ?? null, outputTokens:tokenUsage?.output_tokens ?? null,
  ...(_researchPreflight.metrics || {}) });
`;
  code = code.replace(analysisReady, audit + analysisReady);
  node.parameters.jsCode = code;
  return true;
}

const byName = new Map(workflow.nodes.map(node => [node.name, node]));
const changed = [];
if (patchNode(byName.get('Daily Analysis Report'), { type: 'daily', model: 'claude-haiku-4-5-20251001', maxOutputTokens: 1400 })) changed.push('Daily Analysis Report');
if (patchNode(byName.get('Weekly Deep Analysis'), { type: 'weekly', model: 'claude-opus-4-6', maxOutputTokens: 2400 })) changed.push('Weekly Deep Analysis');
if (changed.length) fs.writeFileSync(workflowPath, JSON.stringify(workflowExport, null, 2) + '\n');
console.log(changed.length ? `Patched ${changed.join(', ')}` : 'Research AI preflight already present');
