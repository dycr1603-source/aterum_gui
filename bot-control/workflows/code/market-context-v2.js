const d = $input.first().json;
const DASHBOARD = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';

function ema(values, period) {
  const k = 2 / (period + 1);
  let current = values[0];
  for (let index = 1; index < values.length; index += 1) current = values[index] * k + current * (1 - k);
  return current;
}

let fearGreed = { value: 50, classification: 'Neutral' };
try {
  const response = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.alternative.me/fng/?limit=1', json: true });
  fearGreed = {
    value: Number(response.data?.[0]?.value || 50),
    classification: response.data?.[0]?.value_classification || 'Neutral'
  };
} catch (error) {
  console.log('[MarketV2] Fear & Greed unavailable:', error.message);
}

const [btcRows, ethRows] = await Promise.all([
  this.helpers.httpRequest({ method: 'GET', url: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=50', json: true }),
  this.helpers.httpRequest({ method: 'GET', url: 'https://fapi.binance.com/fapi/v1/klines?symbol=ETHUSDT&interval=4h&limit=50', json: true })
]);
const btc = btcRows.map(row => Number(row[4]));
const eth = ethRows.map(row => Number(row[4]));
const btcBullish = ema(btc, 8) > ema(btc, 21);
const ethBullish = ema(eth, 8) > ema(eth, 21);
const btcChange = (btc[btc.length - 1] - btc[btc.length - 13]) / btc[btc.length - 13] * 100;
const ethChange = (eth[eth.length - 1] - eth[eth.length - 13]) / eth[eth.length - 13] * 100;

let marketBias = 'NEUTRAL';
let longAdjustment = 0;
let shortAdjustment = 0;
if (btcBullish && ethBullish) {
  marketBias = 'BULLISH';
  longAdjustment = 6;
  shortAdjustment = -6;
} else if (!btcBullish && !ethBullish) {
  marketBias = 'BEARISH';
  longAdjustment = -6;
  shortAdjustment = 6;
}
if (fearGreed.value < 15) {
  longAdjustment -= 2;
  shortAdjustment += 2;
} else if (fearGreed.value > 85) {
  longAdjustment += 2;
  shortAdjustment -= 2;
}
longAdjustment = Math.max(-8, Math.min(8, longAdjustment));
shortAdjustment = Math.max(-8, Math.min(8, shortAdjustment));

const sizeMultiplier = fearGreed.value < 15 ? 0.6 : fearGreed.value <= 25 ? 0.75 : fearGreed.value >= 85 ? 0.7 : 1;
let intelligenceSignal = { signal: 'NEUTRAL', confidence: 'baja', scoreAdjustment: { ifLong: 0, ifShort: 0 }, alerts: [] };
try {
  intelligenceSignal = await this.helpers.httpRequest({ method: 'GET', url: `${DASHBOARD}/intelligence/signal`, json: true });
} catch (error) {
  console.log('[MarketV2] Intelligence unavailable:', error.message);
}

const reason = `BTC 4H ${btcBullish ? 'alcista' : 'bajista'} (${btcChange.toFixed(2)}%), ETH 4H ${ethBullish ? 'alcista' : 'bajista'} (${ethChange.toFixed(2)}%), F&G ${fearGreed.value}`;
console.log(`[MarketV2] bias=${marketBias} long=${longAdjustment} short=${shortAdjustment} size=${sizeMultiplier}`);

return [{ json: {
  ...d,
  marketContext: {
    market_bias: marketBias,
    confidence: btcBullish === ethBullish ? 75 : 45,
    long_ok: true,
    short_ok: true,
    size_multiplier: sizeMultiplier,
    scoreAdjustment: { long: longAdjustment, short: shortAdjustment },
    hardBlockers: [],
    reason,
    fearGreed,
    btcChange: +btcChange.toFixed(3),
    ethChange: +ethChange.toFixed(3),
    btcBullish,
    ethBullish,
    btcPrice: +btc[btc.length - 1].toFixed(2),
    intelligenceSignal
  }
} }];
