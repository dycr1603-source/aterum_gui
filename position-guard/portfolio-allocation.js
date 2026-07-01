'use strict';

const { normalizePosition, isStop, triggerPrice } = require('./binance');

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(finite(value) * factor) / factor;
}
function pct(amount, equity) { return equity > 0 ? amount / equity * 100 : 0; }

function stopPrice(orders, position) {
  const prices = orders.filter(order => isStop(order, position)).map(triggerPrice)
    .filter(value => Number.isFinite(value) && value > 0);
  if (!prices.length) return null;
  return position.side === 'LONG' ? Math.max(...prices) : Math.min(...prices);
}

function positionRisk(position, stop) {
  if (!(stop > 0)) return null;
  const distance = position.side === 'LONG'
    ? Math.max(0, position.entryPrice - stop)
    : Math.max(0, stop - position.entryPrice);
  return distance * position.qty;
}

function limitsFrom(config = {}) {
  return {
    maxPortfolioRiskPct: finite(config.portfolioMaxRiskPct, 5),
    maxMarginUsagePct: finite(config.portfolioMaxMarginUsagePct, 90),
    minFreeMarginPct: finite(config.portfolioMinFreeMarginPct, 10),
    maxExposurePct: finite(config.portfolioMaxExposurePct, 500),
    maxSymbolExposurePct: finite(config.portfolioMaxSymbolExposurePct, 150),
    maxDirectionExposurePct: finite(config.portfolioMaxDirectionExposurePct, 400),
    planningRiskPct: finite(config.portfolioPlanningRiskPct, 1),
    planningMarginPct: finite(config.portfolioPlanningMarginPct, 20),
    minimumTradeRiskPct: finite(config.portfolioMinimumTradeRiskPct, 0.5),
    minimumTradeMargin: finite(config.portfolioMinimumTradeMargin, 5)
  };
}

