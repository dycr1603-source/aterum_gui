'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowRoot = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json'), 'utf8'));
const workflow = Array.isArray(workflowRoot) ? workflowRoot[0] : workflowRoot;
const code = name => workflow.nodes.find(node => node.name === name).parameters.jsCode;

assert(!code('Risk Guard').includes('MAX_POSITIONS'));
assert(!code('Risk Guard').includes('MAX_PORTFOLIO_POSITIONS'));
assert(code('Risk Guard').includes('/portfolio-capacity'));
assert(code('Opportunity Discovery').includes('portfolioCapacity'));
assert(!code('Position Sizer').includes('openPenalty'));
assert(code('Position Sizer').includes('remainingRiskAmount'));
assert(code('Execute Trade').includes('PORTFOLIO_CAPACITY_REJECTED'));

async function riskGuard(capacity) {
  const helpers = { httpRequest: async options => {
    if (options.url.includes('/cb/status')) return { active: false };
    if (options.url.includes('/portfolio-capacity')) return capacity;
    if (options.url.includes('/capital-status')) return { halted: false, reasons: [] };
    if (options.url.includes('/fapi/v2/balance')) return [{ asset: 'USDT', balance: '200', availableBalance: '60' }];
    if (options.url.includes('/fapi/v2/positionRisk')) return ['AAA', 'BBB', 'CCC'].map((symbol, index) => ({
      symbol: `${symbol}USDT`, positionAmt: '-1', entryPrice: String(100 + index), unRealizedProfit: '0'
    }));
    if (options.url.includes('/fapi/v1/income')) return [];
    throw new Error(`Unexpected URL ${options.url}`);
  } };
  const fn = new AsyncFunction('$input', 'process', 'require', 'console', code('Risk Guard'));
  const processMock = { env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret',
    EXECUTION_ENGINE_TOKEN: 'token', EXECUTION_ENGINE_URL: 'http://position_guard:3091/executions' } };
  const output = await fn.call({ helpers }, { first: () => ({ json: {} }) }, processMock, require, { log() {} });
  return output[0].json;
}

(async () => {
  const available = await riskGuard({ allowed: true, primaryReason: null,
    account: { equity: 200, marginUsagePct: 70 }, risk: { openRiskPct: 1.8, remainingRiskPct: 3.2,
      maximumRiskPct: 5 }, exposure: { totalPct: 350 }, limits: { maxMarginUsagePct: 90, maxExposurePct: 500 },
    capacity: { dynamicAdditionalPositions: 1, remainingMargin: 40 } });
  assert.equal(available.openCount, 3);
  assert.equal(available.passRisk, true, 'three positions incorrectly halted capital-aware allocation');

  const full = await riskGuard({ allowed: false, primaryReason: { code: 'PORTFOLIO_RISK_FULL' },
    account: { equity: 200, marginUsagePct: 70 }, risk: { openRiskPct: 5, remainingRiskPct: 0,
      maximumRiskPct: 5 }, exposure: { totalPct: 350 }, limits: { maxMarginUsagePct: 90, maxExposurePct: 500 },
    capacity: { dynamicAdditionalPositions: 0, remainingMargin: 40 } });
  assert.equal(full.passRisk, false);
  assert.equal(full.riskDecision.primaryReason.code, 'PORTFOLIO_CAPACITY_FULL');

  const opportunitySource = fs.readFileSync(path.resolve(__dirname, '../services/opportunity_engine.js'), 'utf8');
  assert(!opportunitySource.includes('OPPORTUNITY_MAX_POSITIONS'));
  assert(!opportunitySource.includes('MAX_PORTFOLIO_POSITIONS'));
  assert(opportunitySource.includes('PORTFOLIO_CAPACITY_FULL'));
  console.log('portfolio allocation regression tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
