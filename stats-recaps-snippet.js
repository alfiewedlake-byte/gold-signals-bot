// Add this to server.js, near your other cron.schedule(...) blocks
// (e.g. right after the weekly news digest section). Reuses your
// existing sendTelegramMessage() function — no new imports needed
// beyond getWinRate.

const { getWinRate } = require('./statsTracker');

function buildStatsMessage(days, label) {
  const stats = getWinRate(days);
  if (stats.total === 0) {
    return `📊 ${label} RECAP\n\nNo closed trades in this period yet.`;
  }
  const rSign = stats.totalR >= 0 ? '+' : '';
  return (
    `📊 ${label} RECAP\n\n` +
    `${stats.wins}W – ${stats.losses}L  (${stats.winRate}% win rate)\n` +
    `Total: ${rSign}${stats.totalR}R\n\n` +
    `⚠️ Past performance is not indicative of future results.`
  );
}

// ── DAILY RECAP ── posts every day at 21:00 UTC (adjust hour to taste)
cron.schedule('0 21 * * *', async () => {
  console.log('Posting daily recap...');
  const text = buildStatsMessage(1, 'DAILY');
  const result = await sendTelegramMessage(text);
  if (!result.ok) console.error('Daily recap send failed:', result);
  else console.log('Daily recap posted.');
});

// ── WEEKLY RECAP ── posts every Sunday at 21:00 UTC
cron.schedule('0 21 * * 0', async () => {
  console.log('Posting weekly recap...');
  const text = buildStatsMessage(7, 'WEEKLY');
  const result = await sendTelegramMessage(text);
  if (!result.ok) console.error('Weekly recap send failed:', result);
  else console.log('Weekly recap posted.');
});

// ── MONTHLY RECAP ── posts on the 1st of each month at 21:00 UTC
cron.schedule('0 21 1 * *', async () => {
  console.log('Posting monthly recap...');
  const text = buildStatsMessage(30, 'MONTHLY');
  const result = await sendTelegramMessage(text);
  if (!result.ok) console.error('Monthly recap send failed:', result);
  else console.log('Monthly recap posted.');
});

// Manual triggers — visit anytime to force-send early for testing
app.get('/send-daily-recap-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildStatsMessage(1, 'DAILY'));
  res.status(200).json(result);
});
app.get('/send-weekly-recap-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildStatsMessage(7, 'WEEKLY'));
  res.status(200).json(result);
});
app.get('/send-monthly-recap-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildStatsMessage(30, 'MONTHLY'));
  res.status(200).json(result);
});
