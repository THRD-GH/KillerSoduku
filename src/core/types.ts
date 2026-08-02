/** Difficulty is a 1..6 star level, as in the Classic ladder. */
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
 * Where a puzzle comes from. 'classic' plays the curated, hand-picked
 * grids, 'new' generates one. Both are numbered per level and both are
 * reproducible, so the two pools are tracked separately.
 */
export type Source = 'classic' | 'new';

export const SOURCES: Source[] = ['classic', 'new'];

export const SOURCE_LABELS: Record<Source, string> = { classic: 'Classic', new: 'New' };

export const sourceLabel = (source: Source): string => SOURCE_LABELS[source];

/** Stable puzzle identifier, displayed as "3-10" classic or "3-N10" new. */
export interface PuzzleId {
  level: Level;
  number: number;
  source: Source;
}

export const formatPuzzleId = (id: PuzzleId): string =>
  `${id.level}-${id.source === 'new' ? 'N' : ''}${id.number}`;
