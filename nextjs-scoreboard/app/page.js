// Server component: fetches the scoreboard on the server (key stays here), then hands the data to
// the client component, which refreshes it every 60 s through /api/scoreboard.
import Link from 'next/link';
import Scoreboard from './Scoreboard';
import { getScoreboard, LEAGUES } from '../lib/rsa';

export default async function Page({ searchParams }) {
  const league = LEAGUES[searchParams?.league] ? searchParams.league : 'nfl';
  let data = null;
  let error = null;
  try {
    data = await getScoreboard(league);
  } catch (e) {
    error = e.message;
  }

  return (
    <main>
      <h1>{LEAGUES[league].name} scoreboard</h1>
      <nav>
        {Object.entries(LEAGUES).map(([slug, cfg]) => (
          <Link key={slug} href={`/?league=${slug}`} aria-current={slug === league ? 'page' : undefined}>
            {cfg.name}
          </Link>
        ))}
      </nav>
      {error ? <p className="error">{error}</p> : <Scoreboard key={league} initial={data} />}
      <p className="meta" style={{ marginTop: 32 }}>
        Scores from the{' '}
        <a href="https://www.realtimesportsapi.com/?utm_source=github&utm_medium=nextjs-scoreboard">Realtime Sports API</a>.
      </p>
    </main>
  );
}
