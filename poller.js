const { getOpenTrades, updateTrade } = require('./tradeStore');
const { fetchLatestPrices } = require('./price');
const { postTPHit, postSLHit, postBreakeven, postBreakevenClose, notifyOwner } = require('./telegram');
const { recordOutcome } = require('./statsTracker');

const POLL_INTERVAL_MS = 20000;
const ERROR_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000; // don't spam you — max one alert per 5 min
let lastErrorNotifyAt = 0;

function crossed(direction, price, level) {
  return direction === 'buy' ? price >= level : price <= level;
}

async function maybeNotify(text) {
  const now = Date.now();
  if (now - lastErrorNotifyAt > ERROR_NOTIFY_COOLDOWN_MS) {
    lastErrorNotifyAt = now;
    await notifyOwner(text).catch(() => {}); // never let a failed alert itself crash anything
  }
}

async function processTrade(id, trade, price) {
  const { direction, sl, entry, pt1, pt2, pt3, pt4, hit, beTriggered } = trade;
  let justClosed = false;
  const levels = [['pt1', pt1], ['pt2', pt2], ['pt3', pt3], ['pt4', pt4]];

  for (const [key, level] of levels) {
    if (!hit[key] && crossed(direction, price, level)) {
      await postTPHit(trade.symbol, key.slice(2), level);
      hit[key] = true;
      updateTrade(id, { hit });
      if (key === 'pt1' && !beTriggered) {
        await postBreakeven(trade.symbol, entry);
        updateTrade(id, { beTriggered: true });
      }
      if (key === 'pt4') {
        updateTrade(id, { closed: true });
        recordOutcome({ symbol: trade.symbol, direction, outcome: 'win', rAchieved: 4 });
        justClosed = true;
      }
    }
  }
  if (justClosed) return;

  if (beTriggered) {
    const beHit = direction === 'buy' ? price <= entry : price >= entry;
    if (beHit) {
      const lastHitKey = ['pt4', 'pt3', 'pt2', 'pt1'].find(k => hit[k]);
      const rAchieved = lastHitKey ? parseInt(lastHitKey.slice(2)) : 0;
      await postBreakevenClose(trade.symbol, rAchieved);
      updateTrade(id, { closed: true });
      recordOutcome({ symbol: trade.symbol, direction, outcome: 'win', rAchieved });
      return;
    }
  }

  const stopHit = direction === 'buy' ? price <= sl : price >= sl;
  if (stopHit && !hit.pt1) {
    await postSLHit(trade.symbol, sl);
    updateTrade(id, { closed: true });
    recordOutcome({ symbol: trade.symbol, direction, outcome: 'loss', rAchieved: -1 });
  }
}

async function checkTrades() {
  const openTrades = getOpenTrades();
  if (openTrades.length === 0) return;

  const symbols = openTrades.map(([, trade]) => trade.symbol);

  let prices;
  try {
    prices = await fetchLatestPrices(symbols);
  } catch (err) {
    console.error('Batch price fetch failed:', err.message);
    await maybeNotify(`⚠️ Price polling is failing: ${err.message}\nOpen trades aren't being checked right now.`);
    return;
  }

  for (const [id, trade] of openTrades) {
    const price = prices[trade.symbol];
    if (price === undefined) {
      console.error(`No price returned for ${trade.symbol} (trade ${id})`);
      await maybeNotify(`⚠️ No price data for ${trade.symbol} — that pair isn't being tracked right now.`);
      continue;
    }

    // Each trade is isolated — a failure on one (e.g. a Telegram send
    // error) never stops the others from being checked, and never
    // crashes the app. Since the store only updates on success, a
    // failed send just retries automatically on the next 20s cycle.
    try {
      await processTrade(id, trade, price);
    } catch (err) {
      console.error(`Failed processing trade ${id} (${trade.symbol}):`, err.message);
      await maybeNotify(`⚠️ Failed to post an update for ${trade.symbol}: ${err.message}\nWill retry automatically.`);
    }
  }
}

function startPolling() {
  setInterval(() => {
    checkTrades().catch(err => {
      // Final safety net — should never actually trigger given the
      // try/catches above, but guarantees checkTrades() can never take
      // the whole process down.
      console.error('Unexpected error in checkTrades:', err.message);
    });
  }, POLL_INTERVAL_MS);
}

module.exports = { startPolling, checkTrades };
