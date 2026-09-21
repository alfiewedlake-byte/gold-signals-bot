// Gold Signal Bot — TradingView webhook → Telegram + Weekly News Digest
// -----------------------------------------------------------------------
// Receives POST requests from TradingView alerts and forwards them
// as formatted messages to your Telegram channel/group. Also posts
// automatic weekly market news, daily snapshots, win-rate recaps,
// morning/close messages, daytime chit-chat, and engagement prompts.

const express = require('express');
const cron = require('node-cron');
const Parser = require('rss-parser');
const app = express();
const rssParser = new Parser();
app.use(express.json());
app.use(express.text()); // TradingView sometimes sends plain text

const { calculateTargets } = require('./atr');
const { addTrade } = require('./tradeStore');
const { postEntrySignal } = require('./telegram');
const { startPolling } = require('./poller');
const { getWinRate } = require('./statsTracker');

// ── CONFIG ──────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || 'PUT_YOUR_CHAT_ID_HERE';
const WEBHOOK_SECRET     = process.env.WEBHOOK_SECRET     || 'choose-a-secret-here';
// ─────────────────────────────────────────────────────────

async function sendTelegramMessage(text) {
  const tgRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
      }),
    }
  );
  return tgRes.json();
}

// ── TRADINGVIEW WEBHOOK → TELEGRAM (real, live route) ────────
app.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  let raw = req.body;
  let text;

  if (typeof raw === 'string') {
    text = raw;
  } else if (typeof raw === 'object') {
    const { symbol, direction, entry, interval } = raw;
    try {
      const targets = await calculateTargets({
        symbol,
        interval,
        entry: parseFloat(entry),
        direction,
      });
      await postEntrySignal({ symbol, direction, entry: parseFloat(entry), interval, ...targets });
      const tradeId = `${symbol}-${Date.now()}`;
      addTrade(tradeId, { symbol, interval, ...targets });
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Target calculation failed:', err.message);
      return res.status(500).send('Calculation error — check Railway logs');
    }
  } else {
    text = 'New alert triggered (no message body).';
  }

  try {
    const data = await sendTelegramMessage(text);
    if (!data.ok) {
      console.error('Telegram error:', data);
      return res.status(500).send('Telegram send failed');
    }
    console.log('Sent to Telegram:', text.split('\n')[0]);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Server error');
  }
});

// ── TEST ROUTE (safe, separate from the real webhook above) ────
app.post('/webhook-test/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  const { symbol, direction, entry, interval } = req.body;

  try {
    const targets = await calculateTargets({
      symbol,
      interval,
      entry: parseFloat(entry),
      direction,
    });

    await postEntrySignal({ symbol, direction, entry: parseFloat(entry), interval, ...targets });

    const tradeId = `TEST-${symbol}-${Date.now()}`;
    addTrade(tradeId, { symbol, interval, ...targets });

    console.log('Test webhook processed OK:', { symbol, direction, entry, ...targets });
    res.status(200).send('OK');
  } catch (err) {
    console.error('Test webhook failed:', err.message);
    res.status(500).send('Test webhook error — check Railway logs');
  }
});

// ── WEEKLY NEWS DIGEST ───────────────────────────────────────
const NEWS_FEEDS = [
  { name: 'Investing.com Commodities', url: 'https://www.investing.com/rss/news_25.rss' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
];

const GOLD_KEYWORDS = [
  'gold', 'xau', 'silver', 'precious metal', 'bullion', 'fed', 'federal reserve',
  'interest rate', 'inflation', 'dollar', 'usd', 'treasury', 'yield', 'safe-haven',
  'safe haven', 'central bank', 'forex', 'currency', 'commodities', 'commodity',
];

function isRelevant(title) {
  const lower = title.toLowerCase();
  return GOLD_KEYWORDS.some(kw => lower.includes(kw));
}

async function buildWeeklyDigest() {
  let headlines = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, 20).map(item => ({
        title: item.title,
        link: item.link,
      }));
      headlines = headlines.concat(items);
    } catch (err) {
      console.error(`Failed to fetch ${feed.name}:`, err.message);
    }
  }

  if (headlines.length === 0) return null;

  let relevant = headlines.filter(h => isRelevant(h.title));

  if (relevant.length < 3) {
    const extras = headlines.filter(h => !relevant.includes(h)).slice(0, 3 - relevant.length);
    relevant = relevant.concat(extras);
  }

  if (relevant.length === 0) return null;
  relevant = relevant.slice(0, 8);

  let text = `📰 WEEKLY MARKET DIGEST\n\n`;
  relevant.forEach((h, i) => {
    text += `${i + 1}. ${h.title}\n${h.link}\n\n`;
  });
  text += `⚠️ News summaries only — not financial advice.`;
  return text;
}

