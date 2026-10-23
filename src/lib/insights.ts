// Cross-game insights: each analysed game is boiled down to a small digest for one player,
// and digests are combined into the stats shown on the Insights page.
import { evalOf, gameAccuracy, winPercent, type MoveReview, type PositionEval } from './analysis';
import type { GameSummary } from './api';
import { clocksFromPgn, gameStats, parseTimeControl, PHASES, type Phase } from './stats';
import type { Move } from 'chess.js';

type Side = 'w' | 'b';
export type Outcome = 'win' | 'draw' | 'loss';

/** A "tactic" is a position where the best move beat every other move by at least this much win chance. */
export const TACTIC_GAP = 15;
/** Win chance that counts as clearly winning (and 100 minus it as clearly losing). */
export const WINNING = 85;
/** Share of the starting clock below which a player counts as low on time. */
export const LOW_TIME_SHARE = 0.1;

export interface GameDigest {
  id: string;
  endedAt: number;
  timeClass: string;
  color: Side;
  outcome: Outcome | null;
  opening: string | null;
  accuracy: number;
  acpl: number;
  phase: Record<Phase, number | null>;
  tacticChances: number;
  tacticsFound: number;
  /** Opponent mistakes/blunders, and how many we answered with a good-or-better move. */
  punishChances: number;
  punished: number;
  blunders: number;
  mistakes: number;
  /** Best and worst win chance we had at any point (0-100). */
  maxWin: number;
  minWin: number;
  clock: {
    avgTime: number;
    wentLow: boolean;
    /** Accuracy on moves made with plenty of time vs. while low on time. */
    normalAcc: number | null;
    lowAcc: number | null;
  } | null;
}

/** Opening family from the PGN: Lichess' "Opening" header or Chess.com's ECOUrl slug. */
export function openingFamily(headers: Record<string, string>): string | null {
  const name = headers.Opening;
  if (name && name !== '?') return name.split(':')[0].trim();
  const slug = headers.ECOUrl?.split('/openings/')[1];
  if (!slug) return null;
  const words = decodeURIComponent(slug).split('-');
  const end = words.findIndex((w) => /^(Defense|Defence|Opening|Gambit|Game|Attack|System)$/.test(w));
  return words
    .slice(0, end === -1 ? Math.min(3, words.length) : end + 1)
    .join(' ')
    .replace(/\.+.*$/, '')
    // Chess.com slugs drop apostrophes.
    .replace(/\b(Queen|King|Bishop|Alekhine|Petrov|Bird|Philidor|Owen)s\b/g, "$1's")
    .trim() || null;
}

export function outcomeFor(result: string, color: Side): Outcome | null {
  if (result === '1/2-1/2') return 'draw';
  if (result !== '1-0' && result !== '0-1') return null;
  return (result === '1-0') === (color === 'w') ? 'win' : 'loss';
}

export function digestGame(
  game: GameSummary,
  color: Side,
  history: Move[],
  headers: Record<string, string>,
  moves: MoveReview[],
  accuracy: number,
  evals: PositionEval[],
): GameDigest {
  const stats = gameStats(history, moves, evals, game.pgn, headers);
  const mine = (w: number) => (color === 'w' ? w : 100 - w);

  let tacticChances = 0;
  let tacticsFound = 0;
  let punishChances = 0;
  let punished = 0;
  let blunders = 0;
  let mistakes = 0;

  moves.forEach((m, i) => {
    if (m.color !== color) {
      const next = moves[i + 1];
      if (next && ['mistake', 'blunder', 'miss'].includes(m.classification)) {
        punishChances++;
        if (next.winBefore - next.winAfter < 5) punished++;
      }
      return;
    }
    if (m.classification === 'blunder') blunders++;
    if (m.classification === 'mistake' || m.classification === 'miss') mistakes++;
    const before = evals[i];
    if (m.classification !== 'forced' && before.lines.length > 1) {
      const best = mine(winPercent(before.lines[0].score));
      const second = mine(winPercent(before.lines[1].score));
      if (best - second >= TACTIC_GAP && best >= 50) {
        tacticChances++;
        if (m.uci === before.bestMove) tacticsFound++;
      }
    }
  });

  const wins = evals.map((e) => mine(winPercent(evalOf(e), e.fen)));

  let clock: GameDigest['clock'] = null;
  const clocks = clocksFromPgn(game.pgn, history.length);
  const tc = parseTimeControl(headers.TimeControl);
  if (clocks && tc) {
    let prev = tc.base;
    let spent = 0;
    let count = 0;
    let wentLow = false;
    const normal: number[] = [];
    const low: number[] = [];
    moves.forEach((m, i) => {
      if (m.color !== color) return;
      spent += Math.max(0, prev - clocks[i] + tc.inc);
      count++;
      const isLow = prev < tc.base * LOW_TIME_SHARE;
      if (isLow || clocks[i] < tc.base * LOW_TIME_SHARE) wentLow = true;
      if (m.classification !== 'forced') (isLow ? low : normal).push(m.accuracy);
      prev = clocks[i];
    });
    clock = {
      avgTime: count ? spent / count : 0,
      wentLow,
      normalAcc: normal.length ? gameAccuracy(normal) : null,
      lowAcc: low.length ? gameAccuracy(low) : null,
    };
  }

  return {
    id: game.id,
    endedAt: game.endedAt,
    timeClass: game.timeClass,
    color,
    outcome: outcomeFor(game.result, color),
    opening: openingFamily(headers),
    accuracy,
    acpl: stats.acpl[color],
    phase: stats.phaseAccuracy[color],
    tacticChances,
    tacticsFound,
    punishChances,
    punished,
    blunders,
    mistakes,
    maxWin: Math.max(...wins),
    minWin: Math.min(...wins),
    clock,
  };
}

