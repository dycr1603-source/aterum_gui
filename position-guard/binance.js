'use strict';

const crypto = require('crypto');

class BinanceFutures {
  constructor(config) {
    this.key = config.apiKey;
    this.secret = config.apiSecret;
    this.base = 'https://fapi.binance.com';
    this.timeOffsetMs = 0;
    this.timeOffsetExpiresAt = 0;
    this.timeSyncPromise = null;
  }

  async syncTime() {
    if (Date.now() < this.timeOffsetExpiresAt) return;
    if (!this.timeSyncPromise) {
      this.timeSyncPromise = (async () => {
        const response = await fetch(`${this.base}/fapi/v1/time`, { signal: AbortSignal.timeout(10000) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Number.isFinite(Number(body?.serverTime))) {
          throw new Error(body?.msg || `Binance time HTTP ${response.status}`);
        }
        this.timeOffsetMs = Number(body.serverTime) - Date.now();
        this.timeOffsetExpiresAt = Date.now() + 60_000;
      })().finally(() => { this.timeSyncPromise = null; });
    }
    return this.timeSyncPromise;
  }

  async request(method, path, params = {}, signed = true, retryOnClockError = true) {
    if (signed) await this.syncTime();
    const values = signed ? { ...params, timestamp: Date.now() + this.timeOffsetMs, recvWindow: 5000 } : params;
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    if (signed) query.set('signature', crypto.createHmac('sha256', this.secret).update(query.toString()).digest('hex'));
    const url = `${this.base}${path}${query.size ? `?${query}` : ''}`;
    const response = await fetch(url, {
      method,
      headers: signed ? { 'X-MBX-APIKEY': this.key } : {},
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.code < 0) {
      if (signed && retryOnClockError && body?.code === -1021) {
        this.timeOffsetExpiresAt = 0;
        await this.syncTime();
        return this.request(method, path, params, true, false);
      }
      const error = new Error(body?.msg || `Binance HTTP ${response.status}`);
      error.code = body?.code || response.status;
      error.body = body;
      error.httpMethod = method;
      error.url = url;
      error.statusCode = response.status;
      error.responseBody = body;
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      error.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 0;
      throw error;
    }
    return body;
  }

  ping() { return this.request('GET', '/fapi/v1/ping', {}, false); }
  exchangeInfo() { return this.request('GET', '/fapi/v1/exchangeInfo', {}, false); }
  tickerPrice(symbol) { return this.request('GET', '/fapi/v1/ticker/price', { symbol }, false); }
  balance() { return this.request('GET', '/fapi/v2/balance'); }
  positionMode() { return this.request('GET', '/fapi/v1/positionSide/dual'); }
  positions(symbol) { return this.request('GET', '/fapi/v2/positionRisk', { symbol }); }
  openOrders(symbol) { return this.request('GET', '/fapi/v1/openOrders', { symbol }); }
  openAlgoOrders(symbol) { return this.request('GET', '/fapi/v1/openAlgoOrders', { symbol }); }
  allOrders(symbol, startTime) { return this.request('GET', '/fapi/v1/allOrders', { symbol, startTime, limit: 1000 }); }
  allAlgoOrders(symbol, startTime) { return this.request('GET', '/fapi/v1/allAlgoOrders', { symbol, startTime, limit: 1000 }); }
  userTrades(symbol, startTime) { return this.request('GET', '/fapi/v1/userTrades', { symbol, startTime, limit: 1000 }); }
  queryOrder(symbol, origClientOrderId) {
    return this.request('GET', '/fapi/v1/order', { symbol, origClientOrderId });
  }
  createOrder(params) { return this.request('POST', '/fapi/v1/order', params); }
  cancelOrder(symbol, orderId) { return this.request('DELETE', '/fapi/v1/order', { symbol, orderId }); }
  createAlgoOrder(params) { return this.request('POST', '/fapi/v1/algoOrder', params); }
  queryAlgoOrder(params) { return this.request('GET', '/fapi/v1/algoOrder', params); }
  cancelAlgoOrder(algoId) { return this.request('DELETE', '/fapi/v1/algoOrder', { algoId }); }
  changePositionMode(dualSidePosition = true) {
    return this.request('POST', '/fapi/v1/positionSide/dual', { dualSidePosition: String(dualSidePosition) });
  }
  changeMarginType(symbol, marginType = 'ISOLATED') {
    return this.request('POST', '/fapi/v1/marginType', { symbol, marginType });
  }
  changeLeverage(symbol, leverage) {
    return this.request('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

}

function normalizePosition(row) {
  const amount = Number(row.positionAmt || 0);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const positionSide = row.positionSide && row.positionSide !== 'BOTH'
    ? row.positionSide
    : amount > 0 ? 'LONG' : 'SHORT';
  return {
    symbol: row.symbol,
    side: positionSide,
    positionSide,
    qty: Math.abs(amount),
    entryPrice: Number(row.entryPrice || 0),
    markPrice: Number(row.markPrice || 0),
    leverage: Number(row.leverage || 1)
  };
}

function isStop(order, position) {
  const type = String(order.orderType || order.origType || order.type || '').toUpperCase();
  const status = String(order.algoStatus || order.status || '').toUpperCase();
  const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
  return ['STOP', 'STOP_MARKET', 'TRAILING_STOP_MARKET'].includes(type)
    && ['NEW', 'PARTIALLY_FILLED'].includes(status)
    && order.symbol === position.symbol && order.side === closeSide
    && (!order.positionSide || order.positionSide === position.positionSide || order.positionSide === 'BOTH');
}

function isTakeProfit(order, position) {
  const type = String(order.orderType || order.origType || order.type || '').toUpperCase();
  const status = String(order.algoStatus || order.status || '').toUpperCase();
  const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
  return ['LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET'].includes(type)
    && ['NEW', 'PARTIALLY_FILLED'].includes(status)
    && order.symbol === position.symbol && order.side === closeSide
    && (!order.positionSide || order.positionSide === position.positionSide || order.positionSide === 'BOTH');
}

function triggerPrice(order) { return Number(order.triggerPrice || order.stopPrice || order.activatePrice || 0); }

function matchesPosition(row, symbol, side) {
  const position = normalizePosition(row);
  return position && position.symbol === symbol && position.side === side ? position : null;
}

module.exports = { BinanceFutures, normalizePosition, matchesPosition, isStop, isTakeProfit, triggerPrice };
