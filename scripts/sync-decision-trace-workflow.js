'use strict';

const fs = require('fs');
const path = require('path');

const workflowPath = process.argv[2] || path.resolve(__dirname,
  '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
const codeDir = path.resolve(__dirname, '../bot-control/workflows/code');
const exported = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const workflow = Array.isArray(exported) ? exported[0] : exported;
const node = name => {
  const current = workflow.nodes.find(item => item.name === name);
  if (!current) throw new Error(`Workflow node not found: ${name}`);
  return current;
};
const code = name => fs.readFileSync(path.join(codeDir, name), 'utf8').trim();

node('Opportunity Discovery').parameters.jsCode = code('opportunity-discovery-v2.js');
node('Deterministic Entry Gate').parameters.jsCode = code('research-learning-gate-v2.js');

const positionSizer = node('Position Sizer');
const sizingAnchor = `    learningDecision:  d.learningDecision || null,
    decisionExplanation: d.decisionExplanation || null,`;
const sizingReplacement = `    learningDecision:  d.learningDecision || null,
    policyVersion: d.policyVersion || d.scoreTrace?.policyVersion || null,
    scoreTrace: d.scoreTrace || d.learningDecision?.scoreTrace || null,
    decisionExplanation: d.decisionExplanation || null,`;
if (!positionSizer.parameters.jsCode.includes(sizingAnchor)
  && !positionSizer.parameters.jsCode.includes('scoreTrace: d.scoreTrace')) {
  throw new Error('Position Sizer trace anchor not found');
}
positionSizer.parameters.jsCode = positionSizer.parameters.jsCode.replace(sizingAnchor, sizingReplacement);

const executeTrade = node('Execute Trade');
const contextAnchor = `        sizingInfo:d.sizingInfo,indicators:d.indicators,dynamicThreshold:d.dynamicThreshold,
        entryReason:d.aiResult?.reasoning,setupLabel:d.setupLabel`;
const contextReplacement = `        sizingInfo:d.sizingInfo,indicators:d.indicators,dynamicThreshold:d.dynamicThreshold,
        policyVersion:d.policyVersion,scoreTrace:d.scoreTrace,technicalScore:d.technicalScore,
        contributionTable:d.contributionTable,learningDecision:d.learningDecision,
        decisionExplanation:d.decisionExplanation,riskDecision:d.riskDecision,
        portfolioCapacity:d.portfolioCapacity,opportunityCycleId:d.opportunityCycleId,
        opportunityDecision:d.opportunityDecision,
        entryReason:d.aiResult?.reasoning,setupLabel:d.setupLabel`;
if (!executeTrade.parameters.jsCode.includes(contextAnchor)
  && !executeTrade.parameters.jsCode.includes('scoreTrace:d.scoreTrace')) {
  throw new Error('Execute Trade context anchor not found');
}
executeTrade.parameters.jsCode = executeTrade.parameters.jsCode.replace(contextAnchor, contextReplacement);

fs.writeFileSync(workflowPath, JSON.stringify([workflow], null, 2) + '\n');
console.log(JSON.stringify({ workflow: workflow.name, nodes: workflow.nodes.length, output: workflowPath }));
