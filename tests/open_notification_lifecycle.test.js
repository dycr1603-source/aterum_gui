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
    success: true, finalStatus: 'VERIFIED', symbol: 'TAOUSDT', positionSide: 'SHORT',
    executionId: 'verified-execution', exchangeOrderId: 'market-1',
    exchangeResponse: { stopOrder: { create: { algoId: 'stop-1' } },
      takeProfitOrder: { create: { algoId: 'tp-1' } } },
    verificationResult: { verified: true, pipelineVerified: true, persistenceStatus: 'VERIFIED',
      requested: { stopLoss: 204.45, takeProfit: 194.49 },
      after: { position: { side: 'SHORT', qty: 1.1, entryPrice: 201.12 } } },
    technicalScore: 100, finalScore: 97.841, projectedEntry: 999,
    learningDecision: { scoreDelta: -2.159 },
    opportunityDecision: { rank: 1 }, opportunityUniverse: { total: 554, candidates: 32 },
    contributionTable: [
      { component: 'trend_4h', value: 15 }, { component: 'macro', value: 8 },
      { component: 'intelligence', value: 0 }
    ],
    tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING' },
    marketContext: { market_bias: 'BEARISH', intelligenceSignal: {
      signal: 'NO OPERAR', confidence: 'baja', scoreAdjustment: { ifLong: -2, ifShort: -2 }
    } },
    sizingInfo: { tf4hMultiplier: 1.1, macroSizeMultiplier: 0.6,
      regimeMultiplier: 1.1, scoreMultiplier: 1.5, regime: 'TRENDING' }
  });
  assert(opened.text.includes('✅ TRADE OPENED'));
  assert(opened.text.includes('Persistence: VERIFIED'));
  assert(opened.text.includes('Market Order ID: market-1'));
  assert(opened.text.includes('Technical Score: 100.00/100'));
  assert(opened.text.includes('Learning Adjustment: -2.16'));
  assert(opened.text.includes('Final Decision Score: 97.84/100'));
  assert(opened.text.includes('4H CONFIRMS: score +15.00, size 1.10x'));
  assert(opened.text.includes('Intelligence NO OPERAR (baja): score +0.00 — ignored: baja confidence'));
  assert(opened.text.includes('Macro BEARISH: score +8.00, size 0.60x'));
  assert(!opened.text.includes('999'), 'projected execution value leaked into verified notification');

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
