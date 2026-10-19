// ESP32 live scoreboard on a 128x64 SSD1306 OLED, powered by the Realtime Sports API.
//
// Board: any ESP32 dev board (Arduino core for ESP32 3.x).  Libraries (Library Manager):
//   ArduinoJson 7.x, Adafruit SSD1306, Adafruit GFX.
// Wiring (I2C): OLED SDA -> GPIO 21, SCL -> GPIO 22, VCC -> 3V3, GND -> GND.
//
// One HTTPS call to the league scoreboard (GET /sports/{sport}/leagues/{league}/events) per
// refresh: every 45 s while your team is live, otherwise only when a game is near (see
// scoreboard_logic.h). The JSON is filtered while it streams in, so the board only keeps the few
// fields it shows.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include "secrets.h"
#include "scoreboard_logic.h"

const char* API_BASE = "https://www.realtimesportsapi.com/api/v1";
const int MAX_GAMES = 24;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
Game games[MAX_GAMES];
int gameCount = 0;
uint32_t nextPollAt = 0;

void show(const char* top, const char* big, const char* bottom) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(top);
  display.setTextSize(strlen(big) > 10 ? 1 : 2);
  display.setCursor(0, 22);
  display.print(big);
  display.setTextSize(1);
  display.setCursor(0, 54);
  display.print(bottom);
  display.display();
}

// Returns true when the scoreboard was read. Fills games[] / gameCount.
bool fetchScoreboard() {
  WiFiClientSecure client;
  // setInsecure() skips certificate checks: fine for a desk scoreboard. For anything sensitive,
  // pin the site's root CA with client.setCACert(...) instead.
  client.setInsecure();
  HTTPClient http;
  String url = String(API_BASE) + "/sports/" + RSA_SPORT + "/leagues/" + RSA_LEAGUE + "/events?limit=" + MAX_GAMES;
  http.useHTTP10(true);  // no chunked encoding, so ArduinoJson can read the stream directly
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", String("Bearer ") + RSA_API_KEY);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("HTTP %d\n", code);
    show(RSA_LEAGUE, code == 429 ? "Quota" : "Error", code == 401 ? "check API key" : "retrying");
    http.end();
    return false;
  }

  // Keep only the fields we display.
  JsonDocument filter;
  JsonObject f = filter["data"][0].to<JsonObject>();
  f["date"] = true;
  f["status"]["state"] = true;
  f["status"]["detail"] = true;
  f["homeTeam"]["abbreviation"] = true;
  f["homeTeam"]["score"] = true;
  f["awayTeam"]["abbreviation"] = true;
  f["awayTeam"]["score"] = true;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream(), DeserializationOption::Filter(filter));
  http.end();
  if (err) {
    Serial.printf("JSON error: %s\n", err.c_str());
    return false;
  }

  gameCount = 0;
  for (JsonObject e : doc["data"].as<JsonArray>()) {
    if (gameCount >= MAX_GAMES) break;
    Game& g = games[gameCount++];
    snprintf(g.away, sizeof g.away, "%s", e["awayTeam"]["abbreviation"] | "?");
    snprintf(g.home, sizeof g.home, "%s", e["homeTeam"]["abbreviation"] | "?");
    g.awayScore = e["awayTeam"]["score"] | 0;
    g.homeScore = e["homeTeam"]["score"] | 0;
    snprintf(g.state, sizeof g.state, "%s", e["status"]["state"] | "pre");
    snprintf(g.detail, sizeof g.detail, "%s", e["status"]["detail"] | "");
    g.start = parseIsoUtc(e["date"] | "");
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) Serial.println("SSD1306 not found at 0x3C");
  show("Realtime Sports API", "WiFi...", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");  // UTC clock, to know how far away a game is
  while (time(nullptr) < 1700000000) delay(250);
}

void loop() {
  if ((int32_t)(millis() - nextPollAt) < 0) {
    delay(200);
    return;
  }
  int64_t now = time(nullptr);
  if (!fetchScoreboard()) {
    nextPollAt = millis() + 60000;
    return;
  }
  int i = pickGame(games, gameCount, RSA_TEAM, now);
  const Game* g = i >= 0 ? &games[i] : nullptr;
  if (g) {
    char line[24];
    scoreLine(*g, line, sizeof line);
    show(strcmp(g->state, "in") == 0 ? "LIVE" : strcmp(g->state, "post") == 0 ? "FINAL" : "NEXT", line, g->detail);
    Serial.printf("%s | %s\n", line, g->detail);
  } else {
    show(RSA_LEAGUE, "No game", "on the scoreboard");
  }
  nextPollAt = millis() + nextPollMs(g, now);
}
