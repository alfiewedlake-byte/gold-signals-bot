const fs = require('fs');
const path = require('path');

// Separate from open-trades.json — this is a permanent append-only log
// of closed trades, used to compute win rate over time.
const STATS_PATH = path.join(__dirname, 'trade-stats.json');

function loadStats() {
  if (!fs.existsSync(STATS_PATH)) return [];
  return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
}

function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
}

// Call this once, when a trade closes (TP4 hit, or SL hit before TP1).
// outcome: 'win' | 'loss'
// rAchieved: how many R the trade made (e.g. 4 if TP4 hit, -1 if SL hit before TP1)
function recordOutcome({ symbol, direction, outcome, rAchieved, closedAt }) {
  const stats = loadStats();
  stats.push({ symbol, direction, outcome, rAchieved, closedAt: closedAt || Date.now() });
  saveStats(stats);
}

// period: number of days to look back, or 'all' for everything
function getWinRate(periodDays = 7) {
  const stats = loadStats();
  const cutoff = periodDays === 'all' ? 0 : Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const recent = stats.filter(t => t.closedAt >= cutoff);

  const wins = recent.filter(t => t.outcome === 'win').length;
  const losses = recent.filter(t => t.outcome === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const totalR = recent.reduce((sum, t) => sum + (t.rAchieved || 0), 0);

  return { wins, losses, total, winRate, totalR: Math.round(totalR * 10) / 10 };
}

module.exports = { recordOutcome, getWinRate, loadStats };
