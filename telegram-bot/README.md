# Telegram live-score bot

Sends live score changes for a league, or one team, to a Telegram chat, group or channel through
the [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage). Node 18+, no dependencies.

- Polls `GET /sports/{sport}/leagues/{league}/events/live` every 60 s while games are live.
- Sends a message when a game **starts**, when the **score changes**, and the **final score** when a
  game drops off the live list (one `GET /events/{id}` call per finished game).
- When nothing is live it reads the scoreboard (`GET /events`) once and sleeps until about two
  minutes before the next game (at most 6 h).
- A restart mid-game takes a silent baseline first, so it does not re-announce every live game.

Scores are aggregated from public sources and are typically 20-30 seconds behind live play.

Step-by-step tutorial:
[Build a Telegram live scores bot](https://www.realtimesportsapi.com/guides/telegram-live-scores-bot?utm_source=github&utm_medium=realtime-sports-api-examples)

## Setup

1. Get a free API key at
   [realtimesportsapi.com/signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples).
2. In Telegram, message **@BotFather**, send `/newbot` and copy the token.
3. Find the chat id: add the bot to your group (or send it a direct message), then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id` (group ids are
   negative). For a channel, make the bot an admin and use `@yourchannel`.
4. Configure:

```bash
cd telegram-bot
cp .env.example .env   # fill in REALTIME_SPORTS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `REALTIME_SPORTS_API_KEY` | (required) | Your API key |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (required unless dry run) | Bot token and target chat |
| `SPORT` / `LEAGUE` | `hockey` / `nhl` | e.g. `basketball`/`nba`, `football`/`nfl`, `basketball`/`mens-college-basketball`, `soccer`/`eng.1` |
| `TEAM` | (all games) | One team, by abbreviation (`CAR`) or team id |
| `POLL_SECONDS` | `60` | Poll interval while games are live (minimum 30) |
| `IDLE_MINUTES` | `15` | Poll interval when nothing is live and no start time is known |

## Run

```bash
node bot.js --once --scoreboard   # print a message per game on the scoreboard (no sending)
node bot.js --once                # same, only games live right now
node bot.js --dry-run             # full polling loop, printing instead of sending
node bot.js                       # full polling loop, sending to Telegram (npm start)
npm test                          # unit tests (node:test), run against a real captured response
```

Example output from a run on 18 Oct 2026 (`node bot.js --once --scoreboard`, NHL):

```
🏁 Final: <b>CBJ 1 - 2 MIN</b> (Final) · NHL
🚨 Score: <b>CAR 1 - 0 CGY</b> (12:44 - 2nd Period) · NHL
```

Telegram renders the `<b>` tags as bold.

## Quota usage

Every REST call counts toward your monthly quota (as of October 2026: Free 125 calls/month, 1,000
during your first 30 days; Starter 10,000; Growth 25,000; see
[pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

| Pattern | Calls |
| --- | --- |
| One NHL/NBA game window (~2.5-3 h) at 60 s | ~150-180 |
| Idle day (scoreboard check, sleep until next game) | ~2-10 |
| One NHL or NBA team, 82-game season | ~2,000-2,500 per month |
| A whole NHL or NBA league (games live ~6 h a night) | ~11,000 per month (Growth) |

The bot polls the league's live list and filters to `TEAM` locally. With `TEAM` set it polls only while
that team is playing and otherwise sleeps until its next game, so one team costs far less than a
league. The Free plan's first-month 1,000 calls cover a few games of testing.
