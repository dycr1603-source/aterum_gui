'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json'), 'utf8'));
const workflow = Array.isArray(workflowRaw) ? workflowRaw[0] : workflowRaw;
const code = name => workflow.nodes.find(node => node.name === name).parameters.jsCode;

async function run(nodeName, input) {
  const fn = new AsyncFunction('$input', code(nodeName));
  return (await fn({ first: () => ({ json: input }) }))[0].json;
}

(async () => {
  const branches = workflow.connections['If: Execution Verified'].main;
  assert.equal(branches[0][0].node, 'Build Trade Alert');
  assert.equal(branches[1][0].node, 'Build Execution Failure');
  assert(!branches[0].some(edge => edge.node === 'Monitor SL Global'));
  const conditions = workflow.nodes.find(node => node.name === 'If: Execution Verified')
    .parameters.conditions.conditions.map(condition => condition.id);
  assert(conditions.includes('execution-pipeline-condition'));
  assert(conditions.includes('execution-persistence-condition'));
  assert(!code('Build Trade Alert').includes('/db/trade/open'));

  const opened = await run('Build Trade Alert', {
    success: true, finalStatus: 'VERIFIED', symbol: 'ATOMUSDT', positionSide: 'SHORT',
    executionId: 'verified-execution', exchangeOrderId: 'market-1',
    exchangeResponse: { stopOrder: { create: { algoId: 'stop-1' } },
      takeProfitOrder: { create: { algoId: 'tp-1' } } },
    verificationResult: { verified: true, pipelineVerified: true, persistenceStatus: 'VERIFIED',
      requested: { stopLoss: 1.524, takeProfit: 1.455 },
      after: { position: { side: 'SHORT', qty: 137.8, entryPrice: 1.501 } } },
    finalScore: 99, projectedEntry: 999
  });
  assert(opened.text.includes('✅ TRADE OPENED'));
  assert(opened.text.includes('Persistence: VERIFIED'));
  assert(opened.text.includes('Market Order ID: market-1'));
  assert(!opened.text.includes('99'), 'projected score leaked into verified execution notification');

  await assert.rejects(() => run('Build Trade Alert', {
    success: false, finalStatus: 'REJECTED', symbol: 'ATOMUSDT', exchangeOrderId: null,
    verificationResult: { verified: false }
  }), /notification blocked/);

  const rejected = await run('Build Execution Failure', {
    symbol: 'ATOMUSDT', positionSide: 'SHORT', executionId: 'rejected-execution',
    finalStatus: 'REJECTED', status: 'PORTFOLIO_CAPACITY_REJECTED', failureCategory: 'EXECUTION_REJECTED',
    rejectionReason: { code: 'DIRECTION_EXPOSURE_LIMIT', direction: 'SHORT', current: 400.3756, maximum: 400 },
    portfolioCapacity: { account: { equity: 203.7178 } }
  });
  assert(rejected.telegramText.includes('❌ TRADE REJECTED'));
  assert(rejected.telegramText.includes('Direction Exposure Limit'));
  assert(rejected.telegramText.includes('No Binance order was created'));
  assert(!rejected.telegramText.includes('TRADE OPENED'));

  const failed = await run('Build Execution Failure', {
    symbol: 'ATOMUSDT', executionId: 'failed-execution', finalStatus: 'FAILED',
    failureCategory: 'EXECUTION_FAILURE', error: 'Binance rejected'
  });
  assert(failed.telegramText.includes('🚨 EXECUTION FAILED'));

  const unverified = await run('Build Execution Failure', {
    symbol: 'ATOMUSDT', executionId: 'verification-execution', finalStatus: 'FAILED',
    failureCategory: 'VERIFICATION_FAILURE', error: 'read-back timeout'
  });
  assert(unverified.telegramText.includes('⚠ VERIFICATION FAILED'));
  console.log('open notification lifecycle tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
