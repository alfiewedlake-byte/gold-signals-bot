const axios = require('axios');
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY;

// Single-symbol price fetch (kept in case anything else still calls it)
async function fetchLatestPrice(symbol) {
  const { data } = await axios.get('https://api.twelvedata.com/price', {
    params: { symbol, apikey: TWELVE_DATA_KEY },
  });
  if (!data.price) throw new Error(`No price returned for ${symbol}`);
  return parseFloat(data.price);
}

// Batch fetch — ONE Twelve Data call for every open pair, instead of
// one call per trade. This is what keeps you under the free-tier rate
// limit once more than one or two trades are open at the same time.
async function fetchLatestPrices(symbols) {
  const uniqueSymbols = [...new Set(symbols)];
  if (uniqueSymbols.length === 0) return {};

  const { data } = await axios.get('https://api.twelvedata.com/price', {
    params: { symbol: uniqueSymbols.join(','), apikey: TWELVE_DATA_KEY },
  });

  const prices = {};

  if (uniqueSymbols.length === 1) {
    const symbol = uniqueSymbols[0];
    if (data.price) prices[symbol] = parseFloat(data.price);
    return prices;
  }

  for (const symbol of uniqueSymbols) {
    const entry = data[symbol];
    if (entry && entry.price) prices[symbol] = parseFloat(entry.price);
  }
  return prices;
}

module.exports = { fetchLatestPrice, fetchLatestPrices };

