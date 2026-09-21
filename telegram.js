const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TP_IMAGE_URL = process.env.TP_HIT_IMAGE_URL; // hosted URL of the gold "TP HIT" graphic
const SL_IMAGE_URL = process.env.SL_HIT_IMAGE_URL; // hosted URL of the red "SL HIT" graphic

async function sendMessage(text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHANNEL_ID,
    text,
    parse_mode: 'HTML',
  });
}

async function sendPhoto(photoUrl, caption) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    chat_id: CHANNEL_ID,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  });
}

async function postTPHit(symbol, level, price) {
  const caption = `<b>${symbol}</b> — TP${level} hit\nPrice: ${price}`;
  await sendPhoto(TP_IMAGE_URL, caption);
}

async function postSLHit(symbol, price) {
  const caption = `<b>${symbol}</b> — SL hit\nPrice: ${price}`;
  await sendPhoto(SL_IMAGE_URL, caption);
}

async function postBreakeven(symbol, entry) {
  await sendMessage(`🔒 <b>${symbol}</b> — SL moved to breakeven (${entry})\nIf you're at TP1, your capital is protected.`);
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

module.exports = { sendMessage, sendPhoto, postTPHit, postSLHit, postBreakeven, postEntrySignal };
