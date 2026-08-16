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
  const failureNotificationBranches = workflow.connections['If: Failure Notification Required'].main;
  assert.deepStrictEqual(failureNotificationBranches[1], [],
    'an unverified execution must never enter Monitor SL Global');
  const conditions = workflow.nodes.find(node => node.name === 'If: Execution Verified')
    .parameters.conditions.conditions.map(condition => condition.id);
  assert(conditions.includes('execution-pipeline-condition'));
  assert(conditions.includes('execution-persistence-condition'));
  assert(!code('Build Trade Alert').includes('/db/trade/open'));
  for (const field of ['technicalScore', 'contributionTable', 'opportunityDecision',
    'opportunityUniverse', 'opportunityRanking', 'learningDecision', 'riskDecision']) {
    assert(code('Position Sizer').includes(field), `Position Sizer dropped ${field} decision provenance`);
  }

  const opened = await run('Build Trade Alert', {
    success: true, finalStatus: 'VERIFIED', symbol: 'TAOUSDT', positionSide: 'SHORT',
    executionId: 'verified-execution', exchangeOrderId: 'market-1',
    exchangeResponse: { stopOrder: { create: { algoId: 'stop-1' } },
      takeProfitOrder: { create: { algoId: 'tp-1' } } },
    verificationResult: { verified: true, pipelineVerified: true, persistenceStatus: 'VERIFIED',
      requested: { stopLoss: 204.45, takeProfit: 194.49 },
      after: { position: { side: 'SHORT', qty: 1.1, entryPrice: 201.12 } },
      portfolioAllocation: { allowed: true,
        account: { equity: 203.72, availableMargin: 116.43, marginUsed: 87.29, marginUsagePct: 42.85 },
        risk: { openRiskPct: 2.22, maximumRiskPct: 5, remainingRiskPct: 2.78 },
        exposure: { totalPct: 198.4 }, capacity: { remainingMargin: 116.43 },
        limits: { maxExposurePct: 500 }, positions: [{ symbol: 'BTCUSDT' }] }
    },
    technicalScore: 100, finalScore: 97.841, projectedEntry: 999,
    learningDecision: { scoreDelta: -2.159, requiredScore: 65 }, dynamicThreshold: 65,
    opportunityDecision: { rank: 1, longScore: 28, shortScore: 100, separation: 72,
      hardBlockers: [] },
    opportunityUniverse: { total: 554, eligible: 410, refreshed: 32, candidates: 32 },
    opportunityRanking: [{ symbol: 'TAOUSDT', rank: 1 }],
    contributionTable: [
      { component: 'base', value: 15 }, { component: 'trend_1h', value: 25 },
      { component: 'momentum_rsi', value: 15 }, { component: 'vwap_structure', value: 10 },
      { component: 'volume_quality', value: 4 }, { component: 'volatility_quality', value: 5 },
      { component: 'funding', value: 0 }, { component: 'liquidity', value: 1 },
      { component: 'open_interest', value: 3 },
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
  assert(opened.text.includes('✅ TRADE ABIERTO'));
  assert(opened.text.includes('↓ Persistencia ✅ VERIFIED'));
  assert(opened.text.includes('━━━ ¿POR QUÉ SE APROBÓ? ━━━'));
  assert(opened.text.includes('━━━ PIPELINE DE DECISIÓN ━━━'));
  assert(opened.text.includes('━━━ PUNTUACIÓN REAL ━━━'));
  assert(opened.text.includes('Technical Composite  100.00/100'));
  assert(opened.text.includes('[████████░░] 78.0'));
  assert(opened.text.includes('[█████████░] 93.0'));
  assert(opened.text.includes('↓ Learning aplicado  -2.16'));
  assert(opened.text.includes('Intelligence NO OPERAR · IGNORADO (baja)'));
  assert(opened.text.includes('Macro BEARISH  +8.00'));
  assert(opened.text.includes('MARKET        ✅ market-1'));
  assert(opened.text.includes('━━━ PRECIOS ━━━'));
  assert(opened.text.includes('━━━ POSICIÓN Y RIESGO ━━━'));
  assert(opened.text.includes('━━━ CUENTA · PREFLIGHT REAL ━━━'));
  assert(opened.text.includes('━━━ INDICADORES ━━━'));
  assert(opened.text.length <= 4096, `premium notification is ${opened.text.length} chars`);
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
  assert(rejected.telegramText.includes('❌ TRADE RECHAZADO'));
  assert(rejected.telegramText.includes('DIRECTION_EXPOSURE_LIMIT'));
  assert(rejected.telegramText.includes('Binance'));
  assert.equal(rejected.notificationStatus, 'PENDING_SEND');

  const failed = await run('Build Execution Failure', {
    symbol: 'ATOMUSDT', executionId: 'failed-execution', finalStatus: 'FAILED',
    failureCategory: 'EXECUTION_FAILURE', error: 'Binance rejected'
  });
  assert(failed.telegramText.includes('🚨 EJECUCIÓN FALLIDA'));

  const unverified = await run('Build Execution Failure', {
    symbol: 'ATOMUSDT', executionId: 'verification-execution', finalStatus: 'FAILED',
    failureCategory: 'VERIFICATION_FAILURE', error: 'read-back timeout'
  });
  assert(unverified.telegramText.includes('⚠ VERIFICACIÓN FALLIDA'));

  const engineNotified = await run('Build Execution Failure', {
    symbol: 'DOTUSDT', executionId: 'engine-notified', finalStatus: 'FAILED',
    failureNotificationSent: true, error: 'Local state publication failed'
  });
  assert.equal(engineNotified.telegramText, null);
  assert.equal(engineNotified.notificationStatus, 'SENT_BY_ENGINE');
  console.log(`open notification lifecycle tests: ok (${opened.text.length} premium chars)`);
})().catch(error => { console.error(error); process.exit(1); });
