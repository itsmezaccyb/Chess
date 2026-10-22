// Thin wrapper around the Stockfish WASM web worker (UCI protocol).

export type Score = { type: 'cp' | 'mate'; value: number };

export interface EngineLine {
  multipv: number;
  depth: number;
  /** Score from the side-to-move's point of view (raw UCI). */
  score: Score;
  pv: string[];
}

export interface EngineResult {
  lines: EngineLine[];
  bestMove: string | null;
}

const ENGINE_URL = '/engine/stockfish-19-lite-single.js';

function parseInfo(line: string): EngineLine | null {
  const tokens = line.split(' ');
  const get = (key: string) => {
    const i = tokens.indexOf(key);
    return i === -1 ? undefined : tokens[i + 1];
  };
  const pvIndex = tokens.indexOf('pv');
  const scoreIndex = tokens.indexOf('score');
  if (pvIndex === -1 || scoreIndex === -1) return null;
  // Skip bound-only updates; they are not final values for this depth.
  if (tokens[scoreIndex + 3] === 'lowerbound' || tokens[scoreIndex + 3] === 'upperbound') return null;
  return {
    multipv: Number(get('multipv') ?? 1),
    depth: Number(get('depth') ?? 0),
    score: { type: tokens[scoreIndex + 1] as 'cp' | 'mate', value: Number(tokens[scoreIndex + 2]) },
    pv: tokens.slice(pvIndex + 1),
  };
}

export class Engine {
  private worker: Worker;
  private listener: ((line: string) => void) | null = null;
  private queue: Promise<unknown>;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => this.listener?.(String(e.data));
    this.queue = this.send('uci', (l) => l === 'uciok').then(() => this.send('isready', (l) => l === 'readyok'));
  }

  private send(cmd: string, until: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      this.listener = (l) => {
        if (until(l)) {
          this.listener = null;
          resolve();
        }
      };
      this.worker.postMessage(cmd);
    });
  }

  /** Queue a search. Searches run one at a time in call order. */
  analyze(
    fen: string,
    opts: { depth: number; multipv?: number; onUpdate?: (lines: EngineLine[]) => void },
  ): Promise<EngineResult> {
    const run = () =>
      new Promise<EngineResult>((resolve) => {
        const lines = new Map<number, EngineLine>();
        const sorted = () => [...lines.values()].sort((a, b) => a.multipv - b.multipv);
        this.listener = (l) => {
          if (l.startsWith('info ') && l.includes(' pv ')) {
            const parsed = parseInfo(l);
            if (parsed) {
              lines.set(parsed.multipv, parsed);
              opts.onUpdate?.(sorted());
            }
          } else if (l.startsWith('bestmove')) {
            this.listener = null;
            const move = l.split(' ')[1];
            resolve({ lines: sorted(), bestMove: !move || move === '(none)' ? null : move });
          }
        };
        this.worker.postMessage(`setoption name MultiPV value ${opts.multipv ?? 1}`);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${opts.depth}`);
      });
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Ends the current search early; its promise resolves with what it has. */
  stop() {
    this.worker.postMessage('stop');
  }

  newGame() {
    this.worker.postMessage('ucinewgame');
  }

  terminate() {
    this.worker.terminate();
  }
}
