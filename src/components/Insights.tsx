import { useMemo } from 'react';
import type { Site } from '../lib/api';
import { aggregate, LOW_TIME_SHARE, TACTIC_GAP, WINNING, type OpeningRow, type Record3 } from '../lib/insights';
import { formatSeconds, PHASES } from '../lib/stats';
import { useInsights } from '../lib/useInsights';
import { Icon } from './Icon';

const SITE_NAME: Record<Site, string> = { chesscom: 'Chess.com', lichess: 'Lichess' };

function pct(n: number, of: number) {
  return of ? `${Math.round((n / of) * 100)}%` : '–';
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function Insights({ site, username, onBack }: { site: Site; username: string; onBack: () => void }) {
  const state = useInsights(site, username);
  const data = useMemo(() => (state.digests.length ? aggregate(state.digests) : null), [state.digests]);

  return (
    <div className="insights">
      <div>
        <button className="link" onClick={onBack}>
          <Icon name="back" size={16} /> Games
        </button>
      </div>
      <section className="hero">
        <h1>Insights</h1>
        <p>
          {username} · {state.total ? `last ${state.total} games` : 'recent games'} on {SITE_NAME[site]}
        </p>
      </section>

      {state.status === 'loading' && <div className="card muted">Loading games…</div>}
      {state.status === 'error' && <p className="error">{state.error}</p>}
      {state.status === 'done' && !state.total && <p className="muted center">No recent standard games found.</p>}
      {state.status === 'analyzing' && (
        <div className="card insight-progress">
          <div className="insight-progress-head">
            <span>
              Analyzing game {state.analyzed + 1} of {state.total}
            </span>
            <span className="muted">{pct(state.analyzed + state.current, state.total)}</span>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${((state.analyzed + state.current) / state.total) * 100}%` }} />
          </div>
          <span className="muted small">
            Stockfish runs on your device, so keep this page open. Progress is saved, and stats update as games finish.
          </span>
        </div>
      )}

      {data && (
        <>
          <div className="card">
            <div className="tiles">
              <Tile value={data.accuracy.toFixed(1)} label="Avg accuracy" />
              <Tile value={Math.round(data.acpl).toString()} label="Avg centipawn loss" />
              <Tile value={data.games.toString()} label="Games analysed" />
            </div>
            <ResultBar r={data.results} />
            <div className="insight-rows">
              <ResultRow label="As White" r={data.byColor.w} />
              <ResultRow label="As Black" r={data.byColor.b} />
            </div>
          </div>

          <Section title="Tactics">
            <Metric
              label="Tactics found"
              value={pct(data.tacticsFound, data.tacticChances)}
              sub={`${data.tacticsFound} of ${data.tacticChances}`}
              bar={data.tacticChances ? data.tacticsFound / data.tacticChances : undefined}
              note={`Positions where one move was at least ${TACTIC_GAP}% better than any other, and you played it.`}
            />
            <Metric
              label="Punished mistakes"
              value={pct(data.punished, data.punishChances)}
              sub={`${data.punished} of ${data.punishChances}`}
              bar={data.punishChances ? data.punished / data.punishChances : undefined}
              note="After an opponent's mistake or blunder, you replied with a good or better move."
            />
            <Metric label="Blunders per game" value={data.blundersPerGame.toFixed(1)} />
            <Metric label="Mistakes per game" value={data.mistakesPerGame.toFixed(1)} />
          </Section>

          <Section title="Accuracy by phase">
            {PHASES.map((p) => (
              <Metric
                key={p}
                label={capitalize(p)}
                value={data.phase[p] === null ? '–' : data.phase[p]!.toFixed(1)}
                bar={data.phase[p] === null ? undefined : data.phase[p]! / 100}
              />
            ))}
            <p className="note">
              Opening ends after move 10 or once 4 pieces are traded; endgame starts at 6 or fewer pieces (not counting
              pawns and kings).
            </p>
          </Section>

          <Section title="Winning and losing positions">
            <Metric
              label="Converted winning positions"
              value={pct(data.winningWon, data.winningGames)}
              sub={`won ${data.winningWon} of ${data.winningGames}`}
              bar={data.winningGames ? data.winningWon / data.winningGames : undefined}
              note={`Games where your winning chance reached ${WINNING}%.`}
            />
            <Metric
              label="Saved losing positions"
              value={pct(data.losingSaved, data.losingGames)}
              sub={`drew or won ${data.losingSaved} of ${data.losingGames}`}
              bar={data.losingGames ? data.losingSaved / data.losingGames : undefined}
              note={`Games where your winning chance fell to ${100 - WINNING}%.`}
            />
          </Section>

          {data.clock && (
            <Section title="Time management">
              <Metric label="Avg time per move" value={formatSeconds(data.clock.avgTime)} />
              <Metric
                label="Got low on time"
                value={pct(data.clock.wentLow, data.clock.games)}
                sub={`${data.clock.wentLow} of ${data.clock.games} games`}
                note={`Under ${LOW_TIME_SHARE * 100}% of your starting clock.`}
              />
              {data.clock.lowAcc !== null && data.clock.normalAcc !== null && (
                <>
                  <Metric label="Accuracy with time" value={data.clock.normalAcc.toFixed(1)} />
                  <Metric label="Accuracy when low on time" value={data.clock.lowAcc.toFixed(1)} />
                </>
              )}
            </Section>
          )}

          {(data.openings.w.length > 0 || data.openings.b.length > 0) && (
            <Section title="Openings">
              <OpeningList title="As White" rows={data.openings.w} />
              <OpeningList title="As Black" rows={data.openings.b} />
            </Section>
          )}

          {data.byTimeClass.length > 1 && (
            <Section title="By time control">
              <div className="opening-row head">
                <span />
                <span>Games</span>
                <span>W / D / L</span>
                <span className="opening-acc">Acc</span>
              </div>
              {data.byTimeClass.map((t) => (
                <div className="opening-row" key={t.name}>
                  <span className="opening-name">{capitalize(t.name)}</span>
                  <span className="muted small">{t.games}</span>
                  <MiniBar r={t} />
                  <span className="opening-acc">{t.accuracy.toFixed(1)}</span>
                </div>
              ))}
            </Section>
          )}

          {data.trend.length > 1 && (
            <Section title="Accuracy over time">
              <Trend points={data.trend.map((t) => t.accuracy)} />
              <p className="note">One point per game, oldest on the left. The dashed line is your average.</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card insight-section">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  );
}

function Metric({ label, value, sub, note, bar }: { label: string; value: string; sub?: string; note?: string; bar?: number }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <span className="metric-value">
          {sub && <span className="muted small">{sub} </span>}
          {value}
        </span>
      </div>
      {bar !== undefined && (
        <div className="progress-bar">
          <div style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }} />
        </div>
      )}
      {note && <span className="note">{note}</span>}
    </div>
  );
}

function ResultBar({ r }: { r: Record3 }) {
  const total = r.win + r.draw + r.loss;
  if (!total) return null;
  return (
    <div className="result-summary">
      <div className="result-bar">
        <div className="win" style={{ flex: r.win }} />
        <div className="draw" style={{ flex: r.draw }} />
        <div className="loss" style={{ flex: r.loss }} />
      </div>
      <div className="result-legend">
        <span>
          <b>{r.win}</b> won · {pct(r.win, total)}
        </span>
        <span>
          <b>{r.draw}</b> drawn
        </span>
        <span>
          <b>{r.loss}</b> lost
        </span>
      </div>
    </div>
  );
}

function MiniBar({ r }: { r: Record3 }) {
  return (
    <span className="result-bar mini" title={`${r.win} won, ${r.draw} drawn, ${r.loss} lost`}>
      <span className="win" style={{ flex: r.win }} />
      <span className="draw" style={{ flex: r.draw }} />
      <span className="loss" style={{ flex: r.loss }} />
    </span>
  );
}

function ResultRow({ label, r }: { label: string; r: Record3 }) {
  const total = r.win + r.draw + r.loss;
  return (
    <div className="opening-row">
      <span className="opening-name">{label}</span>
      <span className="muted small">
        {r.win}/{r.draw}/{r.loss}
      </span>
      <MiniBar r={r} />
      <span className="opening-acc">{pct(r.win, total)}</span>
    </div>
  );
}

function OpeningList({ title, rows }: { title: string; rows: OpeningRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="opening-list">
      <div className="opening-row head">
        <span className="opening-name">{title}</span>
        <span>Games</span>
        <span>W / D / L</span>
        <span className="opening-acc">Acc</span>
      </div>
      {rows.map((o) => (
        <div className="opening-row" key={o.name}>
          <span className="opening-name">{o.name}</span>
          <span className="muted small">{o.games}</span>
          <MiniBar r={o} />
          <span className="opening-acc">{o.accuracy.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function Trend({ points }: { points: number[] }) {
  const w = 300;
  const h = 90;
  const min = Math.max(0, Math.floor((Math.min(...points) - 5) / 10) * 10);
  const y = (v: number) => h - ((v - min) / (100 - min)) * h;
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  return (
    <svg className="trend" viewBox={`-4 -4 ${w + 8} ${h + 8}`} preserveAspectRatio="none" role="img" aria-label="Accuracy per game">
      <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} className="trend-avg" />
      <polyline points={points.map((p, i) => `${x(i)},${y(p)}`).join(' ')} className="trend-line" />
    </svg>
  );
}
