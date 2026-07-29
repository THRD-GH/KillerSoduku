import type { Level, Puzzle, PuzzleId, Source } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';

const KEY = {
  settings: 'ks:v1:settings',
  history: 'ks:v1:history',
  save: 'ks:v1:save',
  cache: 'ks:v1:cache',
} as const;

/** How many New puzzles each level offers. Generation is unlimited; this just
 *  bounds the picker list so "unplayed puzzles" stays a meaningful set.
 *  Classic levels use however many the imported pack holds. */
export const NEW_POOL_SIZE = 500;

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
  /** When it was first opened, so unfinished games can be listed newest first. */
  startedAt?: number;
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
  /** Undo and redo stacks, so they survive putting the puzzle down. */
  past?: number[][];
  future?: number[][];
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

/**
 * The generated pool was once called 'random' and keyed "3-R10"; it is now
 * 'new' and "3-N10". Records written before the rename are rewritten on load
 * so history, best times and unfinished games all carry over.
 */
function migrate<T extends { id?: PuzzleId }>(value: T): T {
  const source = value.id?.source as string | undefined;
  if (source === 'random') value.id = { ...value.id!, source: 'new' };
  else if (source === 'fixed') value.id = { ...value.id!, source: 'classic' };
  return value;
}

export const loadHistory = (): History => {
  const stored = read<History>(KEY.history, {});
  const out: History = {};
  let renamed = false;
  for (const [key, record] of Object.entries(stored)) {
    const old = /^[1-6]-R\d+$/.test(key);
    renamed ||= old;
    out[old ? key.replace('-R', '-N') : key] = record;
  }
  // Persist at once, so storage never sits in the half-renamed state.
  if (renamed) write(KEY.history, out);
  return out;
};
export const saveHistory = (h: History): void => write(KEY.history, h);

export const loadSave = (): SavedGame | null => {
  const saved = read<SavedGame | null>(KEY.save, null);
  if (saved === null) return null;
  const wasOld = (saved.id.source as string) === 'random' || (saved.id.source as string) === 'fixed';
  const migrated = migrate(saved);
  if (wasOld) write(KEY.save, migrated);
  return migrated;
};
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
export function markStarted(history: History, id: PuzzleId, now = Date.now()): History {
  const key = formatPuzzleId(id);
  if (!history[key]) history[key] = { finished: false, released: false, startedAt: now };
  else history[key] = { ...history[key], released: false, startedAt: history[key].startedAt ?? now };
  return history;
}

/** The inverse of formatPuzzleId: "3-10" or "3-N10". */
export function parsePuzzleId(key: string): PuzzleId | null {
  const match = /^([1-6])-(N?)(\d+)$/.exec(key);
  if (!match) return null;
  return {
    level: Number(match[1]) as Level,
    source: match[2] === 'N' ? 'new' : 'classic',
    number: Number(match[3]),
  };
}

export interface UnfinishedGame {
  id: PuzzleId;
  record: PuzzleRecord;
}

/**
 * Every puzzle opened but never solved, across all levels and both pools,
 * newest first. Read straight off the history keys rather than by scanning
 * level ranges, so it does not depend on the pack sizes being known.
 */
export function unfinishedGames(history: History): UnfinishedGame[] {
  const out: UnfinishedGame[] = [];
  for (const [key, record] of Object.entries(history)) {
    if (record.finished) continue;
    const id = parsePuzzleId(key);
    if (id) out.push({ id, record });
  }
  return out.sort((a, b) => (b.record.startedAt ?? 0) - (a.record.startedAt ?? 0));
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

/**
 * Forget a puzzle entirely: it leaves the history and goes back to being
 * unplayed, so it can turn up again in its pool.
 */
export function forgetPuzzle(history: History, id: PuzzleId): History {
  delete history[formatPuzzleId(id)];
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
