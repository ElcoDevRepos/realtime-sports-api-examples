// Board-independent scoreboard logic: picking the game to show, formatting it and deciding when to
// poll again. Plain C++ (no Arduino headers) so test/test_logic.cpp can run it on your computer.
#pragma once
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdint.h>

struct Game {
  char away[8];
  char home[8];
  int awayScore;
  int homeScore;
  char state[6];     // "pre", "in" or "post"
  char detail[40];   // "5:23 - 2nd Quarter", "Final", "Tue, October 20th at 7:00 PM EDT"
  int64_t start;     // kickoff/tip-off, Unix seconds (0 if unknown)
};

// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
inline int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int64_t)doe - 719468;
}

// "2026-10-20T23:00Z" or "2026-10-20T23:00:00Z" (the API's UTC event dates) -> Unix seconds, 0 on error.
inline int64_t parseIsoUtc(const char* s) {
  int y, mo, d, h, mi, sec = 0;
  if (!s || sscanf(s, "%4d-%2d-%2dT%2d:%2d", &y, &mo, &d, &h, &mi) != 5) return 0;
  if (strlen(s) > 16 && s[16] == ':') sscanf(s + 17, "%2d", &sec);
  return daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + sec;
}

inline bool equalsIgnoreCase(const char* a, const char* b) {
  for (; *a && *b; a++, b++) if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) return false;
  return *a == *b;
}

inline bool involves(const Game& g, const char* team) {
  return !team || !*team || equalsIgnoreCase(g.away, team) || equalsIgnoreCase(g.home, team);
}

// Index of the game to show for `team`: a live game first, then the next upcoming one, then the
// most recent final. -1 when the team has no game on the scoreboard.
inline int pickGame(const Game* games, int n, const char* team, int64_t now) {
  int live = -1, next = -1, last = -1;
  for (int i = 0; i < n; i++) {
    const Game& g = games[i];
    if (!involves(g, team)) continue;
    if (strcmp(g.state, "in") == 0) { if (live < 0) live = i; }
    else if (strcmp(g.state, "pre") == 0) { if (g.start + 3600 >= now && (next < 0 || g.start < games[next].start)) next = i; }
    else if (last < 0 || g.start > games[last].start) last = i;
  }
  return live >= 0 ? live : next >= 0 ? next : last;
}

// Big line for the display: "BOS 99  DET 104", or "BOS @ DET" before the game.
inline void scoreLine(const Game& g, char* out, size_t size) {
  if (strcmp(g.state, "pre") == 0) snprintf(out, size, "%s @ %s", g.away, g.home);
  else snprintf(out, size, "%s %d  %s %d", g.away, g.awayScore, g.home, g.homeScore);
}

// Milliseconds until the next API call: 45 s while live; before a game, until 5 minutes before
// the start (at least 1 min, at most 30 min); 30 min after a final; 60 min with no game.
inline uint32_t nextPollMs(const Game* g, int64_t now) {
  if (!g) return 60UL * 60 * 1000;
  if (strcmp(g->state, "in") == 0) return 45UL * 1000;
  if (strcmp(g->state, "pre") == 0) {
    int64_t until = g->start - 300 - now;
    if (until < 60) until = 60;
    if (until > 1800) until = 1800;
    return (uint32_t)until * 1000;
  }
  return 30UL * 60 * 1000;
}
