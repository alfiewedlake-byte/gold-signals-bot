const axios = require('axios');

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY;

async function fetchLatestPrice(symbol) {
  const { data } = await axios.get('https://api.twelvedata.com/price', {
    params: { symbol, apikey: TWELVE_DATA_KEY },
  });
  if (!data.price) throw new Error(`No price returned for ${symbol}`);
  return parseFloat(data.price);
}

module.exports = { fetchLatestPrice };