export interface Record3 {
  win: number;
  draw: number;
  loss: number;
}

export interface OpeningRow extends Record3 {
  name: string;
  games: number;
  accuracy: number;
}

export interface Insights {
  games: number;
  results: Record3;
  byColor: Record<Side, Record3>;
  byTimeClass: (Record3 & { name: string; games: number; accuracy: number })[];
  accuracy: number;
  acpl: number;
  phase: Record<Phase, number | null>;
  tacticChances: number;
  tacticsFound: number;
  punishChances: number;
  punished: number;
  blundersPerGame: number;
  mistakesPerGame: number;
  winningGames: number;
  winningWon: number;
  losingGames: number;
  losingSaved: number;
  clock: {
    games: number;
    avgTime: number;
    wentLow: number;
    normalAcc: number | null;
    lowAcc: number | null;
  } | null;
  openings: Record<Side, OpeningRow[]>;
  /** Oldest first. */
  trend: { endedAt: number; accuracy: number }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: (number | null)[]) => {
  const vals = xs.filter((x): x is number => x !== null);
  return vals.length ? mean(vals) : null;
};

function tally(ds: GameDigest[]): Record3 {
  const r = { win: 0, draw: 0, loss: 0 };
  for (const d of ds) if (d.outcome) r[d.outcome]++;
  return r;
}

function groupBy<K>(ds: GameDigest[], key: (d: GameDigest) => K | null) {
  const map = new Map<K, GameDigest[]>();
  for (const d of ds) {
    const k = key(d);
    if (k === null) continue;
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  return map;
}

export function aggregate(ds: GameDigest[]): Insights {
  const sum = (f: (d: GameDigest) => number) => ds.reduce((a, d) => a + f(d), 0);
  const withClock = ds.filter((d) => d.clock);
  const winning = ds.filter((d) => d.maxWin >= WINNING && d.outcome);
  const losing = ds.filter((d) => d.minWin <= 100 - WINNING && d.outcome);

  const openings = {} as Record<Side, OpeningRow[]>;
  for (const side of ['w', 'b'] as Side[]) {
    openings[side] = [...groupBy(ds.filter((d) => d.color === side), (d) => d.opening)]
      .map(([name, g]) => ({ name, games: g.length, accuracy: mean(g.map((d) => d.accuracy)), ...tally(g) }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 6);
  }

  return {
    games: ds.length,
    results: tally(ds),
    byColor: { w: tally(ds.filter((d) => d.color === 'w')), b: tally(ds.filter((d) => d.color === 'b')) },
    byTimeClass: [...groupBy(ds, (d) => d.timeClass || null)]
      .map(([name, g]) => ({ name, games: g.length, accuracy: mean(g.map((d) => d.accuracy)), ...tally(g) }))
      .sort((a, b) => b.games - a.games),
    accuracy: mean(ds.map((d) => d.accuracy)),
    acpl: mean(ds.map((d) => d.acpl)),
    phase: Object.fromEntries(PHASES.map((p) => [p, meanOrNull(ds.map((d) => d.phase[p]))])) as Record<Phase, number | null>,
    tacticChances: sum((d) => d.tacticChances),
    tacticsFound: sum((d) => d.tacticsFound),
    punishChances: sum((d) => d.punishChances),
    punished: sum((d) => d.punished),
    blundersPerGame: ds.length ? sum((d) => d.blunders) / ds.length : 0,
    mistakesPerGame: ds.length ? sum((d) => d.mistakes) / ds.length : 0,
    winningGames: winning.length,
    winningWon: winning.filter((d) => d.outcome === 'win').length,
    losingGames: losing.length,
    losingSaved: losing.filter((d) => d.outcome !== 'loss').length,
    clock: withClock.length
      ? {
          games: withClock.length,
          avgTime: mean(withClock.map((d) => d.clock!.avgTime)),
          wentLow: withClock.filter((d) => d.clock!.wentLow).length,
          normalAcc: meanOrNull(withClock.map((d) => d.clock!.normalAcc)),
          lowAcc: meanOrNull(withClock.map((d) => d.clock!.lowAcc)),
        }
      : null,
    openings,
    trend: [...ds].sort((a, b) => a.endedAt - b.endedAt).map((d) => ({ endedAt: d.endedAt, accuracy: d.accuracy })),
  };
}
