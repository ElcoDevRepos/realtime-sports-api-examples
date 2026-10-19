# ESP32 OLED scoreboard

A desk scoreboard for your team on an ESP32 and a 0.96" 128x64 SSD1306 OLED: live score and clock
during the game, the next game's start time before it, the final afterwards. Arduino sketch.

- One HTTPS call to the league scoreboard (`GET /sports/{sport}/leagues/{league}/events?limit=24`)
  per refresh. The JSON is filtered with ArduinoJson while it streams in, so the board keeps only
  the abbreviations, scores, status and start time it shows.
- It picks your team's game (live first, then the next upcoming one, then the last final) and
  refreshes every 45 s while it's live, from 5 minutes before the start when a game is near, every
  30 minutes after a final and hourly with no game.
- The clock comes from NTP; game times are UTC from the API, so no time zone setup is needed.

Data is typically 20-30 seconds behind live play.

Step-by-step tutorial:
[ESP32 / Arduino live scoreboard](https://www.realtimesportsapi.com/guides/esp32-arduino-scoreboard?utm_source=github&utm_medium=realtime-sports-api-examples)

## Parts

- Any ESP32 dev board (ESP32-WROOM DevKit and similar)
- SSD1306 128x64 I2C OLED (address 0x3C)
- Wiring: SDA → GPIO 21, SCL → GPIO 22, VCC → 3V3, GND → GND

## Build

1. Arduino IDE 2: install **esp32 by Espressif** (Boards Manager, core 3.x) and the libraries
   **ArduinoJson** (7.x), **Adafruit SSD1306** and **Adafruit GFX** (Library Manager).
2. Copy `secrets.h.example` to `secrets.h` and fill in Wi-Fi, your API key
   ([free signup](https://www.realtimesportsapi.com/signup?utm_source=github&utm_medium=realtime-sports-api-examples)),
   sport, league and team (e.g. `basketball` / `nba` / `BOS`, `hockey` / `nhl` / `CAR`,
   `football` / `nfl` / `KC`).
3. Open `esp32-scoreboard.ino`, pick your board and port, upload. Serial monitor at 115200 prints
   each refresh.

The sketch uses `setInsecure()` for TLS to keep setup short (no certificate pinning). That's fine
for a scoreboard; pin the root CA with `setCACert()` for anything sensitive. Keep `secrets.h` out
of git (it's in `.gitignore`).

## Test the logic on your computer

The board-independent parts (date parsing, picking the game, the score line, the poll schedule) are
in `scoreboard_logic.h` and unit tested natively:

```bash
c++ -std=c++17 -Wall -o /tmp/scoreboard-test test/test_logic.cpp && /tmp/scoreboard-test
```

The sketch itself is not compiled in CI; it targets the ESP32 Arduino core 3.x with ArduinoJson 7.

## Quota usage

As of October 2026: Free 125 calls/month (1,000 during your first 30 days), Starter 10,000
([pricing](https://www.realtimesportsapi.com/pricing?utm_source=github&utm_medium=realtime-sports-api-examples)).

| Pattern | Calls |
| --- | --- |
| No game on the scoreboard (hourly) | ~24 a day |
| Game day before the start (every 30 min, then 5 min before) | ~10-20 |
| One NBA/NHL game live (~2.5 h at 45 s) | ~200 |
| One NBA or NHL team, ~14 games a month | ~3,500 per month (Starter) |
| One NFL team, ~4 games a month | ~1,900 per month (Starter) |

For the Free plan, change the `45UL * 1000` live interval in `scoreboard_logic.h` to a few minutes
and the no-game interval to several hours; the first-month 1,000 calls cover a few live games.
