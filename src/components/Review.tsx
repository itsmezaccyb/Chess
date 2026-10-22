import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Move, type Square } from 'chess.js';
import type { GameSummary } from '../lib/api';
import {
  CLASS_INFO,
  CLASS_ORDER,
  evalOf,
  formatScore,
  parseGame,
  reviewGame,
  type MoveReview,
  type PositionEval,
} from '../lib/analysis';
import { useLiveAnalysis, useReview } from '../lib/useReview';
import { Badge } from './Badge';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';

const DEPTHS = [
  { value: 12, label: 'Fast' },
  { value: 15, label: 'Standard' },
  { value: 18, label: 'Deep' },
];

const GOOD_MOVES = new Set(['brilliant', 'great', 'best', 'forced']);

function savedDepth() {
  try {
    const d = Number(localStorage.getItem('review:depth'));
    if (DEPTHS.some((x) => x.value === d)) return d;
  } catch {
    // ignore
  }
  return 15;
}

function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

function moveNumberPrefix(fen: string) {
  const [, turn, , , , full] = fen.split(' ');
  return turn === 'w' ? `${full}.` : `${full}…`;
}

interface Variation {
  base: number;
  moves: Move[];
}

export function Review({ game, viewer, onBack }: { game: GameSummary; viewer?: string; onBack: () => void }) {
  const parsed = useMemo(() => parseGame(game.pgn), [game.pgn]);
  const total = parsed.history.length;
  const [depth, setDepth] = useState(savedDepth);
  const { evals, done } = useReview(game.id, parsed.fens, depth);
  const review = useMemo(() => (done ? reviewGame(parsed.history, evals) : null), [done, evals, parsed.history]);

  const viewerIsBlack = !!viewer && game.black.name.toLowerCase() === viewer.toLowerCase();
  const [flipped, setFlipped] = useState(viewerIsBlack);
  const [nav, setNav] = useState<{ ply: number; variation: Variation | null }>({ ply: 0, variation: null });
  const { ply, variation } = nav;
  const [selected, setSelected] = useState<Square | null>(null);

  const fen = variation
    ? variation.moves.length
      ? variation.moves[variation.moves.length - 1].after
      : parsed.fens[variation.base]
    : parsed.fens[ply];
  const live = useLiveAnalysis(variation ? fen : null);
  const posEval: PositionEval | null = variation ? live : (evals[ply] ?? null);
  const score = posEval ? evalOf(posEval) : null;
  const current: MoveReview | null = !variation && ply > 0 && review ? review.moves[ply - 1] : null;

  const goTo = useCallback(
    (p: number) => {
      setSelected(null);
      setNav({ ply: Math.max(0, Math.min(total, p)), variation: null });
    },
    [total],
  );

  // Functional updates so rapid key presses never act on stale state.
  const back = useCallback(() => {
    setSelected(null);
    setNav(({ ply, variation }) => {
      if (!variation) return { ply: Math.max(0, ply - 1), variation: null };
      if (!variation.moves.length) return { ply: variation.base, variation: null };
      return { ply, variation: { ...variation, moves: variation.moves.slice(0, -1) } };
    });
  }, []);

  const forward = useCallback(() => {
    setSelected(null);
    setNav((n) => (n.variation ? n : { ply: Math.min(total, n.ply + 1), variation: null }));
  }, [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') back();
      else if (e.key === 'ArrowRight') forward();
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(total);
      else if (e.key === 'f') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, forward, goTo, total]);

  function tryMove(from: Square, to: Square): boolean {
    const chess = new Chess(fen);
    let move: Move;
    try {
      move = chess.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    setSelected(null);
    if (!variation && ply < total && parsed.history[ply].lan === move.lan) {
      setNav({ ply: ply + 1, variation: null });
      return true;
    }
    setNav({
      ply,
      variation: variation ? { ...variation, moves: [...variation.moves, move] } : { base: ply, moves: [move] },
    });
    return true;
  }

  function onSquareClick({ square }: { square: string }) {
    const sq = square as Square;
    const chess = new Chess(fen);
    if (selected && selected !== sq && tryMove(selected, sq)) return;
    const piece = chess.get(sq);
    setSelected(piece && piece.color === chess.turn() && selected !== sq ? sq : null);
  }

  // Board decorations
  const squareStyles: Record<string, React.CSSProperties> = {};
  const lastMove = variation
    ? variation.moves[variation.moves.length - 1]
    : ply > 0
      ? parsed.history[ply - 1]
      : null;
  const highlight = current ? CLASS_INFO[current.classification].color : '#f5f682';
  if (lastMove) {
    squareStyles[lastMove.from] = { background: `${highlight}80` };
    squareStyles[lastMove.to] = { background: `${highlight}a0` };
  }
  if (selected) {
    squareStyles[selected] = { background: 'rgba(20, 85, 30, 0.5)' };
    for (const m of new Chess(fen).moves({ square: selected, verbose: true })) {
      squareStyles[m.to] = {
        ...squareStyles[m.to],
        backgroundImage: m.captured
          ? 'radial-gradient(transparent 58%, rgba(0,0,0,.2) 60%)'
          : 'radial-gradient(rgba(0,0,0,.2) 20%, transparent 22%)',
      };
    }
  }

  const arrows = [];
  if (current && current.bestUci && !GOOD_MOVES.has(current.classification) && current.bestUci !== current.uci) {
    arrows.push({ startSquare: current.bestUci.slice(0, 2), endSquare: current.bestUci.slice(2, 4), color: 'rgba(129,182,76,0.85)' });
  }
  if (variation && live?.bestMove) {
    arrows.push({ startSquare: live.bestMove.slice(0, 2), endSquare: live.bestMove.slice(2, 4), color: 'rgba(92,139,176,0.85)' });
  }

  const badgeSquare = current?.to;
  const squareRenderer = ({ square, children }: { square: string; children?: React.ReactNode }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
      {children}
      {square === badgeSquare && current && (
        <span className="board-badge">
          <Badge c={current.classification} size={22} />
        </span>
      )}
    </div>
  );

  const top = flipped ? 'w' : 'b';
  const players = { w: game.white, b: game.black };
  const player = (c: 'w' | 'b') => (
    <div className="player-strip">
      <span className={`dot ${c === 'w' ? 'white' : 'black'}`} />
      <span className="name">{players[c].name}</span>
      {players[c].rating ? <span className="rating">({players[c].rating})</span> : null}
      {review && <span className="acc-pill">{review.accuracy[c].toFixed(1)}</span>}
    </div>
  );

  const pvLine = posEval?.lines[0] ? pvToSan(posEval.fen, posEval.lines[0].pv) : [];

  return (
    <div className="review">
      <div className="board-col">
        <div className="review-top">
          <button className="link" onClick={onBack}>
            ← Games
          </button>
          {game.url && (
            <a className="link" href={game.url} target="_blank" rel="noreferrer">
              View on {game.site === 'lichess' ? 'Lichess' : 'Chess.com'} ↗
            </a>
          )}
        </div>
        {player(top)}
        <div className="board-row">
          <EvalBar score={score} fen={fen} flipped={flipped} />
          <div className="board">
            <Chessboard
              options={{
                id: 'review-board',
                position: fen,
                boardOrientation: flipped ? 'black' : 'white',
                onPieceDrop: ({ sourceSquare, targetSquare }) =>
                  !!targetSquare && tryMove(sourceSquare as Square, targetSquare as Square),
                onSquareClick,
                arrows,
                squareStyles,
                squareRenderer,
                allowDrawingArrows: true,
                animationDurationInMs: 150,
                darkSquareStyle: { backgroundColor: '#739552' },
                lightSquareStyle: { backgroundColor: '#ebecd0' },
              }}
            />
          </div>
        </div>
        {player(top === 'w' ? 'b' : 'w')}
        <div className="controls">
          <button onClick={() => goTo(0)} aria-label="First move">⏮</button>
          <button onClick={back} aria-label="Previous move">◀</button>
          <button onClick={forward} aria-label="Next move" disabled={!!variation}>▶</button>
          <button onClick={() => goTo(total)} aria-label="Last move">⏭</button>
          <button onClick={() => setFlipped((f) => !f)} aria-label="Flip board">⇅</button>
        </div>
      </div>

      <div className="side-col">
        <div className="card move-card">
          {!done ? (
            <div className="progress">
              <div className="progress-text">
                Analyzing… {Math.min(evals.length, total + 1)}/{total + 1} positions
              </div>
              <div className="progress-bar">
                <div style={{ width: `${(evals.length / (total + 1)) * 100}%` }} />
              </div>
            </div>
          ) : variation ? (
            <div className="move-headline">
              <span>Exploring a line</span>
              <button className="secondary small" onClick={() => goTo(variation.base)}>
                Back to game
              </button>
            </div>
          ) : current ? (
            <div className="move-headline">
              <Badge c={current.classification} size={24} />
              <span>
                <b>{current.san}</b> is {current.classification === 'excellent' || current.classification === 'inaccuracy' ? 'an' : 'a'}{' '}
                {CLASS_INFO[current.classification].label.toLowerCase()}
                {current.classification === 'best' ? ' move' : ''}
                {current.classification === 'miss' ? ' — the opponent’s error went unpunished' : ''}
              </span>
            </div>
          ) : (
            <div className="move-headline">
              <span>Starting position{parsed.headers.Opening ? ` · ${parsed.headers.Opening}` : ''}</span>
            </div>
          )}
          {current && current.bestSan && !GOOD_MOVES.has(current.classification) && current.bestUci !== current.uci && (
            <div className="best-line">
              Best was <b>{current.bestSan}</b>
            </div>
          )}
          {variation && (
            <div className="variation">
              {variation.moves.map((m, i) => (
                <span key={i}>
                  {(m.color === 'w' || i === 0) && <span className="muted">{moveNumberPrefix(m.before)} </span>}
                  {m.san}{' '}
                </span>
              ))}
            </div>
          )}
          {posEval && (
            <div className="engine-line">
              <span className="score">{score ? formatScore(score, posEval.fen) : ''}</span>
              <span className="pv">
                {pvLine.length > 0 && <span className="muted">{moveNumberPrefix(posEval.fen)} </span>}
                {pvLine.join(' ')}
              </span>
              <span className="depth">d{posEval.lines[0]?.depth ?? 0}</span>
            </div>
          )}
        </div>

        <div className="card">
          <EvalGraph evals={evals} moves={review?.moves ?? null} total={total} ply={variation ? variation.base : ply} onSelect={goTo} />
        </div>

        <MoveList history={parsed.history} review={review?.moves ?? null} ply={variation ? -1 : ply} onSelect={goTo} />

        {review && (
          <div className="card summary">
            <div className="summary-head">
              <span>{game.white.name}</span>
              <span />
              <span>{game.black.name}</span>
            </div>
            <div className="summary-row accuracy">
              <span className="acc">{review.accuracy.w.toFixed(1)}</span>
              <span className="label">Accuracy</span>
              <span className="acc">{review.accuracy.b.toFixed(1)}</span>
            </div>
            {CLASS_ORDER.map((c) => (
              <div className="summary-row" key={c}>
                <span className="count" style={{ color: CLASS_INFO[c].color }}>
                  {review.counts.w[c]}
                </span>
                <span className="label">
                  <Badge c={c} size={16} /> {CLASS_INFO[c].label}
                </span>
                <span className="count" style={{ color: CLASS_INFO[c].color }}>
                  {review.counts.b[c]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="card depth-card">
          <span className="muted">Engine depth</span>
          <div className="seg">
            {DEPTHS.map((d) => (
              <button
                key={d.value}
                className={depth === d.value ? 'active' : ''}
                onClick={() => {
                  setDepth(d.value);
                  try {
                    localStorage.setItem('review:depth', String(d.value));
                  } catch {
                    // ignore
                  }
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveList({
  history,
  review,
  ply,
  onSelect,
}: {
  history: Move[];
  review: MoveReview[] | null;
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = ref.current;
    const active = list?.querySelector<HTMLElement>('.mv.active');
    if (!list || !active) return;
    const top = active.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - active.offsetHeight) {
      list.scrollTop = top - list.clientHeight / 2;
    }
  }, [ply]);

  const rows = [];
  const offset = history[0]?.color === 'b' ? 1 : 0;
  for (let i = -offset; i < history.length; i += 2) {
    const cell = (idx: number) => {
      const m = history[idx];
      if (!m) return <span className="mv empty" />;
      const r = review?.[idx];
      return (
        <button className={`mv ${ply === idx + 1 ? 'active' : ''}`} onClick={() => onSelect(idx + 1)}>
          {r && <Badge c={r.classification} size={14} />}
          {m.san}
        </button>
      );
    };
    const num = history[Math.max(i, 0)].before.split(' ')[5];
    rows.push(
      <div className="move-row" key={i}>
        <span className="num">{num}.</span>
        {cell(i)}
        {cell(i + 1)}
      </div>,
    );
  }

  return (
    <div className="card move-list" ref={ref}>
      {rows.length ? rows : <span className="muted">No moves</span>}
    </div>
  );
}
