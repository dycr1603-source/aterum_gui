'use strict';

const assert = require('assert');
const { calculateCapacity } = require('./portfolio-allocation');

function shortPosition({ qty = 1, entry = 100, mark = 100, stop = 103.6, margin = 140, symbol = 'AAAUSDT' } = {}) {
  return {
    balanceRows: [{ asset: 'USDT', balance: '200', availableBalance: '60' }],
    positionRows: [{ symbol, positionAmt: String(-qty), positionSide: 'SHORT', entryPrice: String(entry),
      markPrice: String(mark), leverage: '5', positionInitialMargin: String(margin), unRealizedProfit: '0' }],
    protectiveOrders: [{ symbol, side: 'BUY', positionSide: 'SHORT', orderType: 'STOP_MARKET',
      algoStatus: 'NEW', triggerPrice: String(stop) }]
  };
}

const limits = { portfolioMaxRiskPct: 5, portfolioMaxMarginUsagePct: 90,
  portfolioMinFreeMarginPct: 10, portfolioMaxExposurePct: 500,
  portfolioMaxSymbolExposurePct: 150, portfolioMaxDirectionExposurePct: 400,
  portfolioPlanningRiskPct: 1, portfolioPlanningMarginPct: 20,
  portfolioMinimumTradeRiskPct: 0.5, portfolioMinimumTradeMargin: 5 };

const example = calculateCapacity({ ...shortPosition(), limits, candidate: {
  symbol: 'BBBUSDT', positionSide: 'LONG', quantity: 0.4, entryPrice: 100, stopLoss: 95, leverage: 5
} });
assert.equal(example.allowed, true, 'free margin and remaining risk should permit another position');
assert.equal(example.account.equity, 200);
assert.equal(example.account.marginUsed, 140);
assert.equal(example.account.availableMargin, 60);
assert.equal(example.risk.openRiskPct, 1.8);
assert.equal(example.risk.remainingRiskPct, 3.2);
assert.equal(example.capacity.remainingMargin, 40);
assert.equal(example.capacity.dynamicAdditionalPositions, 3);

const riskFull = calculateCapacity({ ...shortPosition({ stop: 110 }), limits });
assert.equal(riskFull.allowed, false);
assert.equal(riskFull.primaryReason.code, 'PORTFOLIO_RISK_FULL');

const marginFullFixture = shortPosition();
marginFullFixture.balanceRows[0].availableBalance = '20';
const marginFull = calculateCapacity({ ...marginFullFixture, limits });
assert.equal(marginFull.allowed, false);
assert(marginFull.blockers.some(blocker => blocker.code === 'MARGIN_CAPACITY_FULL'));

const concentrated = calculateCapacity({ ...shortPosition({ qty: 7, stop: 100.5 }), limits, candidate: {
  symbol: 'BBBUSDT', positionSide: 'SHORT', quantity: 1.5, entryPrice: 100, stopLoss: 99, leverage: 5
} });
assert(concentrated.blockers.some(blocker => blocker.code === 'DIRECTION_EXPOSURE_LIMIT'));

const unprotected = shortPosition();
unprotected.protectiveOrders = [];
assert(calculateCapacity({ ...unprotected, limits }).blockers.some(blocker => blocker.code === 'UNPROTECTED_POSITION'));

// ── Fase 2: Real Open Risk (Initial / Current / Released / Portfolio) ─────────
// Sin tradeRows el comportamiento es identico al de antes (metadato null,
// ningun clamp cambia).
const withoutTradeRows = calculateCapacity({ ...shortPosition(), limits });
assert.equal(withoutTradeRows.risk.initialRiskAmount, null);
assert.equal(withoutTradeRows.risk.releasedRiskAmount, null);
assert.equal(withoutTradeRows.positions[0].initialRisk, null);

// Posicion SHORT recien abierta (INITIAL): el SL de Binance es el mismo que
// el SL inicial en trades -> currentRisk == initialRisk, releasedRisk == 0.
const stillInitial = calculateCapacity({ ...shortPosition({ entry: 100, stop: 103.6 }), limits,
  tradeRows: [{ symbol: 'AAAUSDT', direction: 'SHORT', entry_price: 100, initial_sl_price: 103.6, trailing_stage: 'INITIAL' }] });
assert.equal(stillInitial.positions[0].initialRisk, 3.6);
assert.equal(stillInitial.positions[0].currentRisk, 3.6);
assert.equal(stillInitial.positions[0].releasedRisk, 0);
assert.equal(stillInitial.risk.initialRiskAmount, 3.6);
assert.equal(stillInitial.risk.releasedRiskAmount, 0);
assert.equal(stillInitial.positions[0].trailingStage, 'INITIAL');

// Misma posicion, pero el SL de Binance ya se movio a Break Even (100.5 en
// SHORT, por encima de entry). El riesgo inicial se preservo (era 3.6 al
// abrir), pero el riesgo vivo (currentRisk) cae a lo que queda entre entry y
// el SL actual, y ese diferencial se reporta como riesgo liberado.
const atBreakeven = calculateCapacity({ ...shortPosition({ entry: 100, stop: 99.9 }), limits,
  tradeRows: [{ symbol: 'AAAUSDT', direction: 'SHORT', entry_price: 100, initial_sl_price: 103.6, trailing_stage: 'BREAKEVEN' }] });
assert.equal(atBreakeven.positions[0].initialRisk, 3.6);
assert.equal(atBreakeven.positions[0].currentRisk, 0);
assert.equal(atBreakeven.positions[0].releasedRisk, 3.6);
assert.equal(atBreakeven.risk.releasedRiskAmount, 3.6);
assert.equal(atBreakeven.positions[0].trailingStage, 'BREAKEVEN');
// openRiskAmount (el que alimenta remainingRiskAmount y por lo tanto todos
// los clamps del Position Sizer) sigue calculandose sobre el SL real de
// Binance, sin cambios de formula: aqui debe ser 0, liberando presupuesto.
assert.equal(atBreakeven.risk.openRiskAmount, 0);
assert.equal(atBreakeven.risk.remainingRiskAmount, 10); // 5% de 200 equity, sin riesgo vivo que lo consuma

console.log('portfolio allocation tests: ok');
