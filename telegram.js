const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHAT_ID; // matches the variable name your bot already uses

// Just point these at the image files sitting in the repo — no hosting,
// no URLs, no extra env vars needed for the graphics.
const TP_IMAGE_PATH = path.join(__dirname, 'tp-hit.png');
const SL_IMAGE_PATH = path.join(__dirname, 'sl-hit.png');

async function sendMessage(text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHANNEL_ID,
    text,
    parse_mode: 'HTML',
  });
}

async function sendPhotoFile(filePath, caption) {
  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', fs.createReadStream(filePath));

  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
    headers: form.getHeaders(),
  });
}

async function postTPHit(symbol, level, price) {
  const caption = `<b>${symbol}</b> — TP${level} hit\nPrice: ${price}`;
  await sendPhotoFile(TP_IMAGE_PATH, caption);
}

async function postSLHit(symbol, price) {
  const caption = `<b>${symbol}</b> — SL hit\nPrice: ${price}`;
  await sendPhotoFile(SL_IMAGE_PATH, caption);
}

async function postBreakeven(symbol, entry) {
  await sendMessage(`🔒 <b>${symbol}</b> — SL moved to breakeven (${entry})\nIf you're at TP1, your capital is protected.`);
}

async function postBreakevenClose(symbol, rAchieved) {
  await sendMessage(`✅ <b>${symbol}</b> — closed at breakeven after TP${rAchieved}\nProfit banked, remainder closed flat. No loss on this one.`);
}

// Matches your existing entry-signal template, but with real numbers
// instead of "2xATR" / "1R" text for SL and the four targets.
async function postEntrySignal({ symbol, direction, entry, interval, sl, pt1, pt2, pt3, pt4 }) {
  const directionLabel = direction === 'buy' ? 'Buy' : 'Sell';
  const intervalLabel = interval === '1' ? '1M' : interval === '60' ? '1H' : interval === '240' ? '4H' : `${interval}m`;

  const text =
    `<b>${symbol.replace('USD', '')} ${direction === 'buy' ? 'Gold Buy' : 'Gold Sell'}</b> 🚨\n` +
    `${intervalLabel} (TimeFrame)\n` +
    `Entry: (Now) ${entry.toFixed(3)}\n` +
    `Stop Loss: ${sl.toFixed(3)}\n\n` +
    `TP1: ${pt1.toFixed(3)}\n` +
    `TP2: ${pt2.toFixed(3)}\n` +
    `TP3: ${pt3.toFixed(3)}\n` +
    `TP4: ${pt4.toFixed(3)} (Open)\n\n` +
    `📌 Move Stop Loss to breakeven once TP1 is hit.`;

  await sendMessage(text);
}

module.exports = { sendMessage, sendPhotoFile, postTPHit, postSLHit, postBreakeven, postBreakevenClose, postEntrySignal };
