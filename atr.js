const axios = require('axios');

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY;

// Map TradingView's {{interval}} values to Twelve Data interval strings
const INTERVAL_MAP = {
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '1h',
  '240': '4h',
  '1D': '1day',
};

async function fetchCandles(symbol, tvInterval, count = 30) {
  const interval = INTERVAL_MAP[tvInterval] || '1h';
  const { data } = await axios.get('https://api.twelvedata.com/time_series', {
    params: { symbol, interval, outputsize: count, apikey: TWELVE_DATA_KEY },
  });
  if (!data.values) {
    throw new Error(`Twelve Data error for ${symbol}/${interval}: ${data.message || 'no data returned'}`);
  }
  // Twelve Data returns newest-first — reverse to chronological order
  return data.values.reverse().map((c) => ({
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
  }));
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) {
    throw new Error('Not enough candles to calculate ATR');
  }
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    trueRanges.push(
      Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      )
    );
  }
  const lastN = trueRanges.slice(-period);
  return lastN.reduce((sum, tr) => sum + tr, 0) / lastN.length;
}

// entry, direction ('buy' | 'sell'), interval and symbol come from the TradingView alert payload
async function calculateTargets({ symbol, interval, entry, direction }) {
  const candles = await fetchCandles(symbol, interval, 30);
  const atr = calculateATR(candles, 14);
  const riskDistance = 3.5 * atr; // your rule: SL is always 3.5x ATR

  const isBuy = direction === 'buy';
  const sl = isBuy ? entry - riskDistance : entry + riskDistance;
  const r = Math.abs(entry - sl);
  const sign = isBuy ? 1 : -1;

  return {
    entry,
    sl,
    r,
    atr,
    direction,
    pt1: entry + sign * 1 * r,
    pt2: entry + sign * 2 * r,
    pt3: entry + sign * 3 * r,
    pt4: entry + sign * 4 * r,
  };
}

module.exports = { fetchCandles, calculateATR, calculateTargets };

