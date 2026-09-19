// Gold Signal Bot — TradingView webhook → Telegram + Weekly News Digest
// -----------------------------------------------------------------------
// Receives POST requests from TradingView alerts and forwards them
// as formatted messages to your Telegram channel/group. Also posts
// an automatic weekly market news digest every Monday.

const express = require('express');
const cron = require('node-cron');
const Parser = require('rss-parser');
const app = express();
const rssParser = new Parser();
app.use(express.json());
app.use(express.text()); // TradingView sometimes sends plain text

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

// ── TRADINGVIEW WEBHOOK → TELEGRAM ──────────────────────────
app.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  let raw = req.body;
  let text;

  if (typeof raw === 'string') {
    text = raw;
  } else if (typeof raw === 'object') {
    const { pair, direction, entry, sl, tp1, tp2, tp3, tp4, note } = raw;
    let tpLines = '';
    if (tp1) tpLines += `TP1: ${tp1}\n`;
    if (tp2) tpLines += `TP2: ${tp2}\n`;
    if (tp3) tpLines += `TP3: ${tp3}\n`;
    if (tp4) tpLines += `TP4: ${tp4}\n`;
    text =
      `${pair || 'XAUUSD'} Gold ${direction === 'SELL' ? 'Sell' : 'Buy'} 🚨\n\n` +
      `Entry: (Now) ${entry || 'N/A'}\n` +
      `Stop Loss: ${sl || 'N/A'}\n\n` +
      tpLines +
      (note ? `\n${note}\n` : '') +
      `\n⚠️ Not financial advice — educational purposes only.`;
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

// ── WEEKLY NEWS DIGEST ───────────────────────────────────────
// Runs automatically every Monday at 07:00 UTC.
// Pulls top gold/market headlines from free RSS feeds and posts
// a formatted digest to your Telegram channel — no manual work needed.

const NEWS_FEEDS = [
  { name: 'Investing.com Commodities', url: 'https://www.investing.com/rss/news_25.rss' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
];

async function buildWeeklyDigest() {
  let headlines = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, 4).map(item => ({
        title: item.title,
        link: item.link,
      }));
      headlines = headlines.concat(items);
    } catch (err) {
      console.error(`Failed to fetch ${feed.name}:`, err.message);
    }
  }

  if (headlines.length === 0) return null;
  headlines = headlines.slice(0, 8);

  let text = `📰 WEEKLY MARKET DIGEST\n\n`;
  headlines.forEach((h, i) => {
    text += `${i + 1}. ${h.title}\n${h.link}\n\n`;
  });
  text += `⚠️ News summaries only — not financial advice.`;
  return text;
}

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

// Manual trigger — visit this URL yourself anytime to force-send early for testing
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

app.get('/', (req, res) => res.send('Gold Signal Bot is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
