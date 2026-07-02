'use strict';

const fs = require('fs');
const { buildDecisionTrace } = require('../services/decision_trace');

const inputPath = process.argv[2] || '/tmp/quant-audit-input.json';
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const opportunities = input.opportunities || [];
let valid = 0;
let maximumDifference = 0;
const invalid = [];

for (const row of opportunities) {
  const contributions = JSON.parse(row.contributions || '[]');
  const technicalContributions = contributions.filter(item => !String(item.component || '').startsWith('learning.'));
  const learningContributions = contributions.filter(item => String(item.component || '').startsWith('learning.'));
  const trace = buildDecisionTrace({
    opportunityCycleId: row.cycle_id,
    symbol: row.symbol,
    direction: row.direction,
    technicalScore: row.technical_score,
    finalScore: row.final_score,
    threshold: row.threshold,
    technicalContributions,
    learningContributions,
    learningDelta: row.learning_delta,
    generatedAt: row.evaluated_at
  });
  maximumDifference = Math.max(maximumDifference, Math.abs(trace.reconstruction.difference));
  if (trace.reconstruction.valid) valid += 1;
  else invalid.push({ id: row.id, symbol: row.symbol, cycleId: row.cycle_id,
    difference: trace.reconstruction.difference });
}

const result = {
  input: inputPath,
  opportunities: opportunities.length,
  reconstructable: valid,
  invalid: invalid.length,
  maximumDifference,
  examples: invalid.slice(0, 10)
};

console.log(JSON.stringify(result, null, 2));
if (invalid.length) process.exitCode = 1;
