import type { Level, Puzzle, PuzzleId, Source } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';

const KEY = {
  settings: 'ks:v1:settings',
  history: 'ks:v1:history',
  save: 'ks:v1:save',
  cache: 'ks:v1:cache',
} as const;

/** How many random puzzles each level offers. Generation is unlimited; this
 *  just bounds the picker list so "unplayed puzzles" stays a meaningful set.
 *  Fixed levels use however many the imported pack holds. */
export const RANDOM_POOL_SIZE = 300;

export interface Settings {
  /** When on, a tapped digit is always a candidate — entries need a long-click. */
  allowSingleCandidates: boolean;
  /** Pre-fill candidates for cages that have only one possible combination. */
  lazyMode: boolean;
  nightColors: boolean;
  /** Tint the selected cell's row, column and box. */
  highlightPeers: boolean;
  /** Tint the selected cell's cage. */
  highlightCage: boolean;
  /** Tint other cells holding the same digit as the selected one. */
  highlightSameDigit: boolean;
  /** Forcing an answer strikes that digit from its row, column and box marks. */
  autoRemoveCandidates: boolean;
  /** How solid the sum calculator sits over the grid, 0.35 to 1. */
  calcOpacity: number;
  hintNeedsLongClick: boolean;
  undoNeedsLongClick: boolean;
  clearNeedsLongClick: boolean;
  showTimer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  allowSingleCandidates: false,
  lazyMode: false,
  nightColors: true,
  highlightPeers: true,
  highlightCage: true,
  highlightSameDigit: true,
  autoRemoveCandidates: true,
  calcOpacity: 0.82,
  hintNeedsLongClick: false,
  undoNeedsLongClick: false,
  clearNeedsLongClick: true,
  showTimer: true,
};

export interface PuzzleRecord {
  finished: boolean;
  /** Playable again even though it has been started. */
  released: boolean;
  bestMs?: number;
  bestAt?: number;
  hints?: number;
  checks?: number;
}

export type History = Record<string, PuzzleRecord>;

export interface SavedGame {
  id: PuzzleId;
  puzzle: Puzzle;
  values: number[];
  pencils: number[];
  elapsedMs: number;
  hints: number;
  checks: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota — the game still plays, it just forgets.
  }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read(KEY.settings, {}) });
export const saveSettings = (s: Settings): void => write(KEY.settings, s);

export const loadHistory = (): History => read<History>(KEY.history, {});
export const saveHistory = (h: History): void => write(KEY.history, h);

export const loadSave = (): SavedGame | null => read<SavedGame | null>(KEY.save, null);
export const saveGame = (g: SavedGame): void => write(KEY.save, g);
export const clearSave = (): void => localStorage.removeItem(KEY.save);

/** True if the puzzle has been started and not released for replay. */
export function isLocked(history: History, id: PuzzleId): boolean {
  const rec = history[formatPuzzleId(id)];
  return rec !== undefined && !rec.released;
}

export function unplayedNumbers(
  history: History,
  level: Level,
  source: Source,
  poolSize: number,
): number[] {
  const out: number[] = [];
  for (let n = 1; n <= poolSize; n++) {
    if (!isLocked(history, { level, number: n, source })) out.push(n);
  }
  return out;
}

export interface LevelStats {
  played: number;
  finished: number;
  averageMs: number | null;
}

export function levelStats(
  history: History,
  level: Level,
  source: Source,
  poolSize: number,
): LevelStats {
  let played = 0;
  let finished = 0;
  let total = 0;
  for (let n = 1; n <= poolSize; n++) {
    const rec = history[formatPuzzleId({ level, number: n, source })];
    if (!rec) continue;
    played++;
    if (rec.finished && rec.bestMs !== undefined) {
      finished++;
      total += rec.bestMs;
    }
  }
  return { played, finished, averageMs: finished > 0 ? Math.round(total / finished) : null };
}

/** Mark a puzzle as started, so it drops out of the unplayed list. */
export function markStarted(history: History, id: PuzzleId): History {
  const key = formatPuzzleId(id);
  if (!history[key]) history[key] = { finished: false, released: false };
  else history[key] = { ...history[key], released: false };
  return history;
}

/** Record a finish, keeping the best time and the stats that went with it. */
export function markFinished(
  history: History,
  id: PuzzleId,
  ms: number,
  hints: number,
  checks: number,
  now: number,
): History {
  const key = formatPuzzleId(id);
  const rec = history[key] ?? { finished: false, released: false };
  if (rec.bestMs === undefined || ms < rec.bestMs) {
    history[key] = { ...rec, finished: true, released: false, bestMs: ms, bestAt: now, hints, checks };
  } else {
    history[key] = { ...rec, finished: true, released: false };
  }
  return history;
}

export function releasePuzzle(history: History, id: PuzzleId): History {
  const key = formatPuzzleId(id);
  if (history[key]) history[key] = { ...history[key], released: true };
  return history;
}

export function resetLevel(
  history: History,
  level: Level,
  source: Source,
  poolSize: number,
): History {
  for (let n = 1; n <= poolSize; n++) {
    delete history[formatPuzzleId({ level, number: n, source })];
  }
  return history;
}

/** Generated puzzles are deterministic but slow to rebuild, so keep recent ones. */
const CACHE_LIMIT = 40;
type Cache = Record<string, Puzzle>;

export function cachedPuzzle(id: PuzzleId): Puzzle | null {
  return read<Cache>(KEY.cache, {})[formatPuzzleId(id)] ?? null;
}

export function cachePuzzle(id: PuzzleId, puzzle: Puzzle): void {
  const cache = read<Cache>(KEY.cache, {});
  const keys = Object.keys(cache);
  if (keys.length >= CACHE_LIMIT) delete cache[keys[0]];
  cache[formatPuzzleId(id)] = puzzle;
  write(KEY.cache, cache);
}
