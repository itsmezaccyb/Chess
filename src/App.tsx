import { useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Icon } from './components/Icon';
import { Review } from './components/Review';
import type { GameSummary } from './lib/api';

export default function App() {
  const [open, setOpen] = useState<{ game: GameSummary; viewer?: string } | null>(null);

  // Keep the browser/phone back button in sync with the review screen.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.review) setOpen(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function openGame(game: GameSummary, viewer?: string) {
    history.pushState({ review: true }, '');
    setOpen({ game, viewer });
    window.scrollTo(0, 0);
  }

  function closeGame() {
    setOpen(null);
    if (history.state?.review) history.back();
  }

  return (
    <>
      <header className="app-header">
        <button className="brand" onClick={() => open && closeGame()}>
          <span className="logo">
            <Icon name="logo" size={18} />
          </span> Free Chess Review
        </button>
      </header>
      <main>
        <div hidden={!!open}>
          <Home onOpen={openGame} />
        </div>
        {open && <Review key={open.game.id} game={open.game} viewer={open.viewer} onBack={closeGame} />}
      </main>
      <footer className="app-footer">
        Analysis by Stockfish 19 running in your browser. Not affiliated with Chess.com or Lichess.
      </footer>
    </>
  );
}
