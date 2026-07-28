import { CELLS, NEIGHBOURS, PEERS } from './grid.ts';
import { mulberry32, shuffle } from './rng.ts';
import { buildConstraints, classify, isUnique } from './solver.ts';
import type { Classification } from './solver.ts';
import type { Cage, Level, Puzzle } from './types.ts';

/** Six levels, one to six stars, matching the reference app's ladder. */
export const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Gentle',
  2: 'Easy',
  3: 'Steady',
  4: 'Tricky',
  5: 'Tough',
  6: 'Brutal',
};

interface LevelConfig {
  /** Cage size to merge up to. Sets the puzzle's texture, not its difficulty. */
  targetMean: number;
  /** Share of base cages seeded as triominoes rather than dominoes. */
  triomino: number;
}

/**
 * Cages may run to nine cells, as they do in the reference app's packs. What
 * they may never be is one cell: that is a free given, and those packs contain
 * none at any level.
 */
export const MAX_CAGE_SIZE = 9;
export const MIN_CAGE_SIZE = 2;

/**
 * Measuring the reference app's 5,200 shipped puzzles settled how difficulty
 * actually works there: mean cage size is ~2.85 at *every* level, so the ladder
 * is not built from bigger cages. Grouped by the packs' own internal rating the
 * mean drifts only 2.54 → 3.30, so cage size is texture with a slight lean.
 *
 * Difficulty is therefore cut on what a puzzle *demands* of the solver — see
 * `classify` — and these means simply track the reference distribution so the
 * grids look and feel like theirs.
 */
export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  1: { targetMean: 2.3, triomino: 0.12 },
  2: { targetMean: 2.5, triomino: 0.22 },
  3: { targetMean: 2.7, triomino: 0.34 },
  4: { targetMean: 2.9, triomino: 0.42 },
  5: { targetMean: 3.05, triomino: 0.48 },
  6: { targetMean: 3.25, triomino: 0.55 },
};

/**
 * Collapses a classification into a 0..5 rung, so level N wants score N-1.
 * A puzzle is as hard as the hardest technique it forces; once logic runs out
 * altogether, how much trial and error is left takes over.
 *
 * Thresholds come from sampling the ladder (tools/calibrate.ts spread).
 */
export function difficultyScore(c: Classification): number {
  if (!c.logical) return c.guesses <= 4 ? 4 : 5;
  if (c.hardest <= 3) return 0;
  if (c.hardest === 4) return 1;
  if (c.hardest === 5) return 2;
  return 3;
}

/** A solved grid, produced by shuffled backtracking. */
export function randomSolution(rnd: () => number): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const fill = (i: number): boolean => {
    if (i === CELLS) return true;
    for (const d of shuffle([...digits], rnd)) {
      let ok = true;
      for (const p of PEERS[i]) {
        if (grid[p] === d) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      grid[i] = d;
      if (fill(i + 1)) return true;
      grid[i] = 0;
    }
    return false;
  };

  fill(0);
  return grid;
}

/**
 * Tile the grid with dominoes. Cages this small make the puzzle heavily
 * over-constrained, so the result is nearly always unique — that is the point:
 * a known-good base to merge upward from.
 *
 * A cell with no free partner is folded into an adjacent cage rather than left
 * as a one-cell cage. A single-cell cage is just a given digit, and the
 * reference app's puzzle packs contain none at any level. Returns null when the
 * tiling paints itself into a corner, which is cheaper to retry than repair.
 */
