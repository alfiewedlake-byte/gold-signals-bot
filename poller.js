const { getOpenTrades, updateTrade } = require('./tradeStore');
const { fetchLatestPrice } = require('./price');
const { postTPHit, postSLHit, postBreakeven } = require('./telegram');

const POLL_INTERVAL_MS = 20000;

function crossed(direction, price, level) {
  return direction === 'buy' ? price >= level : price <= level;
}

async function checkTrades() {
  const openTrades = getOpenTrades();

  for (const [id, trade] of openTrades) {
    let price;
    try {
      price = await fetchLatestPrice(trade.symbol);
    } catch (err) {
      console.error(`Price fetch failed for ${trade.symbol}:`, err.message);
      continue; // skip this trade this cycle, try again next poll
    }

    const { direction, sl, entry, pt1, pt2, pt3, pt4, hit, beTriggered } = trade;

    const levels = [['pt1', pt1], ['pt2', pt2], ['pt3', pt3], ['pt4', pt4]];
    for (const [key, level] of levels) {
      if (!hit[key] && crossed(direction, price, level)) {
        hit[key] = true;
        await postTPHit(trade.symbol, key.slice(2), level);
        updateTrade(id, { hit });

        if (key === 'pt1' && !beTriggered) {
          await postBreakeven(trade.symbol, entry);
          updateTrade(id, { beTriggered: true });
        }
        if (key === 'pt4') {
          updateTrade(id, { closed: true });
        }
      }
    }

    // Original SL only ever fires before TP1 — after TP1 the effective
    // stop is breakeven, and a breakeven touch already posted its own
    // message above, so it should never also fire the red SL graphic.
    const stopHit = direction === 'buy' ? price <= sl : price >= sl;
    if (stopHit && !hit.pt1) {
      await postSLHit(trade.symbol, sl);
      updateTrade(id, { closed: true });
    }
  }
}

function startPolling() {
  setInterval(checkTrades, POLL_INTERVAL_MS);
}

module.exports = { startPolling, checkTrades };
