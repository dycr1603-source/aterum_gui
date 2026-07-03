'use strict';

// Fase 1 del rediseño del Portfolio Manager (ver auditoria XPLUSDT/NEARUSDT/
// ZECUSDT). Verifica que el nodo "Position Sizer" rechace posiciones cuyo
// tamano final ya no justifique el costo operativo (Efficiency Gate) y que,
// al rechazar, intente el siguiente candidato del opportunityRanking en vez
// de terminar el ciclo.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const workflowRoot = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json'), 'utf8'));
const workflow = Array.isArray(workflowRoot) ? workflowRoot[0] : workflowRoot;
const code = workflow.nodes.find(node => node.name === 'Position Sizer').parameters.jsCode;

assert(code.includes('SIZE_REALIZATION_TOO_LOW'), 'Position Sizer must expose the efficiency gate rejection code');
assert(code.includes('opportunityRanking'), 'Position Sizer must consider ranked alternates for fallback');
assert(code.includes('/db/rejection'), 'Efficiency gate rejection must persist to the decision trace');
assert(code.includes('/db/scan'), 'Efficiency gate rejection must persist to scan/learning/research');

function makeHelpers(calls) {
  return { httpRequest: async options => { calls.push(options); return {}; } };
}

async function run(input) {
  const calls = [];
  const fn = new AsyncFunction('$input', 'process', 'require', 'console', code);
  const out = await fn.call({ helpers: makeHelpers(calls) }, { first: () => ({ json: input }) },
    { env: {} }, require, { log() {} });
  return { output: out[0].json, calls };
}

