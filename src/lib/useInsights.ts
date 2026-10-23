import { useEffect, useState } from 'react';
import { parseGame, reviewGame } from './analysis';
import { recentGames, type GameSummary, type Site } from './api';
import { Engine } from './engine';
import { digestGame, type GameDigest } from './insights';
import { analyzePositions, cachedEvals } from './useReview';

const STORE_PREFIX = 'insights:v1:';
const DEPTH = 12;
export const INSIGHT_GAMES = 50;
/** Skip games too short to say anything (aborts, early resignations). */
const MIN_PLIES = 10;

type Store = Record<string, GameDigest>;

function storeKey(site: Site, username: string) {
  return `${STORE_PREFIX}${site}:${username.toLowerCase()}`;
}

function loadStore(key: string): Store {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function saveStore(key: string, store: Store) {
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Storage full or unavailable; digests are recomputed next time.
  }
}

export interface InsightsState {
  status: 'loading' | 'analyzing' | 'done' | 'error';
  error?: string;
  digests: GameDigest[];
  /** Games to analyse in total, and how many are finished. */
  total: number;
  analyzed: number;
  /** Progress through the game currently being analysed, 0-1. */
  current: number;
}

/**
 * Fetches a player's recent games and analyses any not seen before, in the background.
 * Digests are saved as each game finishes, so leaving and coming back resumes.
 */
export function useInsights(site: Site, username: string): InsightsState {
  const [state, setState] = useState<InsightsState>({ status: 'loading', digests: [], total: 0, analyzed: 0, current: 0 });

  useEffect(() => {
    let cancelled = false;
    let engine: Engine | null = null;
    const key = storeKey(site, username);
    const name = username.toLowerCase();

    (async () => {
      let games: GameSummary[];
      try {
        games = await recentGames(site, username, INSIGHT_GAMES);
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : 'Could not load games.' }));
        return;
      }
      if (cancelled) return;

      const parsed = games
        .map((g) => {
          const color: 'w' | 'b' | null =
            g.white.name.toLowerCase() === name ? 'w' : g.black.name.toLowerCase() === name ? 'b' : null;
          try {
            return color ? { game: g, color, ...parseGame(g.pgn) } : null;
          } catch {
            return null;
          }
        })
        .filter((x): x is NonNullable<typeof x> => !!x && x.history.length >= MIN_PLIES);

      // Keep only digests for games still in the window.
      const old = loadStore(key);
      const store: Store = {};
      for (const p of parsed) if (old[p.game.id]) store[p.game.id] = old[p.game.id];
      const digests = () => parsed.map((p) => store[p.game.id]).filter(Boolean);
      const todo = parsed.filter((p) => !store[p.game.id]);
      const update = (current: number) =>
        setState({
          status: digests().length === parsed.length ? 'done' : 'analyzing',
          digests: digests(),
          total: parsed.length,
          analyzed: digests().length,
          current,
        });
      update(0);

      for (const p of todo) {
        let evals = cachedEvals(p.game.id, p.history.length);
        if (!evals) {
          engine ??= new Engine();
          engine.newGame();
          evals = await analyzePositions(engine, p.fens, DEPTH, (e) => update(e.length / p.fens.length), () => cancelled);
          if (!evals) return;
        }
        const review = reviewGame(p.history, evals);
        store[p.game.id] = digestGame(p.game, p.color, p.history, p.headers, review.moves, review.accuracy[p.color], evals);
        saveStore(key, store);
        if (cancelled) return;
        update(0);
      }
      engine?.terminate();
    })();

    return () => {
      cancelled = true;
      engine?.terminate();
    };
  }, [site, username]);

  return state;
}
