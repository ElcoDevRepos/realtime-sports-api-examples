// Server-side helper for the Realtime Sports API. Only import this from server code (route
// handlers and server components): it reads the secret API key.
const API_BASE = process.env.RSA_API_BASE || 'https://www.realtimesportsapi.com/api/v1';

// Upstream responses are cached by Next.js for 30 s per URL, so any number of visitors costs
// at most ~2 API calls per minute per league. Data is typically 20-30 s behind live anyway.
export const REVALIDATE_SECONDS = 30;

// Only these leagues can be requested, so the route can't be used as an open proxy.
export const LEAGUES = {
  nfl: { sport: 'football', name: 'NFL' },
  'college-football': { sport: 'football', name: 'College Football' },
  nba: { sport: 'basketball', name: 'NBA' },
  'mens-college-basketball': { sport: 'basketball', name: "Men's College Basketball" },
  mlb: { sport: 'baseball', name: 'MLB' },
  nhl: { sport: 'hockey', name: 'NHL' },
  'eng.1': { sport: 'soccer', name: 'Premier League' },
  'usa.1': { sport: 'soccer', name: 'MLS' }
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Current scoreboard window (recent finals, live and upcoming games) for a league. */
export async function getScoreboard(league) {
  const cfg = LEAGUES[league];
  if (!cfg) throw new ApiError(400, `Unknown league "${league}"`);
  const key = process.env.REALTIME_SPORTS_API_KEY;
  if (!key || key === 'your_api_key_here') throw new ApiError(500, 'REALTIME_SPORTS_API_KEY is not set on the server');

  const res = await fetch(`${API_BASE}/sports/${cfg.sport}/leagues/${league}/events?limit=100`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: REVALIDATE_SECONDS }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status === 429 ? 429 : 502, body?.error?.message ?? `Upstream HTTP ${res.status}`);

  // Return only what the page needs (smaller payload, nothing secret).
  const games = (body.data ?? []).map((e) => ({
    id: e.id,
    date: e.date,
    shortName: e.shortName,
    state: e.status?.state ?? 'pre',
    detail: e.status?.detail ?? '',
    venue: e.venue?.name ?? null,
    home: { abbr: e.homeTeam?.abbreviation, name: e.homeTeam?.name, score: e.homeTeam?.score ?? null, winner: !!e.homeTeam?.winner },
    away: { abbr: e.awayTeam?.abbreviation, name: e.awayTeam?.name, score: e.awayTeam?.score ?? null, winner: !!e.awayTeam?.winner }
  }));
  games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { league, sport: cfg.sport, name: cfg.name, fetchedAt: new Date().toISOString(), games };
}
