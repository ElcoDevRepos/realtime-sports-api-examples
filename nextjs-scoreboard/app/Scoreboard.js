'use client';
// Renders the games and refreshes them from our own /api/scoreboard route every 60 s.
// The browser never sees the API key; it only talks to this app.
import { useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

function Game({ g }) {
  const showScore = g.state !== 'pre';
  return (
    <div className="game">
      <div>
        {[g.away, g.home].map((t, i) => (
          <div key={i} className={`team${g.state === 'post' && t.winner ? ' winner' : ''}`}>
            <span title={t.name}>{t.abbr ?? t.name}</span>
            <span className="score">{showScore ? t.score ?? 0 : ''}</span>
          </div>
        ))}
      </div>
      <div className={`status${g.state === 'in' ? ' live' : ''}`}>
        {g.state === 'in' ? 'LIVE · ' : ''}
        {g.detail}
        {g.venue && g.state === 'pre' ? ` · ${g.venue}` : ''}
      </div>
    </div>
  );
}

export default function Scoreboard({ initial }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      if (document.hidden) return; // don't poll from background tabs
      try {
        const res = await fetch(`/api/scoreboard?league=${encodeURIComponent(initial.league)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        if (!stopped) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!stopped) setError(e.message);
      }
    }
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [initial.league]);

  const groups = [
    ['Live', data.games.filter((g) => g.state === 'in')],
    ['Upcoming', data.games.filter((g) => g.state === 'pre')],
    ['Final', data.games.filter((g) => g.state === 'post').reverse()]
  ];

  return (
    <>
      <p className="meta">
        Updated {new Date(data.fetchedAt).toISOString().slice(11, 19)} UTC · refreshes every 60 s · data is typically 20-30 s
        behind live play
      </p>
      {error && <p className="error">Refresh failed: {error}</p>}
      {data.games.length === 0 && <p>No games on the scoreboard right now.</p>}
      {groups.map(([title, games]) =>
        games.length ? (
          <section key={title}>
            <h2>
              {title} ({games.length})
            </h2>
            {games.map((g) => (
              <Game key={g.id} g={g} />
            ))}
          </section>
        ) : null
      )}
    </>
  );
}
