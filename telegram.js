const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHAT_ID; // matches the variable name your bot already uses
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

// Just point these at the image files sitting in the repo — no hosting,
// no URLs, no extra env vars needed for the graphics.
const TP_IMAGE_PATH = path.join(__dirname, 'tp-hit.png');
const SL_IMAGE_PATH = path.join(__dirname, 'sl-hit.png');
const DAILY_RECAP_IMAGE_PATH = path.join(__dirname, 'daily-recap.png');
const WEEKLY_RECAP_IMAGE_PATH = path.join(__dirname, 'weekly-recap.png');
const MONTHLY_RECAP_IMAGE_PATH = path.join(__dirname, 'monthly-recap.png');

async function sendMessage(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHANNEL_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('sendMessage failed:', JSON.stringify(err.response?.data || err.message));
    throw err;
  }
}

async function sendPhotoFile(filePath, caption) {
  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', fs.createReadStream(filePath));

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: form.getHeaders(),
    });
  } catch (err) {
    console.error('sendPhotoFile failed:', JSON.stringify(err.response?.data || err.message));
    throw err;
  }
}

// Sends straight to you (OWNER_CHAT_ID), not the channel — used to alert
// you when something behind the scenes breaks (e.g. price polling fails)
// instead of that failure sitting silently in Railway logs only.
async function notifyOwner(text) {
  if (!OWNER_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: OWNER_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Failed to notify owner:', err.message);
  }
}

// Decimal places differ by pair type — gold and crypto need fewer,
// standard forex pairs need more or TP1-4 round to the same number.
function getDecimals(symbol) {
  if (symbol.includes('JPY')) return 3;
  if (symbol.includes('XAU') || symbol.includes('BTC') || symbol.includes('ETH')) return 2;
  return 5; // GBP/USD, USD/CAD, etc.
}

function formatPairLabel(symbol) {
  if (symbol.includes('XAU')) return 'Gold';
  if (symbol.includes('BTC')) return 'Bitcoin';
  if (symbol.includes('ETH')) return 'Ethereum';
  return symbol; // e.g. "GBP/USD", "USD/CAD"
}

async function postTPHit(symbol, level, price) {
  const d = getDecimals(symbol);
  const caption = `<b>${formatPairLabel(symbol)}</b> — TP${level} hit\nPrice: ${price.toFixed(d)}`;
  await sendPhotoFile(TP_IMAGE_PATH, caption);
}

async function postSLHit(symbol, price) {
  const d = getDecimals(symbol);
  const caption = `<b>${formatPairLabel(symbol)}</b> — SL hit\nPrice: ${price.toFixed(d)}`;
  await sendPhotoFile(SL_IMAGE_PATH, caption);
}

async function postBreakeven(symbol, entry) {
  const d = getDecimals(symbol);
  await sendMessage(`🔒 <b>${formatPairLabel(symbol)}</b> — SL moved to breakeven (${entry.toFixed(d)})\nIf you're at TP1, your capital is protected.`);
}

async function postBreakevenClose(symbol, rAchieved) {
  await sendMessage(`✅ <b>${formatPairLabel(symbol)}</b> — closed at breakeven after TP${rAchieved}\nProfit banked, remainder closed flat. No loss on this one.`);
}

// period: 'daily' | 'weekly' | 'monthly' — picks the matching branded graphic
async function postStatsRecap(caption, period) {
  const imagePath =
    period === 'weekly' ? WEEKLY_RECAP_IMAGE_PATH :
    period === 'monthly' ? MONTHLY_RECAP_IMAGE_PATH :
    DAILY_RECAP_IMAGE_PATH;

  try {
    await sendPhotoFile(imagePath, caption);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Matches your existing entry-signal template, with real numbers for SL
// and the four targets, correct pair labelling, and per-pair decimal
// precision so TP1-4 don't round to the same displayed number.
async function postEntrySignal({ symbol, direction, entry, interval, sl, pt1, pt2, pt3, pt4 }) {
  const directionLabel = direction === 'buy' ? 'Buy' : 'Sell';
  const intervalLabel = interval === '1' ? '1M' : interval === '60' ? '1H' : interval === '240' ? '4H' : `${interval}m`;
  const d = getDecimals(symbol);

  const text =
    `<b>${formatPairLabel(symbol)} ${directionLabel}</b> 🚨\n` +
    `${intervalLabel} (TimeFrame)\n` +
    `Entry: (Now) ${entry.toFixed(d)}\n` +
    `Stop Loss: ${sl.toFixed(d)}\n\n` +
    `TP1: ${pt1.toFixed(d)}\n` +
    `TP2: ${pt2.toFixed(d)}\n` +
    `TP3: ${pt3.toFixed(d)}\n` +
    `TP4: ${pt4.toFixed(d)} (Open)\n\n` +
    `📌 Move Stop Loss to breakeven once TP1 is hit.`;

  await sendMessage(text);
}

module.exports = { sendMessage, sendPhotoFile, notifyOwner, postTPHit, postSLHit, postBreakeven, postBreakevenClose, postStatsRecap, postEntrySignal };
