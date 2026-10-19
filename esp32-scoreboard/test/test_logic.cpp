// Native unit tests for scoreboard_logic.h:  c++ -std=c++17 -Wall -o /tmp/t test/test_logic.cpp && /tmp/t
#include "../scoreboard_logic.h"
#include <assert.h>
#include <stdio.h>

static Game mk(const char* a, int as, const char* h, int hs, const char* st, const char* when) {
  Game g{};
  snprintf(g.away, sizeof g.away, "%s", a);
  snprintf(g.home, sizeof g.home, "%s", h);
  g.awayScore = as; g.homeScore = hs;
  snprintf(g.state, sizeof g.state, "%s", st);
  snprintf(g.detail, sizeof g.detail, "%s", st);
  g.start = parseIsoUtc(when);
  return g;
}

int main() {
  // Dates as the API sends them (UTC, minutes precision).
  assert(parseIsoUtc("1970-01-01T00:00Z") == 0);
  assert(parseIsoUtc("2026-10-20T23:00Z") == 1792537200);
  assert(parseIsoUtc("2026-10-20T23:00:30Z") == 1792537230);
  assert(parseIsoUtc("garbage") == 0);

  const int64_t now = parseIsoUtc("2026-10-20T22:00Z");
  Game games[] = {
    mk("BOS", 99, "DET", 104, "post", "2026-10-19T23:00Z"),
    mk("PHI", 0, "NY", 0, "pre", "2026-10-20T23:00Z"),
    mk("OKC", 51, "SA", 48, "in", "2026-10-20T21:00Z"),
    mk("BOS", 0, "MIA", 0, "pre", "2026-10-22T23:30Z"),
  };
  const int n = sizeof games / sizeof games[0];
  assert(pickGame(games, n, "sa", now) == 2);    // live first
  assert(pickGame(games, n, "NY", now) == 1);    // next upcoming
  assert(pickGame(games, n, "BOS", now) == 3);   // upcoming beats an older final
  assert(pickGame(games, n, "LAL", now) == -1);  // no game
  assert(pickGame(games, n, "", now) == 2);      // no team: the live game

  char line[32];
  scoreLine(games[2], line, sizeof line);
  assert(strcmp(line, "OKC 51  SA 48") == 0);
  scoreLine(games[1], line, sizeof line);
  assert(strcmp(line, "PHI @ NY") == 0);

  assert(nextPollMs(&games[2], now) == 45000);
  assert(nextPollMs(&games[1], now) == 1800000);                                     // 1 h away: capped at 30 min
  assert(nextPollMs(&games[1], parseIsoUtc("2026-10-20T22:50Z")) == 300000);          // poll 5 min before
  assert(nextPollMs(&games[1], parseIsoUtc("2026-10-20T22:58Z")) == 60000);           // at least 1 min
  assert(nextPollMs(&games[0], now) == 1800000);
  assert(nextPollMs(nullptr, now) == 3600000);
  puts("all scoreboard_logic tests passed");
  return 0;
}