// ── DAILY MARKET OPEN SNAPSHOT ──────────────────────────────
let previousClosePrice = null;

async function buildDailySnapshot() {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU');
    const data = await res.json();
    const price = data.price;

    let changeLine = '';
    if (previousClosePrice) {
      const change = price - previousClosePrice;
      const pct = (change / previousClosePrice) * 100;
      const arrow = change >= 0 ? '🟢' : '🔴';
      changeLine = `${arrow} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${pct.toFixed(2)}%) vs yesterday\n`;
    }
    previousClosePrice = price;

    const text =
      `🌅 GOLD MARKET OPEN\n\n` +
      `XAUUSD: $${price.toFixed(2)}\n` +
      changeLine +
      `\n⚠️ Price snapshot only — not financial advice.`;
    return text;
  } catch (err) {
    console.error('Failed to fetch gold price:', err.message);
    return null;
  }
}

cron.schedule('0 7 * * 1-5', async () => {
  console.log('Running daily market snapshot...');
  const snapshot = await buildDailySnapshot();
  if (snapshot) {
    const result = await sendTelegramMessage(snapshot);
    if (!result.ok) console.error('Daily snapshot send failed:', result);
    else console.log('Daily snapshot posted successfully.');
  }
});

app.get('/send-snapshot-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  const snapshot = await buildDailySnapshot();
  if (snapshot) {
    const result = await sendTelegramMessage(snapshot);
    return res.status(200).json(result);
  }
  res.status(500).send('Could not fetch gold price right now');
});

cron.schedule('0 7 * * 1', async () => {
  console.log('Running weekly news digest...');
  const digest = await buildWeeklyDigest();
  if (digest) {
    const result = await sendTelegramMessage(digest);
    if (!result.ok) console.error('Weekly digest send failed:', result);
    else console.log('Weekly digest posted successfully.');
  } else {
    console.log('No headlines fetched — skipping this week.');
  }
});

app.get('/send-digest-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  const digest = await buildWeeklyDigest();
  if (digest) {
    const result = await sendTelegramMessage(digest);
    return res.status(200).json(result);
  }
  res.status(500).send('Could not fetch any news right now');
});

// ── WIN-RATE RECAPS (daily / weekly / monthly) ──────────────
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

cron.schedule('0 21 * * *', async () => {
  console.log('Posting daily recap...');
  const result = await sendTelegramMessage(buildStatsMessage(1, 'DAILY'));
  if (!result.ok) console.error('Daily recap send failed:', result);
  else console.log('Daily recap posted.');
});

cron.schedule('0 21 * * 0', async () => {
  console.log('Posting weekly recap...');
  const result = await sendTelegramMessage(buildStatsMessage(7, 'WEEKLY'));
  if (!result.ok) console.error('Weekly recap send failed:', result);
  else console.log('Weekly recap posted.');
});

cron.schedule('0 21 1 * *', async () => {
  console.log('Posting monthly recap...');
  const result = await sendTelegramMessage(buildStatsMessage(30, 'MONTHLY'));
  if (!result.ok) console.error('Monthly recap send failed:', result);
  else console.log('Monthly recap posted.');
});

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

// ── ENGAGEMENT PROMPT (profit check-in) ─────────────────────
const ENGAGEMENT_PROMPTS = [
  "💰 How much are you up today? Drop your P&L below 👇",
  "📸 Show us your profits from today's signals — screenshot below 👇",
  "🎯 Who caught today's move? Let us know how it went for you.",
  "🔥 Which signal today was your best one? Reply and let us know.",
  "📊 Quick check-in — up, down, or flat today? Be honest 👇",
];

function buildEngagementPrompt() {
  return ENGAGEMENT_PROMPTS[Math.floor(Math.random() * ENGAGEMENT_PROMPTS.length)];
}

cron.schedule('0 19 * * *', async () => {
  console.log('Posting engagement prompt...');
  const result = await sendTelegramMessage(buildEngagementPrompt());
  if (!result.ok) console.error('Engagement prompt send failed:', result);
  else console.log('Engagement prompt posted.');
});

app.get('/send-engagement-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildEngagementPrompt());
  res.status(200).json(result);
});

