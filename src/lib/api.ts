// Fetching games from the public Chess.com and Lichess APIs (both allow CORS).

export type Site = 'chesscom' | 'lichess';

export interface GameSummary {
  id: string;
  site: Site | 'pgn';
  pgn: string;
  url: string;
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  /** '1-0' | '0-1' | '1/2-1/2' | '*' */
  result: string;
  timeClass: string;
  endedAt: number;
}

interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
}

interface ChessComGame {
  url: string;
  uuid?: string;
  pgn?: string;
  time_class: string;
  rules: string;
  end_time: number;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

function chessComResult(g: ChessComGame): string {
  if (g.white.result === 'win') return '1-0';
  if (g.black.result === 'win') return '0-1';
  if (DRAW_RESULTS.has(g.white.result)) return '1/2-1/2';
  return '*';
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 404) throw new Error('Player not found.');
  if (res.status === 429) throw new Error('Rate limited — wait a minute and try again.');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

/** Returns monthly archive URLs for a Chess.com player, newest first. */
export async function chessComArchives(username: string): Promise<string[]> {
  const data = await getJson<{ archives: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
  );
  return [...data.archives].reverse();
}

export async function chessComMonth(archiveUrl: string): Promise<GameSummary[]> {
  let data: { games: ChessComGame[] };
  try {
    data = await getJson<{ games: ChessComGame[] }>(archiveUrl);
  } catch (e) {
    // Chess.com occasionally errors on a single month (often very busy accounts); skip it.
    if (e instanceof Error && e.message.startsWith('Rate limited')) throw e;
    return [];
  }
  return data.games
    .filter((g) => g.rules === 'chess' && g.pgn)
    .map((g) => ({
      id: `cc-${g.uuid ?? g.url}`,
      site: 'chesscom' as const,
      pgn: g.pgn!,
      url: g.url,
      white: { name: g.white.username, rating: g.white.rating },
      black: { name: g.black.username, rating: g.black.rating },
      result: chessComResult(g),
      timeClass: g.time_class,
      endedAt: g.end_time * 1000,
    }))
    .reverse();
}

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  createdAt: number;
  lastMoveAt: number;
  winner?: 'white' | 'black';
  status: string;
  pgn: string;
  players: {
    white: { user?: { name: string }; rating?: number; aiLevel?: number };
    black: { user?: { name: string }; rating?: number; aiLevel?: number };
  };
}

function lichessName(p: LichessGame['players']['white']) {
  return p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
}

function fromLichess(g: LichessGame): GameSummary {
  const drawn = ['draw', 'stalemate'].includes(g.status);
  return {
    id: `li-${g.id}`,
    site: 'lichess',
    pgn: g.pgn,
    url: `https://lichess.org/${g.id}`,
    white: { name: lichessName(g.players.white), rating: g.players.white.rating },
    black: { name: lichessName(g.players.black), rating: g.players.black.rating },
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : drawn ? '1/2-1/2' : '*',
    timeClass: g.speed,
    endedAt: g.lastMoveAt ?? g.createdAt,
  };
}

/** Lichess streams ndjson; `until` (ms) pages backwards through history. */
export async function lichessGames(username: string, until?: number, max = 30): Promise<GameSummary[]> {
  const params = new URLSearchParams({
    max: String(max),
    pgnInJson: 'true',
    opening: 'true',
    variant: 'standard',
  });
  if (until) params.set('until', String(until));
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  if (res.status === 404) throw new Error('Player not found.');
  if (res.status === 429) throw new Error('Rate limited — wait a minute and try again.');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LichessGame)
    .filter((g) => g.variant === 'standard' && g.pgn)
    .map(fromLichess);
}

/** Accepts a lichess.org game URL or 8/12-char game id. */
export function parseLichessId(input: string): string | null {
  const m = input.trim().match(/(?:lichess\.org\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?(?:#\d+)?$/);
  return m && /lichess\.org/.test(input) ? m[1] : null;
}

export async function lichessGameById(id: string): Promise<GameSummary> {
  const g = await getJson<LichessGame>(`https://lichess.org/game/export/${id}?pgnInJson=true&opening=true`, {
    headers: { Accept: 'application/json' },
  });
  return fromLichess(g);
}

/** The player's most recent standard games, newest first. */
export async function recentGames(site: Site, username: string, count: number): Promise<GameSummary[]> {
  if (site === 'lichess') return lichessGames(username, undefined, count);
  const archives = await chessComArchives(username);
  let found: GameSummary[] = [];
  // Look back up to a year of monthly archives.
  for (let i = 0; i < archives.length && i < 12 && found.length < count; i++) {
    found = found.concat(await chessComMonth(archives[i]));
  }
  return found.slice(0, count);
}
