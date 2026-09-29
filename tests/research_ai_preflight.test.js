'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json'), 'utf8'))[0];
const targets = [
  ['Daily Analysis Report', 'daily'],
  ['Weekly Deep Analysis', 'weekly']
];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function run(node, failureAt = null, capacityAllowed = false) {
  const calls = [];
  const context = { helpers: { httpRequest: async options => {
    calls.push(options);
    if (options.url.includes('/fapi/v1/time')) {
      if (failureAt === 'binance') throw new Error('private test error');
      return { serverTime: Date.now() };
    }
    if (options.url.includes('/fapi/v2/balance')) return [{ asset: 'USDT', balance: '100', availableBalance: '18' }];
    if (options.url.includes('/portfolio-capacity')) {
      if (failureAt === 'portfolio') throw new Error('private test error');
      return {
      allowed: capacityAllowed, primaryReason: { code: 'MARGIN_CAPACITY_FULL' },
      account: { equity: 100, availableMargin: 18, marginUsagePct: 82 },
      capacity: { remainingMargin: 0 }, risk: { openRiskPct: 4.5, remainingRiskPct: 0.5, maximumRiskPct: 5 },
      limits: { minimumTradeMargin: 5, maxMarginUsagePct: 90 }, positions: [{}, {}]
      };
    }
    if (options.url.includes('/cb/status')) {
      if (failureAt === 'risk') throw new Error('private test error');
      return { active: false };
    }
    if (options.url.includes('/api/learning/capital-status')) return { halted: false };
    if (options.url.includes('/ai-usage/estimate')) return { averageInputTokens: 760, samples: 3 };
    if (options.url.includes('/api/knowledge/ai-usage')) return { saved: true };
    if (options.url.includes('api.anthropic.com')) {
      if (!capacityAllowed) throw new Error('Claude must not be called on rejected preflight');
      return JSON.stringify({ content: [{ text: 'Mock research report' }], usage: { input_tokens: 123, output_tokens: 45 } });
    }
    if (/\/db\/stats|\/api\/research\/|\/api\/learning\//.test(options.url)) return {};
    if (options.url.includes('/db/research-report')) return { saved: true };
    throw new Error(`Unexpected mocked request: ${options.url}`);
  } } };
  const runtime = { env: { BINANCE_API_KEY: 'mock-key', BINANCE_API_SECRET: 'mock-secret',
    EXECUTION_ENGINE_TOKEN: 'mock-execution-token', RESEARCH_AI_AUDIT_TOKEN: 'mock-internal-token',
    INTERNAL_DASHBOARD_BASE: 'http://dashboard:3001' } };
  const execute = new AsyncFunction('$execution', 'process', 'require', node.parameters.jsCode);
  const result = await execute.call(context, { id: 'preflight-test-1' }, runtime, require);
  return { calls, result };
}

(async () => {
  for (const [nodeName, type] of targets) {
    const node = workflow.nodes.find(item => item.name === nodeName);
    assert(node, `missing workflow node ${nodeName}`);
    const code = node.parameters.jsCode;
    assert(code.indexOf('researchCapacityPreflight.call(this)') < code.indexOf('https://api.anthropic.com/v1/messages'),
      `${nodeName}: capacity preflight must run before Claude`);
    const { calls, result } = await run(node);
    assert.equal(result[0].json.analysisSkipped, true);
    assert.equal(result[0].json.reasonCode, 'MARGIN_CAPACITY_FULL');
    assert(result[0].json.text.includes('tokens consumidos: 0'));
    assert(!calls.some(call => call.url.includes('api.anthropic.com')));
    const audit = calls.find(call => call.method === 'POST' && call.url.endsWith('/api/knowledge/ai-usage'));
    assert(audit, `${type}: skipped analysis must be persisted`);
    assert.equal(audit.body.status, 'SKIPPED_CAPACITY');
    assert.equal(audit.body.estimatedOutputTokensSaved, type === 'daily' ? 1400 : 2400);
    assert.equal(audit.body.estimatedInputTokensSaved, 760);

    const allowed = await run(node, null, true);
    assert(allowed.calls.some(call => call.url.includes('api.anthropic.com')));
    const completedAudit = allowed.calls.find(call => call.method === 'POST' && call.url.endsWith('/api/knowledge/ai-usage'));
    assert.equal(completedAudit.body.status, 'COMPLETED');
    assert.equal(completedAudit.body.inputTokens, 123);
    assert.equal(completedAudit.body.outputTokens, 45);

    for (const [failureAt, reasonCode] of [['binance','BINANCE_UNAVAILABLE'],['portfolio','PORTFOLIO_GUARD_UNAVAILABLE'],['risk','RISK_GUARD_UNAVAILABLE']]) {
      const unavailable = await run(node, failureAt);
      assert.equal(unavailable.result[0].json.reasonCode, reasonCode);
      assert(!unavailable.calls.some(call => call.url.includes('api.anthropic.com')));
      const unavailableAudit = unavailable.calls.find(call => call.method === 'POST' && call.url.endsWith('/api/knowledge/ai-usage'));
      assert.equal(unavailableAudit.body.status, 'SKIPPED_UNAVAILABLE');
    }
  }
  console.log('research AI preflight tests: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
