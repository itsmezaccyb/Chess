import { CLASS_INFO, winPercent, type MoveReview, type PositionEval, evalOf } from '../lib/analysis';

const HIGHLIGHT = new Set(['brilliant', 'great', 'mistake', 'miss', 'blunder']);

export function EvalGraph({
  evals,
  moves,
  total,
  ply,
  onSelect,
}: {
  evals: PositionEval[];
  moves: MoveReview[] | null;
  total: number;
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const w = Math.max(total, 1);
  const pts = evals.map((e, i) => [i, 100 - winPercent(evalOf(e), e.fen)] as const);
  const area = pts.length ? `M0,100 ${pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${pts[pts.length - 1][0]},100 Z` : '';

  function handle(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * w);
    onSelect(Math.max(0, Math.min(total, x)));
  }

  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${w} 100`}
      preserveAspectRatio="none"
      onPointerDown={handle}
      onPointerMove={(e) => e.buttons === 1 && handle(e)}
      role="img"
      aria-label="Evaluation graph"
    >
      <rect x="0" y="0" width={w} height="100" className="graph-bg" />
      <path d={area} className="graph-area" />
      <line x1="0" x2={w} y1="50" y2="50" className="graph-mid" vectorEffect="non-scaling-stroke" />
      <line x1={ply} x2={ply} y1="0" y2="100" className="graph-cursor" vectorEffect="non-scaling-stroke" />
      {moves
        ?.filter((m) => HIGHLIGHT.has(m.classification))
        .map((m) => (
          <line
            key={m.ply}
            x1={m.ply}
            x2={m.ply}
            y1={pts[m.ply]?.[1] ?? 50}
            y2={pts[m.ply]?.[1] ?? 50}
            stroke={CLASS_INFO[m.classification].color}
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}
