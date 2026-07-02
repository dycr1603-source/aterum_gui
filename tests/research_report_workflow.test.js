const assert = require('assert');
const workflowFile = require('../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');

const workflow = Array.isArray(workflowFile) ? workflowFile[0] : workflowFile;

for (const name of ['Daily Analysis Report', 'Weekly Deep Analysis']) {
  const node = workflow.nodes.find(candidate => candidate.name === name);
  assert(node, `${name} must exist`);

  const code = node.parameters.jsCode;
  assert(
    code.includes('process.env.RESEARCH_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY'),
    `${name} must prefer the dedicated research credential`
  );
  assert(
    code.includes('throw new Error') && code.includes('Anthropic request failed'),
    `${name} must stop before persistence when generation fails`
  );
  assert(!code.includes("analysis = 'Error: '+e.message"), `${name} must not persist API errors as reports`);
  assert(!code.includes("analysis='Error: '+e.message"), `${name} must not persist API errors as reports`);

  new Function(`return async function () { ${code} }`);
}

console.log('research report workflow tests: ok');
