# Gold Signal Bot — Setup Guide

This bridges TradingView alerts → your Telegram channel, automatically.

## What you need to do (steps only you can do — needs your accounts)

### 1. Create your Telegram bot
1. In Telegram, message **@BotFather**.
2. Send `/newbot`, follow prompts, name it (e.g. "AlfieGoldSignals").
3. Copy the **bot token** it gives you (looks like `123456789:ABCdefGhIJKlmNoPQRstuVWXyz`).
4. Create your Telegram channel (or use an existing one).
5. Add your new bot as an **admin** of that channel (Channel settings → Administrators → Add Admin → search your bot).

### 2. Get your Chat ID
1. Post any message in your channel.
2. Visit this URL in a browser (replace TOKEN):
   `https://api.telegram.org/botTOKEN/getUpdates`
3. Look for `"chat":{"id":-100xxxxxxxxx` — that number (including the minus sign) is your **Chat ID**.

### 3. Deploy this bot (free hosting — Railway is easiest)
1. Go to [railway.app](https://railway.app), sign up free.
2. New Project → "Deploy from GitHub repo" (or "Empty Project" → drag these files in via their CLI) — or use **Render.com** the same way.
3. Set these environment variables in Railway/Render's dashboard:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `TELEGRAM_CHAT_ID` = your chat ID
   - `WEBHOOK_SECRET` = any password-like string you make up (e.g. `alfie-gold-9482`)
4. Deploy. You'll get a public URL like `https://gold-signals-bot-production.up.railway.app`

### 4. Set your TradingView alert
1. On your chart, right-click the price level (or use your indicator's alert condition) → **Add Alert**.
2. Under "Notifications", enable **Webhook URL** and paste:
   `https://YOUR-RAILWAY-URL/webhook/alfie-gold-9482`
   (use the same secret you set in step 3)
3. In the **Message** box, either:
   - Plain text: `XAUUSD BUY signal — FVG retest at 4380` (simplest, posts as-is)
   - Or JSON for a formatted card:
     ```json
     {"pair":"XAUUSD","direction":"BUY","entry":"4380","sl":"4375","tp":"4392"}
     ```
4. Save. Next time price crosses that level, Telegram gets the message within seconds.

## Testing without TradingView
Once deployed, test it directly:
```bash
curl -X POST https://YOUR-RAILWAY-URL/webhook/alfie-gold-9482 \
  -H "Content-Type: application/json" \
  -d '{"pair":"XAUUSD","direction":"BUY","entry":"4380","sl":"4375","tp":"4392"}'
```
You should see the message land in your Telegram channel within a second or two.

## Running locally first (optional)
```bash
npm install
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx WEBHOOK_SECRET=xxx npm start
```
