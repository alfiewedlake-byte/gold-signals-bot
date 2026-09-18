const express = require('express');
const app = express();
app.use(express.json());
app.use(express.text());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || 'PUT_YOUR_CHAT_ID_HERE';
const WEBHOOK_SECRET     = process.env.WEBHOOK_SECRET     || 'choose-a-secret-here';

app.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  let raw = req.body;
  let text;

  if (typeof raw === 'string') {
    text = raw;
  } else if (typeof raw === 'object') {
    const { pair, direction, entry, sl, tp, note } = raw;
    text =
      `🟡 GOLD SIGNAL\n\n` +
      `Pair: ${pair || 'XAUUSD'}\n` +
      `Direction: ${direction || 'N/A'}\n` +
      `Entry: ${entry || 'N/A'}\n` +
      `SL: ${sl || 'N/A'}\n` +
      `TP: ${tp || 'N/A'}\n` +
      (note ? `Note: ${note}\n` : '') +
      `\n⚠️ Not financial advice — educational purposes only.`;
  } else {
    text = 'New alert triggered (no message body).';
  }

  try {
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
    const data = await tgRes.json();
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

app.get('/', (req, res) => res.send('Gold Signal Bot is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