export function seedPartition(
  solution: number[],
  rnd: () => number,
  triominoChance: number,
): number[][] | null {
  const owner = new Int16Array(CELLS).fill(-1);
  const groups: number[][] = [];
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    rnd,
  );

  for (const cell of order) {
    if (owner[cell] !== -1) continue;

    const partners = shuffle([...NEIGHBOURS[cell]], rnd).filter(
      (nb) => owner[nb] === -1 && solution[nb] !== solution[cell],
    );
    if (partners.length > 0) {
      const id = groups.length;
      const cells = [cell, partners[0]];
      owner[cell] = id;
      owner[partners[0]] = id;

      // Pure dominoes merge 2+2 into 4 and never make a 3, which leaves the
      // finished grids short of three-cell cages. Seeding some triominoes puts
      // the size distribution back in line with the reference packs.
      if (rnd() < triominoChance) {
        const digits = new Set(cells.map((c) => solution[c]));
        const third = shuffle(cells.flatMap((c) => [...NEIGHBOURS[c]]), rnd).find(
          (nb) => owner[nb] === -1 && !digits.has(solution[nb]),
        );
        if (third !== undefined) {
          owner[third] = id;
          cells.push(third);
        }
      }

      groups.push(cells);
      continue;
    }

    const hosts = shuffle([...NEIGHBOURS[cell]], rnd)
      .map((nb) => owner[nb])
      .filter(
        (id) =>
          id !== -1 && groups[id].length < 4 && !groups[id].some((c) => solution[c] === solution[cell]),
      );
    if (hosts.length === 0) return null;
    groups[hosts[0]].push(cell);
    owner[cell] = hosts[0];
  }
  return groups;
}

const cageOf = (cells: number[], solution: number[]): Cage => {
  const sorted = [...cells].sort((a, b) => a - b);
  return { cells: sorted, sum: sorted.reduce((t, i) => t + solution[i], 0) };
};

