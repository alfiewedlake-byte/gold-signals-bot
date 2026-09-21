const fs = require('fs');
const path = require('path');

// NOTE: Railway's filesystem is wiped on redeploy. This JSON-file store is
// fine to get running, but open trades will be lost on redeploy or restart.
// If that matters (mid-trade during a deploy), swap this for Railway's
// Postgres add-on later — addTrade/updateTrade/getOpenTrades are the only
// three functions the rest of the bot touches, so the swap is contained here.

const STORE_PATH = path.join(__dirname, 'open-trades.json');

function loadTrades() {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function saveTrades(trades) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(trades, null, 2));
}

function addTrade(id, trade) {
  const trades = loadTrades();
  trades[id] = {
    ...trade,
    hit: { pt1: false, pt2: false, pt3: false, pt4: false },
    beTriggered: false,
    closed: false,
    createdAt: Date.now(),
  };
  saveTrades(trades);
}

function updateTrade(id, updates) {
  const trades = loadTrades();
  if (!trades[id]) return;
  trades[id] = { ...trades[id], ...updates };
  saveTrades(trades);
}

function getOpenTrades() {
  const trades = loadTrades();
  return Object.entries(trades).filter(([, t]) => !t.closed);
}

module.exports = { addTrade, updateTrade, getOpenTrades, loadTrades, saveTrades };