function calculateCapacity({ balanceRows = [], positionRows = [], protectiveOrders = [], candidate = null, limits = {} }) {
  const policy = limitsFrom(limits);
  const usdt = balanceRows.find(row => row.asset === 'USDT') || {};
  const positions = positionRows.map(normalizePosition).filter(Boolean);
  const balance = finite(usdt.balance);
  const unrealizedPnl = positionRows.reduce((sum, row) => sum + finite(row.unRealizedProfit), 0);
  const equity = Math.max(0, balance + unrealizedPnl);
  const availableMargin = Math.max(0, finite(usdt.availableBalance));
  const blockers = [];
  const positionDetails = positions.map(position => {
    const raw = positionRows.find(row => row.symbol === position.symbol
      && String(row.positionSide || position.side) === position.side) || {};
    const markPrice = finite(raw.markPrice, position.markPrice || position.entryPrice);
    const notional = Math.abs(finite(raw.notional, position.qty * markPrice));
    const margin = Math.max(0, finite(raw.positionInitialMargin,
      finite(raw.isolatedWallet, notional / Math.max(1, position.leverage))));
    const stop = stopPrice(protectiveOrders, position);
    const risk = positionRisk(position, stop);
    if (risk == null) blockers.push({ code: 'UNPROTECTED_POSITION', symbol: position.symbol,
      reason: 'Open Binance position has no verifiable protective STOP' });
    return { symbol: position.symbol, direction: position.side, quantity: position.qty,
      entryPrice: position.entryPrice, markPrice, leverage: position.leverage, stopPrice: stop,
      riskAmount: risk, margin, notional };
  });

  const openRiskAmount = positionDetails.reduce((sum, row) => sum + finite(row.riskAmount), 0);
  const marginUsed = positionDetails.reduce((sum, row) => sum + row.margin, 0);
  const exposure = positionDetails.reduce((sum, row) => sum + row.notional, 0);
  const directionExposure = { LONG: 0, SHORT: 0 };
  const symbolExposure = {};
  for (const row of positionDetails) {
    directionExposure[row.direction] += row.notional;
    symbolExposure[row.symbol] = (symbolExposure[row.symbol] || 0) + row.notional;
  }

  const maxRiskAmount = equity * policy.maxPortfolioRiskPct / 100;
  const maxMarginAmount = equity * policy.maxMarginUsagePct / 100;
  const reserveMargin = equity * policy.minFreeMarginPct / 100;
  const remainingRiskAmount = Math.max(0, maxRiskAmount - openRiskAmount);
  const remainingMarginCapacity = Math.max(0, Math.min(
    availableMargin - reserveMargin,
    maxMarginAmount - marginUsed
  ));
  const remainingExposure = Math.max(0, equity * policy.maxExposurePct / 100 - exposure);
  const minimumRiskAmount = equity * policy.minimumTradeRiskPct / 100;
  const planningRiskAmount = Math.max(minimumRiskAmount, equity * policy.planningRiskPct / 100);
  const planningMarginAmount = policy.minimumTradeMargin;

  if (!(equity > 0)) blockers.push({ code: 'NO_ACCOUNT_EQUITY', current: equity });
  if (remainingRiskAmount + 1e-8 < minimumRiskAmount) blockers.push({
    code: 'PORTFOLIO_RISK_FULL', current: round(pct(openRiskAmount, equity)), maximum: policy.maxPortfolioRiskPct,
    remainingRiskPct: round(pct(remainingRiskAmount, equity))
  });
  if (remainingMarginCapacity + 1e-8 < policy.minimumTradeMargin) blockers.push({
    code: 'MARGIN_CAPACITY_FULL', current: round(pct(marginUsed, equity)), maximum: policy.maxMarginUsagePct,
    availableMargin: round(availableMargin), reserveMargin: round(reserveMargin)
  });
  if (remainingExposure <= 0) blockers.push({
    code: 'PORTFOLIO_EXPOSURE_FULL', current: round(pct(exposure, equity)), maximum: policy.maxExposurePct
  });

  let candidateMetrics = null;
  if (candidate) {
    const symbol = String(candidate.symbol || '').toUpperCase();
    const direction = String(candidate.positionSide || candidate.direction || '').toUpperCase();
    const quantity = Math.max(0, finite(candidate.quantity));
    const entryPrice = Math.max(0, finite(candidate.entryPrice));
    const stop = Math.max(0, finite(candidate.stopLoss));
    const leverage = Math.max(1, finite(candidate.leverage, 1));
    const notional = quantity * entryPrice;
    const margin = notional / leverage;
    const riskAmount = quantity * Math.abs(entryPrice - stop);
    const nextSymbolExposure = (symbolExposure[symbol] || 0) + notional;
    const nextDirectionExposure = (directionExposure[direction] || 0) + notional;
    candidateMetrics = { symbol, direction, quantity, entryPrice, stopLoss: stop, leverage,
      riskAmount, riskPct: round(pct(riskAmount, equity)), margin, notional };
    if (!(quantity > 0 && entryPrice > 0 && stop > 0)) blockers.push({ code: 'INVALID_CANDIDATE_ALLOCATION' });
    if (riskAmount > remainingRiskAmount + 1e-8) blockers.push({ code: 'CANDIDATE_RISK_EXCEEDS_BUDGET',
      current: round(riskAmount), maximum: round(remainingRiskAmount), exceeded: round(riskAmount - remainingRiskAmount) });
    if (margin > remainingMarginCapacity + 1e-8) blockers.push({ code: 'CANDIDATE_MARGIN_EXCEEDS_CAPACITY',
      current: round(margin), maximum: round(remainingMarginCapacity), exceeded: round(margin - remainingMarginCapacity) });
    if (notional > remainingExposure + 1e-8) blockers.push({ code: 'CANDIDATE_EXPOSURE_EXCEEDS_CAPACITY',
      current: round(notional), maximum: round(remainingExposure) });
    if (nextSymbolExposure > equity * policy.maxSymbolExposurePct / 100 + 1e-8) blockers.push({
      code: 'SYMBOL_EXPOSURE_LIMIT', symbol, current: round(pct(nextSymbolExposure, equity)),
      maximum: policy.maxSymbolExposurePct
    });
    if (nextDirectionExposure > equity * policy.maxDirectionExposurePct / 100 + 1e-8) blockers.push({
      code: 'DIRECTION_EXPOSURE_LIMIT', direction, current: round(pct(nextDirectionExposure, equity)),
      maximum: policy.maxDirectionExposurePct
    });
  }

  const riskSlots = planningRiskAmount > 0 ? Math.floor(remainingRiskAmount / planningRiskAmount) : 0;
  const marginSlots = planningMarginAmount > 0 ? Math.floor(remainingMarginCapacity / planningMarginAmount) : 0;
  const exposureSlots = planningMarginAmount > 0
    ? Math.floor(remainingExposure / (planningMarginAmount * 5)) : 0;
  const dynamicAdditionalPositions = Math.max(0, Math.min(riskSlots, marginSlots, exposureSlots));
  return {
    allowed: blockers.length === 0,
    primaryReason: blockers[0] || null,
    blockers,
    account: { balance: round(balance), equity: round(equity), availableMargin: round(availableMargin),
      marginUsed: round(marginUsed), marginUsagePct: round(pct(marginUsed, equity)) },
    risk: { openRiskAmount: round(openRiskAmount), openRiskPct: round(pct(openRiskAmount, equity)),
      maximumRiskAmount: round(maxRiskAmount), maximumRiskPct: policy.maxPortfolioRiskPct,
      remainingRiskAmount: round(remainingRiskAmount), remainingRiskPct: round(pct(remainingRiskAmount, equity)) },
    exposure: { total: round(exposure), totalPct: round(pct(exposure, equity)),
      direction: Object.fromEntries(Object.entries(directionExposure).map(([key, value]) => [key, round(value)])),
      bySymbol: Object.fromEntries(Object.entries(symbolExposure).map(([key, value]) => [key, round(value)])),
      remaining: round(remainingExposure) },
    capacity: { remainingMargin: round(remainingMarginCapacity), reserveMargin: round(reserveMargin),
      riskSlots, marginSlots, exposureSlots, dynamicAdditionalPositions },
    positions: positionDetails.map(row => ({ ...row, riskAmount: row.riskAmount == null ? null : round(row.riskAmount),
      margin: round(row.margin), notional: round(row.notional) })),
    candidate: candidateMetrics,
    limits: policy,
    sectorConstraint: { applicable: false, reason: 'No authoritative sector classification is available for Binance Futures symbols' },
    checkedAt: new Date().toISOString()
  };
}

class PortfolioAllocator {
  constructor({ config, binance }) { this.config = config; this.binance = binance; }
  async capacity(candidate = null) {
    const [balanceRows, positionRows, regularOrders, algoOrders] = await Promise.all([
      this.binance.balance(), this.binance.positions(), this.binance.openOrders(), this.binance.openAlgoOrders()
    ]);
    return calculateCapacity({ balanceRows, positionRows, protectiveOrders: [...regularOrders, ...algoOrders],
      candidate, limits: this.config });
  }
}

module.exports = { PortfolioAllocator, calculateCapacity, limitsFrom, positionRisk, stopPrice };
