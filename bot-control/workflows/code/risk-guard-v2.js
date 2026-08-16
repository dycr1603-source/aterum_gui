const crypto = require('crypto');
const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const BASE = 'https://fapi.binance.com';
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
const EXECUTION_ENGINE = process.env.EXECUTION_ENGINE_URL || 'http://position_guard:3091/executions';
const PORTFOLIO_CAPACITY_URL = EXECUTION_ENGINE.replace(/\/executions\/?$/, '/portfolio-capacity');
const EXECUTION_TOKEN = process.env.EXECUTION_ENGINE_TOKEN;
let binanceTimeOffsetMs = 0;

function sign(params = {}) {
  const query = Object.entries({ ...params, timestamp: Date.now() + binanceTimeOffsetMs, recvWindow: 60000 })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return query + '&signature=' + crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function syncBinanceTime() {
  const clock = await this.helpers.httpRequest({ method: 'GET', url: `${BASE}/fapi/v1/time`, json: true, timeout: 10000 });
  if (!Number.isFinite(Number(clock?.serverTime))) throw new Error('Binance time endpoint returned no serverTime');
  binanceTimeOffsetMs = Number(clock.serverTime) - Date.now();
}

async function bget(path, params = {}) {
  return this.helpers.httpRequest({
    method: 'GET',
    url: `${BASE}${path}?${sign(params)}`,
    headers: { 'X-MBX-APIKEY': API_KEY },
    json: true
  });
}

const blockers = [];
let cbStatus = { active: false };
try {
  cbStatus = await this.helpers.httpRequest({ method: 'GET', url: `${DASHBOARD}/cb/status`, json: true });
  if (cbStatus.active) blockers.push({
    code: 'CIRCUIT_BREAKER',
    current: cbStatus.consecutiveSL || 0,
    maximum: 2,
    exceeded: Math.max(0, Number(cbStatus.consecutiveSL || 0) - 2),
    direction: cbStatus.direction || null,
    reason: `Circuit breaker activo por ${cbStatus.expiresIn || 0} minutos`
  });
} catch (error) {
  blockers.push({ code: 'RISK_SERVICE_UNAVAILABLE', reason: error.message });
}

let balance = 0;
let availableBalance = 0;
let dailyPnL = 0;
let dailyPnLPct = 0;
let openPositions = [];
try {
  await syncBinanceTime.call(this);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [balances, positions, income] = await Promise.all([
    bget.call(this, '/fapi/v2/balance'),
    bget.call(this, '/fapi/v2/positionRisk'),
    bget.call(this, '/fapi/v1/income', { startTime: startOfDay.getTime(), endTime: Date.now(), limit: 1000 })
  ]);
  const usdt = balances.find(row => row.asset === 'USDT') || {};
  balance = Number(usdt.balance || 0);
  availableBalance = Number(usdt.availableBalance || 0);
  openPositions = positions.filter(row => Math.abs(Number(row.positionAmt || 0)) > 0).map(row => ({
    symbol: row.symbol,
    direction: Number(row.positionAmt) > 0 ? 'LONG' : 'SHORT',
    quantity: Math.abs(Number(row.positionAmt)),
    entryPrice: Number(row.entryPrice || 0),
    unrealizedPnl: Number(row.unRealizedProfit || 0)
  }));
  dailyPnL = income.filter(row => row.incomeType === 'REALIZED_PNL')
    .reduce((sum, row) => sum + Number(row.income || 0), 0);
  dailyPnLPct = balance > 0 ? dailyPnL / balance * 100 : 0;
} catch (error) {
  blockers.push({ code: 'EXCHANGE_UNAVAILABLE', reason: error.message });
}

let portfolioCapacity = null;
if (!blockers.some(blocker => blocker.code === 'EXCHANGE_UNAVAILABLE')) {
  try {
    if (!EXECUTION_TOKEN) throw new Error('EXECUTION_ENGINE_TOKEN is not configured');
    portfolioCapacity = await this.helpers.httpRequest({ method: 'GET', url: PORTFOLIO_CAPACITY_URL,
      headers: { Authorization: `Bearer ${EXECUTION_TOKEN}` }, json: true, timeout: 30000 });
    if (!portfolioCapacity.allowed) blockers.push({
      code: 'PORTFOLIO_CAPACITY_FULL',
      reason: portfolioCapacity.primaryReason?.code || 'No capital/risk capacity remains',
      current: { riskPct: portfolioCapacity.risk?.openRiskPct,
        marginUsagePct: portfolioCapacity.account?.marginUsagePct,
        exposurePct: portfolioCapacity.exposure?.totalPct },
      maximum: { riskPct: portfolioCapacity.risk?.maximumRiskPct,
        marginUsagePct: portfolioCapacity.limits?.maxMarginUsagePct,
        exposurePct: portfolioCapacity.limits?.maxExposurePct }
    });
  } catch (error) {
    blockers.push({ code: 'PORTFOLIO_CAPACITY_UNAVAILABLE', reason: error.message });
  }
}

let capitalStatus = { halted: false, reasons: [] };
if (!blockers.some(blocker => blocker.code === 'EXCHANGE_UNAVAILABLE')) {
  try {
    capitalStatus = await this.helpers.httpRequest({
      method: 'GET',
      url: `${DASHBOARD}/api/learning/capital-status?balance=${encodeURIComponent(balance)}`,
      json: true
    });
    if (capitalStatus.halted) blockers.push({
      code: 'CAPITAL_PROTECTION',
      reason: (capitalStatus.reasons || []).join('; '),
      current: { dailyPct: capitalStatus.dailyPct, weeklyPct: capitalStatus.weeklyPct, drawdownPct: capitalStatus.drawdownPct },
      maximum: { dailyPct: 15, weeklyPct: 20, drawdownPct: 25 }
    });
  } catch (error) {
    blockers.push({ code: 'CAPITAL_GUARD_UNAVAILABLE', reason: error.message });
  }
}

const primary = blockers[0] || null;
const passRisk = blockers.length === 0;
console.log(`[RiskV2] pass=${passRisk} balance=${balance.toFixed(2)} positions=${openPositions.length} risk=${portfolioCapacity?.risk?.openRiskPct ?? 'N/A'}% remaining=${portfolioCapacity?.risk?.remainingRiskPct ?? 'N/A'}% slots=${portfolioCapacity?.capacity?.dynamicAdditionalPositions ?? 0} primary=${primary?.code || 'NONE'}`);

return [{ json: {
  passRisk,
  balance: +balance.toFixed(2),
  availableBalance: +availableBalance.toFixed(2),
  dailyPnL: +dailyPnL.toFixed(2),
  dailyPnLPct: +dailyPnLPct.toFixed(2),
  openCount: openPositions.length,
  openSymbols: openPositions.map(position => position.symbol),
  openPositions,
  portfolioCapacity,
  haltReason: primary ? `${primary.code}: ${primary.reason || JSON.stringify(primary.current)}` : null,
  riskDecision: {
    allowed: passRisk,
    primaryReason: primary,
    secondaryReasons: blockers.slice(1),
    controlsEvaluated: ['exchange', 'circuit_breaker', 'capital_guard', 'portfolio_risk',
      'margin_capacity', 'portfolio_exposure', 'symbol_exposure', 'direction_exposure']
  },
  learningCapital: capitalStatus,
  cbActive: !!cbStatus.active
} }];
