# Free Chess Review

A free, Chess.com-style game review for your Chess.com and Lichess games. Everything runs in the
browser: games come straight from the public Chess.com and Lichess APIs, and analysis is done by
Stockfish 19 (WASM, lite single-threaded) on the visitor's device — no backend, no API keys.

## Features

- Load recent games by username from **Chess.com** or **Lichess**, or paste a **PGN** / lichess.org link
- Full-game review: per-move classifications (Brilliant, Great, Best, Excellent, Good, Inaccuracy,
  Mistake, Miss, Blunder), accuracy for both players, evaluation bar and graph
- Best-move arrows for mistakes, and free exploration: drag or tap pieces to try your own lines with
  live engine analysis
- Works on phone and desktop; keyboard shortcuts (← → Home End, `f` to flip)
- Reviews are cached in the browser so reopening a game is instant

## Development

```bash
npm install
npm run dev
```

## Deploying to Vercel

The app is a static Vite build (`vercel.json` is included). Either import the GitHub repo at
<https://vercel.com/new> (framework preset: Vite — detected automatically), or from the CLI:

```bash
npm i -g vercel
vercel --prod
```

The Stockfish engine files live in `public/engine/` (copied from the `stockfish` npm package).
