/** Difficulty is a 1..6 star level, as in the reference app's ladder. */
export type Level = 1 | 2 | 3 | 4 | 5 | 6;

export interface Cage {
  /** Cell indices 0..80, ascending. cells[0] is the label cell (top-left-most). */
  cells: number[];
  sum: number;
}

export interface Puzzle {
  cages: Cage[];
  /** 81 digits, 1..9 — the unique solution. */
  solution: number[];
  /** Level this puzzle was generated for. */
  difficulty: Level;
  seed: number;
  /** Branch points needed by the basic-technique solver; the difficulty metric. */
  rating: number;
}

/**
 * Where a puzzle comes from. 'fixed' plays the reference app's shipped grids,
 * 'random' generates a fresh one. Both are numbered per level and both are
 * reproducible, so the two pools are tracked separately.
 */
export type Source = 'fixed' | 'random';

export const SOURCES: Source[] = ['fixed', 'random'];

/**
 * What the pools are called on screen. The stored values stay 'fixed' and
 * 'random' — they key the history and the pack files, so renaming them would
 * orphan every record.
 */
export const SOURCE_LABELS: Record<Source, string> = { fixed: 'Classic', random: 'New' };

export const sourceLabel = (source: Source): string => SOURCE_LABELS[source];

/** Stable puzzle identifier, displayed as "3-10" fixed or "3-R10" random. */
export interface PuzzleId {
  level: Level;
  number: number;
  source: Source;
}

export const formatPuzzleId = (id: PuzzleId): string =>
  `${id.level}-${id.source === 'random' ? 'R' : ''}${id.number}`;