/** Cage pairs that touch, hold no digit in common, and fit the size cap. */
function mergeablePairs(groups: number[][], solution: number[], maxSize: number): [number, number][] {
  const owner = new Int16Array(CELLS).fill(-1);
  groups.forEach((cells, id) => cells.forEach((c) => (owner[c] = id)));

  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  for (let a = 0; a < groups.length; a++) {
    if (groups[a].length === 0) continue;
    for (const cell of groups[a]) {
      for (const nb of NEIGHBOURS[cell]) {
        const b = owner[nb];
        if (b <= a || groups[b].length === 0) continue;
        const key = a * 1000 + b;
        if (seen.has(key)) continue;
        seen.add(key);
        if (groups[a].length + groups[b].length > maxSize) continue;
        const digits = new Set(groups[a].map((c) => solution[c]));
        if (groups[b].some((c) => digits.has(solution[c]))) continue;
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** Search budget for the uniqueness check behind each candidate merge. */
const MERGE_NODE_LIMIT = 4000;

/**
 * Cage-size shares measured across the reference app's 5,200 puzzles.
 * Merging steers towards this shape rather than towards "big" or "small":
 * a plain size bias either starves the middle sizes or never reaches the tail.
 */
const TARGET_SHARE: Record<number, number> = {
  2: 0.515,
  3: 0.265,
  4: 0.12,
  5: 0.06,
  6: 0.02,
  7: 0.01,
  8: 0.003,
  9: 0.001,
};

/** Weight of the shape term against the random term (spread 1) when ordering merges. */
const SHAPE_PULL = 1.6;

export interface LadderStep {
  cages: Cage[];
  meanSize: number;
}

/**
 * Merge cages upward from the domino base, keeping only merges that leave the
 * puzzle uniquely solvable, and record the rating at each rung. One pass
 * produces the whole difficulty ladder for a grid.
 */
export function buildLadder(
  solution: number[],
  rnd: () => number,
  maxCageSize = MAX_CAGE_SIZE,
  stopMean = Infinity,
  triominoChance = 0.35,
): LadderStep[] {
  const ladder: LadderStep[] = [];

  // Merging only ever loosens the puzzle, so the base has to be unique first —
  // roughly one domino tiling in three is, and each check is cheap.
  let groups: number[][] | null = null;
  for (let attempt = 0; attempt < 40 && groups === null; attempt++) {
    const candidate = seedPartition(solution, rnd, triominoChance);
    if (candidate === null) continue;
    const cages = candidate.map((g) => cageOf(g, solution));
    if (isUnique(buildConstraints(cages))) groups = candidate;
  }
  if (groups === null) return ladder;
  const base = groups;

  const liveCount = () => base.reduce((n, g) => n + (g.length > 0 ? 1 : 0), 0);
  const snapshot = () => base.filter((g) => g.length > 0).map((g) => cageOf(g, solution));

  let stale = 0;
  while (stale < 3) {
    const pairs = mergeablePairs(base, solution, maxCageSize);
    if (pairs.length === 0) break;

    // Prefer merges that produce whichever cage size is currently scarcest
    // against the reference shape, so the whole curve is steered rather than
    // just its ends. Shares are taken once per round; within a round the
    // random term keeps the order from becoming rigid.
    const counts = new Map<number, number>();
    let liveCages = 0;
    for (const g of base) {
      if (g.length === 0) continue;
      liveCages++;
      counts.set(g.length, (counts.get(g.length) ?? 0) + 1);
    }
    // Shortfall relative to each size's own target. Weighting by absolute
    // share instead — or even damping by its square root — always favours the
    // common sizes, and the rare large cages are the stepping stones to larger
    // ones, so the tail never gets built: measured runs lost every 9-cell cage
    // and most 6s and 7s. The cost is a lighter share of 4s, which is the
    // better trade for grids that should span the full range of cage sizes.
    const deficit = (size: number): number => {
      const target = TARGET_SHARE[size];
      if (target === undefined) return -1;
      return (target - (counts.get(size) ?? 0) / liveCages) / target;
    };
    const weight = ([a, b]: [number, number]): number =>
      deficit(base[a].length + base[b].length) * SHAPE_PULL + rnd();
    pairs.sort((p, q) => weight(q) - weight(p));

    let merged = 0;
    for (const [a, b] of pairs) {
      // Either side may have been consumed by an earlier merge this round.
      if (base[a].length === 0 || base[b].length === 0) continue;
      if (base[a].length + base[b].length > maxCageSize) continue;

      const keep = base[a];
      const absorbed = base[b];
      base[a] = [...keep, ...absorbed];
      base[b] = [];

      const cages = snapshot();
      // A tight budget here: a merge we cannot prove unique quickly is simply
      // refused. That bounds generation time at the cost of the odd valid
      // merge, which the next round usually finds another way to make.
      if (isUnique(buildConstraints(cages), MERGE_NODE_LIMIT)) {
        merged++;
        const meanSize = CELLS / liveCount();
        ladder.push({ cages, meanSize });
        // Far enough up the ladder for the level we were asked for.
        if (meanSize >= stopMean) return ladder;
      } else {
        base[a] = keep;
        base[b] = absorbed;
      }
    }
    stale = merged === 0 ? stale + 1 : 0;
  }

  return ladder;
}

/** Deterministic seed for puzzle `number` of `level` — 3-10 is always 3-10. */
export function puzzleSeed(level: Level, number: number): number {
  let h = 0x811c9dc5 ^ (level * 0x9e3779b1);
  h = Math.imul(h ^ number, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** How many rungs per grid are worth the cost of classifying. */
const RUNG_WINDOW = 10;

/**
 * Build the puzzle numbered `number` in `level`. Same inputs, same puzzle, on
 * any device, forever — so puzzle numbers can be shared and tracked.
 */
export function generatePuzzle(level: Level, number: number): Puzzle {
  const cfg = LEVEL_CONFIG[level];
  const want = level - 1;
  const seed = puzzleSeed(level, number);
  const rnd = mulberry32(seed);

  let best: { step: LadderStep; solution: number[]; rating: number } | null = null;
  let bestDistance = Infinity;

  for (let grid = 0; grid < 14 && bestDistance > 0; grid++) {
    const solution = randomSolution(rnd);
    const ladder = buildLadder(solution, rnd, MAX_CAGE_SIZE, cfg.targetMean, cfg.triomino);
    if (ladder.length === 0) continue;

    // Classifying is the expensive part, so only look at rungs whose cage size
    // is near the level's texture, hardest first — that is where the levels
    // people actually want to play tend to sit.
    const near = [...ladder]
      .sort((a, b) => Math.abs(a.meanSize - cfg.targetMean) - Math.abs(b.meanSize - cfg.targetMean))
      .slice(0, RUNG_WINDOW);

    for (const step of near) {
      const score = difficultyScore(classify(buildConstraints(step.cages)));
      const distance = Math.abs(score - want);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { step, solution, rating: score };
        if (distance === 0) break;
      }
    }
  }

  if (!best) throw new Error(`could not generate puzzle ${level}-${number}`);
  return {
    cages: best.step.cages,
    solution: best.solution,
    difficulty: level,
    seed,
    rating: best.rating,
  };
}
