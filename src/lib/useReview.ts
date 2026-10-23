import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { toWhitePov, type PositionEval } from './analysis';

const CACHE_PREFIX = 'review:v1:';
const CACHE_LIMIT = 20;

function readCache(key: string): PositionEval[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as PositionEval[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, evals: PositionEval[]) {
  try {
    const indexKey = CACHE_PREFIX + 'index';
    const index = (JSON.parse(localStorage.getItem(indexKey) ?? '[]') as string[]).filter((k) => k !== key);
    index.push(key);
    while (index.length > CACHE_LIMIT) localStorage.removeItem(CACHE_PREFIX + index.shift());
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(evals));
    localStorage.setItem(indexKey, JSON.stringify(index));
  } catch {
    // Storage full or unavailable; caching is optional.
  }
}

/** Evals from any earlier review of this game, preferring the deepest. */
export function cachedEvals(cacheKey: string, plies: number): PositionEval[] | null {
  for (const depth of [18, 15, 12]) {
    const cached = readCache(`${cacheKey}:${depth}`);
    if (cached && cached.length === plies + 1) return cached;
  }
  return null;
}

/** Analyses each position in turn. Resolves null if cancelled part way. */
export async function analyzePositions(
  engine: Engine,
  fens: string[],
  depth: number,
  onProgress: (evals: PositionEval[]) => void,
  isCancelled: () => boolean,
): Promise<PositionEval[] | null> {
  const out: PositionEval[] = [];
  for (const fen of fens) {
    const res = await engine.analyze(fen, { depth, multipv: 2 });
    if (isCancelled()) return null;
    out.push({
      fen,
      bestMove: res.bestMove,
      lines: res.lines.map((l) => ({ ...l, score: toWhitePov(l.score, fen), pv: l.pv.slice(0, 10) })),
    });
    onProgress([...out]);
  }
  return out;
}

/** Runs Stockfish over every position of a game, reporting progress as it goes. */
export function useReview(cacheKey: string, fens: string[], depth: number) {
  const [evals, setEvals] = useState<PositionEval[]>([]);
  const key = `${cacheKey}:${depth}`;

  useEffect(() => {
    const cached = readCache(key);
    if (cached && cached.length === fens.length) {
      setEvals(cached);
      return;
    }
    setEvals([]);
    let cancelled = false;
    const engine = new Engine();
    engine.newGame();
    (async () => {
      const out = await analyzePositions(engine, fens, depth, (evals) => setEvals(evals), () => cancelled);
      if (!out) return;
      writeCache(key, out);
      engine.terminate();
    })();
    return () => {
      cancelled = true;
      engine.terminate();
    };
    // fens is derived from the same game as cacheKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { evals, done: evals.length === fens.length && fens.length > 0 };
}

/** Live analysis for an arbitrary position (used while exploring variations). */
export function useLiveAnalysis(fen: string | null, depth = 18) {
  const [state, setState] = useState<PositionEval | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    if (!fen) return;
    const engine = (engineRef.current ??= new Engine());
    let cancelled = false;
    engine.analyze(fen, {
      depth,
      onUpdate: (lines) => {
        if (cancelled) return;
        setState({
          fen,
          bestMove: lines[0]?.pv[0] ?? null,
          lines: lines.map((l) => ({ ...l, score: toWhitePov(l.score, fen) })),
        });
      },
    });
    return () => {
      cancelled = true;
      engine.stop();
    };
  }, [fen, depth]);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    },
    [],
  );

  return state && state.fen === fen ? state : null;
}
