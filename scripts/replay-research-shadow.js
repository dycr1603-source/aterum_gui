'use strict';

const fs = require('fs');

const inputPath = process.argv[2] || '/tmp/quant-audit-input.json';
const policyStart = new Date(process.env.REPLAY_POLICY_START || '2026-07-01T15:51:08.429Z');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function productionDelta(contributions) {
  const raw = contributions.filter(row => String(row.component || '').startsWith('learning.')).reduce((sum, row) => {
    const weight = number(row.weight, 1);
    const profitable = number(row.expectancy) >= 0 && number(row.profitFactor) >= 1;
    const effective = profitable && weight < 1 ? 1 : weight;
    return sum + clamp((effective - 1) * 25, -3, 3);
  }, 0);
  return clamp(raw, -8, 8);
}

function replay(rows) {
  const cycles = new Map();
  for (const row of rows) {
    const contributions = JSON.parse(row.contributions || '[]');
    const blockers = JSON.parse(row.blockers || '[]');
    const score = clamp(number(row.technical_score) + productionDelta(contributions), 0, 100);
    const candidate = { ...row, score, eligible: row.direction !== 'NEUTRAL'
      && score >= number(row.threshold, 65) && blockers.length === 0 };
    const list = cycles.get(row.cycle_id) || [];
    list.push(candidate);
    cycles.set(row.cycle_id, list);
  }
  let changedSelections = 0;
  let eligibilityChanges = 0;
  const changes = [];
  for (const [cycleId, candidates] of cycles) {
    const before = candidates.find(candidate => number(candidate.selected) === 1) || null;
    const after = candidates.filter(candidate => candidate.eligible)
      .sort((left, right) => right.score - left.score || number(right.scan_score) - number(left.scan_score))[0] || null;
    if ((before?.symbol || null) !== (after?.symbol || null)) {
      changedSelections += 1;
      changes.push({ cycleId, before: before?.symbol || null, after: after?.symbol || null });
    }
    for (const candidate of candidates) {
      const blockers = JSON.parse(candidate.blockers || '[]');
      const oldEligible = candidate.direction !== 'NEUTRAL'
        && number(candidate.final_score) >= number(candidate.threshold, 65) && blockers.length === 0;
      if (oldEligible !== candidate.eligible) eligibilityChanges += 1;
    }
  }
  return { cycles: cycles.size, candidates: rows.length, changedSelections, eligibilityChanges, changes };
}

const all = replay(input.opportunities || []);
const current = replay((input.opportunities || []).filter(row => new Date(row.evaluated_at) >= policyStart));
console.log(JSON.stringify({ all, currentPolicy: current }, null, 2));
