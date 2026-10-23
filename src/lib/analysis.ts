// Turns per-position engine evaluations into move classifications and accuracy.
import { Chess, type Move, type Square } from 'chess.js';
import type { EngineLine, Score } from './engine';

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced';

import type { IconName } from '../components/Icon';

/** `symbol` is plain ASCII text; `icon` is used instead where set (no emoji glyphs). */
export const CLASS_INFO: Record<Classification, { label: string; symbol: string; icon?: IconName; color: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#1baca6' },
  great: { label: 'Great', symbol: '!', color: '#5c8bb0' },
  best: { label: 'Best', symbol: '', icon: 'star', color: '#81b64c' },
  excellent: { label: 'Excellent', symbol: '', icon: 'thumb', color: '#81b64c' },
  good: { label: 'Good', symbol: '', icon: 'check', color: '#95b776' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459' },
  miss: { label: 'Miss', symbol: '', icon: 'cross', color: '#ee6b55' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d' },
  forced: { label: 'Forced', symbol: '', icon: 'square', color: '#97afb3' },
};

export const CLASS_ORDER: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** An engine evaluation of one position, scores converted to White's point of view. */
export interface PositionEval {
  fen: string;
  lines: EngineLine[];
  bestMove: string | null;
}

export interface MoveReview {
  ply: number;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  classification: Classification;
  accuracy: number;
  /** Win chance (0-100) for the mover before and after the move. */
  winBefore: number;
  winAfter: number;
  bestUci: string | null;
  bestSan: string | null;
}

export interface GameReview {
  moves: MoveReview[];
  accuracy: { w: number; b: number };
  counts: { w: Record<Classification, number>; b: Record<Classification, number> };
}

export function parseGame(pgn: string) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const startFen = history.length ? history[0].before : chess.fen();
  return { headers: chess.getHeaders(), history, startFen, fens: [startFen, ...history.map((m) => m.after)] };
}

/** Converts a side-to-move score to White's point of view. */
export function toWhitePov(score: Score, fen: string): Score {
  const blackToMove = fen.split(' ')[1] === 'b';
  return blackToMove ? { type: score.type, value: -score.value } : score;
}

/** Eval of a position for White. Handles game-over positions the engine can't score. */
export function evalOf(pos: PositionEval): Score {
  if (pos.lines.length) return pos.lines[0].score;
  // No lines: checkmate (mate 0, resolved via the FEN) or stalemate.
  return new Chess(pos.fen).isCheckmate() ? { type: 'mate', value: 0 } : { type: 'cp', value: 0 };
}

/** Lichess' win-chance model: 0-100 for White. */
export function winPercent(score: Score, fen?: string): number {
  if (score.type === 'mate') {
    if (score.value === 0) {
      // Checkmate on the board: the side to move has lost.
      return fen?.split(' ')[1] === 'w' ? 0 : 100;
    }
    return score.value > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatScore(score: Score, fen?: string): string {
  if (score.type === 'mate') {
    if (score.value === 0) return fen?.split(' ')[1] === 'w' ? '0-1' : '1-0';
    return `${score.value > 0 ? '' : '-'}M${Math.abs(score.value)}`;
  }
  const v = score.value / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Rough "did this move give up material?" check: after the move, can the
 * opponent win at least two points net with a single capture?
 */
function isSacrifice(move: Move): boolean {
  if (move.promotion) return false;
  const after = new Chess(move.after);
  const gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  let worst = 0;
  for (const reply of after.moves({ verbose: true })) {
    if (!reply.captured) continue;
    after.move(reply);
    const recapture = after.moves({ verbose: true }).some((m) => m.to === reply.to);
    after.undo();
    const loss = PIECE_VALUE[reply.captured] - (recapture ? PIECE_VALUE[reply.piece] : 0);
    worst = Math.max(worst, loss);
  }
  return worst - gained >= 2;
}

export function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    const chess = new Chess(fen);
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

function moveAccuracy(winLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries([...CLASS_ORDER, 'forced'].map((c) => [c, 0])) as Record<Classification, number>;
}

export function reviewGame(history: Move[], evals: PositionEval[]): GameReview {
  const moves: MoveReview[] = [];
  const accs: { w: number[]; b: number[] } = { w: [], b: [] };
  const counts = { w: emptyCounts(), b: emptyCounts() };

  history.forEach((move, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    const color = move.color;
    const sign = color === 'w' ? 1 : -1;
    const toMover = (w: number) => (sign === 1 ? w : 100 - w);
    const winBefore = toMover(winPercent(evalOf(before), before.fen));
    const winAfter = toMover(winPercent(evalOf(after), after.fen));
    const loss = Math.max(0, winBefore - winAfter);
    const uci = move.from + move.to + (move.promotion ?? '');
    const isBest = before.bestMove === uci;
    const legalMoves = new Chess(before.fen).moves().length;

    let classification: Classification;
    if (legalMoves === 1) classification = 'forced';
    else if (isBest || loss < 1) classification = 'best';
    else if (loss < 2.5) classification = 'excellent';
    else if (loss < 5) classification = 'good';
    else if (loss < 10) classification = 'inaccuracy';
    else if (loss < 20) classification = 'mistake';
    else classification = 'blunder';

    if (classification === 'best' || classification === 'excellent') {
      if (winAfter >= 45 && winBefore < 97 && isSacrifice(move)) {
        classification = 'brilliant';
      } else if (isBest && before.lines.length > 1) {
        const second = toMover(winPercent(before.lines[1].score));
        if (winAfter - second >= 20 && winBefore < 90) classification = 'great';
      }
    }

    // Failing to punish the opponent's error.
    const prev = moves[i - 1];
    if (
      (classification === 'mistake' || classification === 'blunder') &&
      prev &&
      ['mistake', 'blunder', 'miss'].includes(prev.classification) &&
      winAfter >= 30
    ) {
      classification = 'miss';
    }

    const accuracy = moveAccuracy(loss);
    if (classification !== 'forced') accs[color].push(accuracy);
    counts[color][classification]++;

    moves.push({
      ply: i + 1,
      san: move.san,
      uci,
      from: move.from,
      to: move.to,
      color,
      fenBefore: before.fen,
      fenAfter: after.fen,
      classification,
      accuracy,
      winBefore,
      winAfter,
      bestUci: before.bestMove,
      bestSan: uciToSan(before.fen, before.bestMove),
    });
  });

  return { moves, accuracy: { w: gameAccuracy(accs.w), b: gameAccuracy(accs.b) }, counts };
}

/** Blend of arithmetic and harmonic mean, so a few blunders weigh heavily. */
export function gameAccuracy(values: number[]): number {
  if (!values.length) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const harmonic = values.length / values.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return (mean + harmonic) / 2;
}
