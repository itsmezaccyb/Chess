// Extra per-player stats derived from the engine review and the PGN's clock comments.
import type { Move } from 'chess.js';
import { evalOf, gameAccuracy, type MoveReview, type PositionEval } from './analysis';
import type { Score } from './engine';

type Side = 'w' | 'b';
type PerSide<T> = Record<Side, T>;

export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

/** A notable move: the ply to jump to and how to label it. */
export interface MoveRef {
  ply: number;
  label: string;
}

export interface ClockStats {
  /** Average seconds spent per move. */
  avgTime: number;
  longestThink: (MoveRef & { seconds: number }) | null;
  /** Accuracy over moves started with under 30s on the clock; null if there were none. */
  lowTimeAccuracy: number | null;
  lowTimeMoves: number;
}

export interface GameStats {
  acpl: PerSide<number>;
  /** Share of non-forced moves that matched Stockfish's top choice, 0-100. */
  engineMatch: PerSide<number>;
  /** Largest drop in win chance, if it was at least an inaccuracy. */
  biggestMistake: PerSide<(MoveRef & { drop: number }) | null>;
  phaseAccuracy: PerSide<Record<Phase, number | null>>;
  clock: PerSide<ClockStats> | null;
}

const LOW_TIME = 30;

/** Centipawns for White, with mates and big scores capped at ±1000 like Lichess. */
function cpOf(score: Score): number {
  if (score.type === 'mate') return score.value === 0 ? 0 : score.value > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, score.value));
}

function whiteCp(pos: PositionEval): number {
  const score = evalOf(pos);
  // Checkmate on the board: the side to move has lost.
  if (score.type === 'mate' && score.value === 0) return pos.fen.split(' ')[1] === 'w' ? -1000 : 1000;
  return cpOf(score);
}

function moveLabel(m: MoveReview): string {
  const num = m.fenBefore.split(' ')[5];
  return `${num}${m.color === 'w' ? '.' : '...'} ${m.san}`;
}

/**
 * Rough phase split: the endgame starts once at most 6 non-pawn pieces remain;
 * the opening ends after move 10 or once 4+ pieces have been traded off.
 */
function phaseOf(fen: string): Phase {
  const board = fen.split(' ')[0];
  const pieces = (board.match(/[nbrqNBRQ]/g) ?? []).length;
  const fullMove = Number(fen.split(' ')[5]);
  if (pieces <= 6) return 'endgame';
  if (fullMove > 10 || pieces <= 10) return 'middlegame';
  return 'opening';
}

function parseClock(s: string): number {
  const parts = s.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Clock after each move from `[%clk h:mm:ss]` comments, or null if the PGN doesn't have one per move. */
function clocksFromPgn(pgn: string, plies: number): number[] | null {
  const clocks = [...pgn.matchAll(/\[%clk\s+([\d:.]+)\]/g)].map((m) => parseClock(m[1]));
  return clocks.length === plies && plies > 0 ? clocks : null;
}

function clockStats(
  moves: MoveReview[],
  clocks: number[],
  timeControl: string | undefined,
): PerSide<ClockStats> | null {
  const tc = timeControl?.match(/^(\d+)(?:\+(\d+))?$/);
  if (!tc) return null; // daily / correspondence or unknown
  const base = Number(tc[1]);
  const inc = Number(tc[2] ?? 0);

  const result = {} as PerSide<ClockStats>;
  for (const side of ['w', 'b'] as Side[]) {
    let prev = base;
    let total = 0;
    let count = 0;
    let longest: ClockStats['longestThink'] = null;
    const lowAccs: number[] = [];
    moves.forEach((m, i) => {
      if (m.color !== side) return;
      const spent = Math.max(0, prev - clocks[i] + inc);
      if (prev < LOW_TIME && m.classification !== 'forced') lowAccs.push(m.accuracy);
      total += spent;
      count++;
      if (!longest || spent > longest.seconds) longest = { ply: m.ply, label: moveLabel(m), seconds: spent };
      prev = clocks[i];
    });
    result[side] = {
      avgTime: count ? total / count : 0,
      longestThink: longest,
      lowTimeAccuracy: lowAccs.length ? gameAccuracy(lowAccs) : null,
      lowTimeMoves: lowAccs.length,
    };
  }
  return result;
}

export function gameStats(
  history: Move[],
  moves: MoveReview[],
  evals: PositionEval[],
  pgn: string,
  headers: Record<string, string>,
): GameStats {
  const cpLoss: PerSide<number[]> = { w: [], b: [] };
  const matched: PerSide<number> = { w: 0, b: 0 };
  const considered: PerSide<number> = { w: 0, b: 0 };
  const biggest: GameStats['biggestMistake'] = { w: null, b: null };
  const phaseAccs: PerSide<Record<Phase, number[]>> = {
    w: { opening: [], middlegame: [], endgame: [] },
    b: { opening: [], middlegame: [], endgame: [] },
  };

  moves.forEach((m, i) => {
    const side = m.color;
    const sign = side === 'w' ? 1 : -1;
    cpLoss[side].push(Math.max(0, sign * (whiteCp(evals[i]) - whiteCp(evals[i + 1]))));

    if (m.classification !== 'forced') {
      considered[side]++;
      if (m.bestUci === m.uci) matched[side]++;
      phaseAccs[side][phaseOf(m.fenBefore)].push(m.accuracy);
    }

    const drop = m.winBefore - m.winAfter;
    if (drop >= 10 && (!biggest[side] || drop > biggest[side]!.drop)) {
      biggest[side] = { ply: m.ply, label: moveLabel(m), drop };
    }
  });

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const phaseAcc = (side: Side) =>
    Object.fromEntries(PHASES.map((p) => [p, phaseAccs[side][p].length ? gameAccuracy(phaseAccs[side][p]) : null])) as Record<
      Phase,
      number | null
    >;

  const clocks = clocksFromPgn(pgn, history.length);

  return {
    acpl: { w: avg(cpLoss.w), b: avg(cpLoss.b) },
    engineMatch: {
      w: considered.w ? (matched.w / considered.w) * 100 : 0,
      b: considered.b ? (matched.b / considered.b) * 100 : 0,
    },
    biggestMistake: biggest,
    phaseAccuracy: { w: phaseAcc('w'), b: phaseAcc('b') },
    clock: clocks ? clockStats(moves, clocks, headers.TimeControl) : null,
  };
}

/** "1:05", "12s", "0.8s". */
export function formatSeconds(s: number): string {
  if (s < 10) return `${s.toFixed(1)}s`;
  const r = Math.round(s);
  if (r < 60) return `${r}s`;
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}
