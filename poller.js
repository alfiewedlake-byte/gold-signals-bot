const { getOpenTrades, updateTrade } = require('./tradeStore');
const { fetchLatestPrice } = require('./price');
const { postTPHit, postSLHit, postBreakeven, postBreakevenClose } = require('./telegram');
const { recordOutcome } = require('./statsTracker');

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
    let justClosed = false;

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
          recordOutcome({ symbol: trade.symbol, direction, outcome: 'win', rAchieved: 4 });
          justClosed = true;
        }
      }
    }

    if (justClosed) continue; // already closed via TP4 this cycle — skip the checks below

    // Once SL has moved to breakeven, a return to entry closes the trade
    // out as a win (profit already banked up to the last TP hit) rather
    // than a loss — this must be checked before the original-SL check.
    if (beTriggered) {
      const beHit = direction === 'buy' ? price <= entry : price >= entry;
      if (beHit) {
        const lastHitKey = ['pt4', 'pt3', 'pt2', 'pt1'].find(k => hit[k]);
        const rAchieved = lastHitKey ? parseInt(lastHitKey.slice(2)) : 0;
        await postBreakevenClose(trade.symbol, rAchieved);
        updateTrade(id, { closed: true });
        recordOutcome({ symbol: trade.symbol, direction, outcome: 'win', rAchieved });
        continue;
      }
    }

    // Original SL only ever fires before TP1 — after TP1 the effective
    // stop is breakeven, handled above, so this only ever fires as a
    // genuine loss on a trade that never reached TP1.
    const stopHit = direction === 'buy' ? price <= sl : price >= sl;
    if (stopHit && !hit.pt1) {
      await postSLHit(trade.symbol, sl);
      updateTrade(id, { closed: true });
      recordOutcome({ symbol: trade.symbol, direction, outcome: 'loss', rAchieved: -1 });
    }
  }
}

function startPolling() {
  setInterval(checkTrades, POLL_INTERVAL_MS);
}

module.exports = { startPolling, checkTrades };