(async () => {
  // Caso 1: XPLUSDT real (trade id=106). entry=0.10836 sl=0.1037 atr_pct=2.863,
  // direction exposure LONG casi saturada (880.39 de 886.03 max) produce qty=52,
  // ratio de realizacion ~4% muy por debajo del 10% minimo. Debe rechazarse.
  {
    const xpl = {
      symbol: 'XPLUSDT', direction: 'LONG', finalScore: 100, dynamicThreshold: 65,
      indicators: { currentPrice: 0.1084, atr: 0.1084 * 0.02863 },
      tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING', recommended_leverage: 5 },
      balance: 221.5087, availableBalance: 100, openCount: 8, openSymbols: [],
      marketContext: { size_multiplier: 0.75 }, riskReduction: 0, slMultiplier: 1.5, tpMultiplier: 2,
      opportunityRanking: [],
      portfolioCapacity: { allowed: true, account: { equity: 221.5087 },
        risk: { remainingRiskAmount: 2.0529 }, capacity: { remainingMargin: 16.6346 },
        exposure: { remaining: 2095.53, bySymbol: {}, direction: { LONG: 880.3885 } },
        limits: { maxSymbolExposurePct: 150, maxDirectionExposurePct: 400 } }
    };
    const { output, calls } = await run(xpl);
    assert.equal(output.allocationAllowed, false, 'XPLUSDT (ratio ~4%) must be rejected by the efficiency gate');
    assert.equal(output.qty, 0);
    assert(output.skipReason.includes('SIZE_REALIZATION_TOO_LOW'));
    assert(calls.some(call => call.url.includes('/db/rejection')), 'must persist rejection to decision trace');
    assert(calls.some(call => call.url.includes('/db/scan')), 'must persist to scan/learning/research');
  }

  // Caso 2: NEARUSDT real (trade id=104). entry=2.028 sl=1.981 atr_pct=1.553,
  // ratio ~5.5-7% tambien por debajo del minimo. Debe rechazarse.
  {
    const near = {
      symbol: 'NEARUSDT', direction: 'LONG', finalScore: 100, dynamicThreshold: 65,
      indicators: { currentPrice: 2.028, atr: 2.028 * 0.01553 },
      tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING', recommended_leverage: 5 },
      balance: 219.9285, availableBalance: 100, openCount: 8, openSymbols: [],
      marketContext: { size_multiplier: 0.75 }, riskReduction: 0, slMultiplier: 1.5, tpMultiplier: 2,
      opportunityRanking: [],
      portfolioCapacity: { allowed: true, account: { equity: 219.9285 },
        risk: { remainingRiskAmount: 2.7975 }, capacity: { remainingMargin: 19.5907 },
        exposure: { remaining: 1000, bySymbol: {}, direction: { LONG: 864.7824 } },
        limits: { maxSymbolExposurePct: 150, maxDirectionExposurePct: 400 } }
    };
    const { output, calls } = await run(near);
    assert.equal(output.allocationAllowed, false, 'NEARUSDT (ratio ~6%) must be rejected by the efficiency gate');
    assert(calls.some(call => call.url.includes('/db/rejection')));
  }

  // Caso 3: ZECUSDT real (trade id=103). entry=458.53 sl=446.5 atr_pct=1.732,
  // ratio ~12.2% por encima del minimo 10%. Debe ejecutarse igual que en
  // produccion (qty=0.06, margin=$5.50) — el gate no penaliza tamanos que ya
  // son razonables relativo a lo que su score se gano.
  {
    const zec = {
      symbol: 'ZECUSDT', direction: 'LONG', finalScore: 100, dynamicThreshold: 65,
      indicators: { currentPrice: 458.53, atr: 458.53 * 0.01732 },
      tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING', recommended_leverage: 5 },
      balance: 215.816, availableBalance: 100, openCount: 8, openSymbols: [],
      marketContext: { size_multiplier: 0.75 }, riskReduction: 0, slMultiplier: 1.5, tpMultiplier: 2,
      opportunityRanking: [],
      portfolioCapacity: { allowed: true, account: { equity: 215.816 },
        risk: { remainingRiskAmount: 3.3137 }, capacity: { remainingMargin: 25.5049 },
        exposure: { remaining: 1000, bySymbol: {}, direction: { LONG: 833.1445 } },
        limits: { maxSymbolExposurePct: 150, maxDirectionExposurePct: 400 } }
    };
    const { output } = await run(zec);
    assert.equal(output.allocationAllowed, true, 'ZECUSDT (ratio ~12%) must still execute like in production');
    assert.equal(output.qty, 0.06);
    assert.equal(output.marginRequired, 5.5);
  }

  // Caso 4: cuando el candidato principal falla el gate pero el ranking trae
  // una alternativa cuyo tamano si es eficiente (no compite por el mismo cupo
  // de direction exposure), el sistema debe abrir esa alternativa en vez de
  // rechazar el ciclo completo.
  {
    const withAlternate = {
      symbol: 'XPLUSDT', direction: 'LONG', finalScore: 100, dynamicThreshold: 65,
      indicators: { currentPrice: 0.1084, atr: 0.1084 * 0.02863 },
      tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING', recommended_leverage: 5 },
      balance: 221.5087, availableBalance: 100, openCount: 8, openSymbols: [],
      marketContext: { size_multiplier: 0.75 }, riskReduction: 0, slMultiplier: 1.5, tpMultiplier: 2,
      opportunityRanking: [
        { symbol: 'XPLUSDT', direction: 'LONG', finalScore: 100, hardBlockers: [],
          indicators: { currentPrice: 0.1084, atr: 0.1084 * 0.02863 }, tf4h: { status: 'CONFIRMS' }, regime: 'TRENDING' },
        { symbol: 'ETHUSDT', direction: 'SHORT', finalScore: 90, hardBlockers: [],
          indicators: { currentPrice: 3200, atr: 3200 * 0.018 }, tf4h: { status: 'CONFIRMS' }, regime: 'TRENDING' }
      ],
      portfolioCapacity: { allowed: true, account: { equity: 221.5087 },
        risk: { remainingRiskAmount: 2.0529 }, capacity: { remainingMargin: 16.6346 },
        exposure: { remaining: 2095.53, bySymbol: {}, direction: { LONG: 880.3885, SHORT: 0 } },
        limits: { maxSymbolExposurePct: 150, maxDirectionExposurePct: 400 } }
    };
    const { output, calls } = await run(withAlternate);
    assert.equal(output.allocationAllowed, true, 'must fall back to the next ranked candidate');
    assert.equal(output.symbol, 'ETHUSDT');
    assert.equal(output.usedFallback, true);
    assert.equal(output.originalSymbol, 'XPLUSDT');
    assert.equal(calls.length, 0, 'must not persist a rejection when the fallback candidate succeeds');
  }

  // Caso 5: si ningun candidato del ranking pasa el gate, el ciclo se
  // rechaza (qty=0) en vez de ejecutar el mejor de los malos.
  {
    const allBad = {
      symbol: 'XPLUSDT', direction: 'LONG', finalScore: 100, dynamicThreshold: 65,
      indicators: { currentPrice: 0.1084, atr: 0.1084 * 0.02863 },
      tf4h: { status: 'CONFIRMS' }, aiResult: { regime: 'TRENDING', recommended_leverage: 5 },
      balance: 221.5087, availableBalance: 100, openCount: 8, openSymbols: [],
      marketContext: { size_multiplier: 0.75 }, riskReduction: 0, slMultiplier: 1.5, tpMultiplier: 2,
      opportunityRanking: [
        { symbol: 'XPLUSDT', direction: 'LONG', finalScore: 100, hardBlockers: [],
          indicators: { currentPrice: 0.1084, atr: 0.1084 * 0.02863 }, tf4h: { status: 'CONFIRMS' }, regime: 'TRENDING' },
        { symbol: 'NEARUSDT', direction: 'LONG', finalScore: 95, hardBlockers: [],
          indicators: { currentPrice: 2.028, atr: 2.028 * 0.01553 }, tf4h: { status: 'CONFIRMS' }, regime: 'TRENDING' }
      ],
      portfolioCapacity: { allowed: true, account: { equity: 221.5087 },
        risk: { remainingRiskAmount: 2.0529 }, capacity: { remainingMargin: 16.6346 },
        exposure: { remaining: 2095.53, bySymbol: {}, direction: { LONG: 880.3885 } },
        limits: { maxSymbolExposurePct: 150, maxDirectionExposurePct: 400 } }
    };
    const { output, calls } = await run(allBad);
    assert.equal(output.allocationAllowed, false, 'must reject when every ranked candidate fails the gate');
    assert.equal(output.qty, 0);
    assert.equal(output.rejectionReason.attempts.length, 2, 'must record every attempted candidate');
    assert(calls.some(call => call.url.includes('/db/rejection')));
  }

  console.log('efficiency gate tests: ok');
})().catch(error => { console.error(error); process.exit(1); });
