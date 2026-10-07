// GET /api/scoreboard?league=nfl
// Proxies the Realtime Sports API so the key never reaches the browser. The upstream fetch is
// cached for 30 s (see lib/rsa.js), and browsers/CDNs may cache this response for 30 s too.
import { NextResponse } from 'next/server';
import { getScoreboard } from '../../../lib/rsa';

export async function GET(request) {
  const league = request.nextUrl.searchParams.get('league') || 'nfl';
  try {
    const data = await getScoreboard(league);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
