import { formatScore, winPercent } from '../lib/analysis';
import type { Score } from '../lib/engine';

export function EvalBar({ score, fen, flipped }: { score: Score | null; fen: string; flipped: boolean }) {
  const white = score ? winPercent(score, fen) : 50;
  const label = !score
    ? ''
    : score.type === 'mate'
      ? formatScore(score, fen).replace('-', '')
      : (Math.abs(score.value) / 100).toFixed(1);
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`} aria-label={`Evaluation ${label}`}>
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  );
}
