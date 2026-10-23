import { useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Insights } from './components/Insights';
import { Review } from './components/Review';
import type { GameSummary, Site } from './lib/api';

type View = { kind: 'review'; game: GameSummary; viewer?: string } | { kind: 'insights'; site: Site; username: string };

export default function App() {
  const [view, setView] = useState<View | null>(null);

  // Keep the browser/phone back button in sync with the open screen.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.view) setView(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function open(v: View) {
    history.pushState({ view: true }, '');
    setView(v);
    window.scrollTo(0, 0);
  }

  function close() {
    setView(null);
    if (history.state?.view) history.back();
  }

  return (
    <>
      <main className={view?.kind === 'review' ? 'reviewing' : undefined}>
        <div hidden={!!view}>
          <Home
            onOpen={(game, viewer) => open({ kind: 'review', game, viewer })}
            onInsights={(site, username) => open({ kind: 'insights', site, username })}
          />
        </div>
        {view?.kind === 'review' && <Review key={view.game.id} game={view.game} viewer={view.viewer} onBack={close} />}
        {view?.kind === 'insights' && (
          <Insights key={`${view.site}:${view.username}`} site={view.site} username={view.username} onBack={close} />
        )}
      </main>
      <footer className="app-footer">
        Analysis by Stockfish 19 running in your browser. Not affiliated with Chess.com or Lichess.
      </footer>
    </>
  );
}