// ── MORNING OPEN MESSAGE ─────────────────────────────────────
// Posts at 07:15 UTC (just after the price snapshot), weekdays only.
// Occasionally (about 1 in 3 mornings) includes a soft CTA about the
// Academy — no dollar-figure promises, just pointing at the system.

const MORNING_MESSAGES = [
  "🌅 Markets are opening — let's get to work.\nToday's setups are coming. Stay locked in 👀",
  "☀️ Good morning traders. New session, new opportunities.\nKeep your eyes on the channel today.",
  "🚀 Here we go — another session, another shot at clean setups.\nLet's make it count.",
  "📈 Session's live. Let's see what the market gives us today.",
  "🔔 Markets open — stay sharp, stay patient, let the setups come to you.",
];

const CTA_LINE =
  "\n\n📚 Want the full system behind these signals — entries, risk management, everything? " +
  "Check the Academy link in the channel description.";

function buildMorningMessage() {
  const base = MORNING_MESSAGES[Math.floor(Math.random() * MORNING_MESSAGES.length)];
  const includeCTA = Math.random() < 1 / 3;
  return includeCTA ? base + CTA_LINE : base;
}

cron.schedule('15 7 * * 1-5', async () => {
  console.log('Posting morning open message...');
  const result = await sendTelegramMessage(buildMorningMessage());
  if (!result.ok) console.error('Morning message send failed:', result);
  else console.log('Morning message posted.');
});

app.get('/send-morning-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildMorningMessage());
  res.status(200).json(result);
});

// ── MARKET CLOSE MESSAGE ─────────────────────────────────────
// Posts at 20:00 UTC, weekdays — ahead of the stats recap at 21:00
// so it reads as "session's over" before the numbers land.

const CLOSE_MESSAGES = [
  "🔔 That's a wrap for today's session.\nRecap coming shortly — see how we did.",
  "🌆 Session's closing out. Solid day in the markets either way.\nStats up soon.",
  "📉📈 Another session in the books. Numbers coming your way shortly.",
  "🏁 That's today done. Recap dropping soon — stick around.",
  "🌙 Markets winding down for the day. Let's see the damage — recap incoming.",
];

function buildCloseMessage() {
  return CLOSE_MESSAGES[Math.floor(Math.random() * CLOSE_MESSAGES.length)];
}

cron.schedule('0 20 * * 1-5', async () => {
  console.log('Posting market close message...');
  const result = await sendTelegramMessage(buildCloseMessage());
  if (!result.ok) console.error('Close message send failed:', result);
  else console.log('Close message posted.');
});

app.get('/send-close-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildCloseMessage());
  res.status(200).json(result);
});

// ── DAYTIME CHIT-CHAT ─────────────────────────────────────────
// Two casual, low-key posts a day (late morning + mid-afternoon UTC)
// to keep the channel feeling alive between signals — trading
// psychology, session reminders, light questions. Never a hard sell.

const CHITCHAT_MESSAGES = [
  "🧠 Reminder: one loss doesn't undo a good process. Trust the plan, not the last trade.",
  "☕ How's everyone's session going so far? Drop a 🔥 if you're in the green.",
  "🕐 London/NY overlap coming up — this is usually where the real moves happen. Stay ready.",
  "📓 Quick one: are you journaling your trades? It's the single biggest habit that separates consistent traders from the rest.",
  "🎯 Patience beats prediction. Wait for the setup, don't force one.",
  "💬 What pair are you watching most closely today?",
  "⚡ Volatility's picking up — good time to double check your risk per trade.",
  "🔍 Not every session needs a trade. Sometimes the best move is no move.",
];

function buildChitChatMessage() {
  return CHITCHAT_MESSAGES[Math.floor(Math.random() * CHITCHAT_MESSAGES.length)];
}

cron.schedule('0 11 * * *', async () => {
  console.log('Posting chit-chat message...');
  const result = await sendTelegramMessage(buildChitChatMessage());
  if (!result.ok) console.error('Chit-chat send failed:', result);
  else console.log('Chit-chat message posted.');
});

cron.schedule('30 15 * * *', async () => {
  console.log('Posting chit-chat message...');
  const result = await sendTelegramMessage(buildChitChatMessage());
  if (!result.ok) console.error('Chit-chat send failed:', result);
  else console.log('Chit-chat message posted.');
});

app.get('/send-chitchat-now/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(403).send('Forbidden');
  const result = await sendTelegramMessage(buildChitChatMessage());
  res.status(200).json(result);
});

app.get('/', (req, res) => res.send('Gold Signal Bot is running ✅'));

startPolling();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
