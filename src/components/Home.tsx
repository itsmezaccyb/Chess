import { useEffect, useState } from 'react';
import {
  chessComArchives,
  chessComMonth,
  lichessGameById,
  lichessGames,
  parseLichessId,
  type GameSummary,
  type Site,
} from '../lib/api';
import { parseGame } from '../lib/analysis';

type Tab = Site | 'pgn';

const SAVED_KEY = 'home:last';

function loadSaved(): { tab: Tab; username: string } {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { tab: 'chesscom', username: '' };
}

function save(tab: Tab, username: string) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ tab, username }));
  } catch {
    // ignore
  }
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

function outcomeFor(game: GameSummary, username: string): 'win' | 'loss' | 'draw' | null {
  const u = username.toLowerCase();
  const color = game.white.name.toLowerCase() === u ? 'w' : game.black.name.toLowerCase() === u ? 'b' : null;
  if (!color || game.result === '*') return null;
  if (game.result === '1/2-1/2') return 'draw';
  return (game.result === '1-0') === (color === 'w') ? 'win' : 'loss';
}

export function Home({ onOpen }: { onOpen: (game: GameSummary, viewer?: string) => void }) {
  const saved = loadSaved();
  const [tab, setTab] = useState<Tab>(saved.tab);
  const [username, setUsername] = useState(saved.username);
  const [searched, setSearched] = useState('');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [archives, setArchives] = useState<string[]>([]);
  const [nextArchive, setNextArchive] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pgn, setPgn] = useState('');

  async function search(site: Site, name: string) {
    name = name.trim();
    if (!name) return;
    setLoading(true);
    setError('');
    setGames([]);
    setSearched(name);
    save(site, name);
    try {
      if (site === 'chesscom') {
        const list = await chessComArchives(name);
        setArchives(list);
        let found: GameSummary[] = [];
        let i = 0;
        // Fill the first page with at least ~20 games, looking back up to 3 months.
        while (i < list.length && i < 3 && found.length < 20) found = found.concat(await chessComMonth(list[i++]));
        setGames(found);
        setNextArchive(i);
        setHasMore(i < list.length);
      } else {
        const found = await lichessGames(name);
        setGames(found);
        setHasMore(found.length === 30);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoading(true);
    setError('');
    try {
      if (tab === 'chesscom') {
        const more = await chessComMonth(archives[nextArchive]);
        setGames((g) => g.concat(more));
        setNextArchive(nextArchive + 1);
        setHasMore(nextArchive + 1 < archives.length);
      } else {
        const more = await lichessGames(searched, games[games.length - 1].endedAt - 1);
        setGames((g) => g.concat(more));
        setHasMore(more.length === 30);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function reviewPgn() {
    setError('');
    const input = pgn.trim();
    if (!input) return;
    const lichessId = parseLichessId(input);
    if (lichessId) {
      setLoading(true);
      try {
        onOpen(await lichessGameById(lichessId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load that game.');
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      const { headers, history } = parseGame(input);
      if (!history.length) throw new Error();
      const rating = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
      onOpen({
        id: `pgn-${hash(input)}`,
        site: 'pgn',
        pgn: input,
        url: '',
        white: { name: headers.White ?? 'White', rating: rating(headers.WhiteElo) },
        black: { name: headers.Black ?? 'Black', rating: rating(headers.BlackElo) },
        result: headers.Result ?? '*',
        timeClass: '',
        endedAt: Date.now(),
      });
    } catch {
      setError("Couldn't read that PGN. Paste the full game text, or a lichess.org game link.");
    }
  }

  // Re-run the last search on load so returning visitors see their games.
  useEffect(() => {
    if (saved.tab !== 'pgn' && saved.username) search(saved.tab, saved.username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    setError('');
    setGames([]);
    setSearched('');
    setHasMore(false);
  }

  return (
    <div className="home">
      <section className="hero">
        <h1>Free game review</h1>
        <p>Pull your games from Chess.com or Lichess and get a full Stockfish review — right in your browser.</p>
      </section>

      <div className="tabs" role="tablist">
        {(
          [
            ['chesscom', 'Chess.com'],
            ['lichess', 'Lichess'],
            ['pgn', 'PGN / Link'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => switchTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'pgn' ? (
        <div className="card">
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder={'Paste a PGN or a lichess.org game link…\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'}
            rows={8}
            spellCheck={false}
          />
          <button className="primary" onClick={reviewPgn} disabled={loading || !pgn.trim()}>
            {loading ? 'Loading…' : 'Review game'}
          </button>
        </div>
      ) : (
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            search(tab, username);
          }}
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={tab === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button className="primary" type="submit" disabled={loading || !username.trim()}>
            {loading && !games.length ? 'Loading…' : 'Find games'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {tab !== 'pgn' && searched && !loading && !error && !games.length && (
        <p className="muted center">No recent standard games found for {searched}.</p>
      )}

      {games.length > 0 && (
        <ul className="game-list">
          {games.map((g) => {
            const outcome = outcomeFor(g, searched);
            const viewerIsBlack = g.black.name.toLowerCase() === searched.toLowerCase();
            const me = viewerIsBlack ? g.black : g.white;
            const opp = viewerIsBlack ? g.white : g.black;
            return (
              <li key={g.id}>
                <button className="game-row" onClick={() => onOpen(g, searched)}>
                  <span className={`outcome ${outcome ?? ''}`}>
                    {outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : outcome === 'draw' ? '½' : '–'}
                  </span>
                  <span className="players">
                    <span className="opp">
                      <span className={`dot ${viewerIsBlack ? 'white' : 'black'}`} />
                      {opp.name}
                      {opp.rating ? <span className="rating"> ({opp.rating})</span> : null}
                    </span>
                    <span className="meta">
                      You played {viewerIsBlack ? 'black' : 'white'}
                      {me.rating ? ` · ${me.rating}` : ''}
                    </span>
                  </span>
                  <span className="right">
                    <span className="tc">{g.timeClass}</span>
                    <span className="date">{formatDate(g.endedAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && games.length > 0 && (
        <button className="secondary load-more" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load older games'}
        </button>
      )}
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
