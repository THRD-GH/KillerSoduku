/**
 * What separates the Classic levels, now that the solver finishes nearly all of
 * them.
 *
 * The old scale cut its top two rungs on "logic ran out", which sorted the
 * collection when 1,100 puzzles stalled and sorts nothing now that 82 do. The
 * 5,207 Classic puzzles carry the source collection's own ratings, so they are
 * the training set for a scale that agrees with them: measure each puzzle, see
 * which measurements track the label, and fit the thresholds to those.
 *
 *   node tools/fit-ladder.ts             # feature spread per level
 *   node tools/fit-ladder.ts check       # score the current difficultyScore
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { classify, buildConstraints } from '../src/core/solver.ts';
import { TECHNIQUES } from '../src/core/techniques.ts';
import { difficultyScore } from '../src/core/generator.ts';
import type { Level } from '../src/core/types.ts';

const mode = process.argv[2] ?? 'spread';
const perLevel = Number(process.argv[3] ?? 120);

const tierOf = new Map(TECHNIQUES.map((t) => [t.name, t.difficulty]));

interface Sample {
  level: Level;
  hardest: number;
  guesses: number;
  logical: boolean;
  /** Steps taken at each difficulty, and the total. */
  steps: number;
  hardSteps: number;
  topSteps: number;
  score: number;
}

const samples: Sample[] = [];

for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
  const step = Math.max(1, Math.floor(pack.length / perLevel));
  for (let i = 0; i < pack.length && samples.filter((s) => s.level === level).length < perLevel; i += step) {
    const puzzle = parsePackRecord(pack[i], level, i + 1);
    const c = classify(buildConstraints(puzzle.cages));
    let steps = 0;
    let hardSteps = 0;
    let topSteps = 0;
    for (const [name, count] of c.used) {
      const tier = tierOf.get(name) ?? 0;
      steps += count;
      if (tier >= 4) hardSteps += count;
      if (tier >= 5) topSteps += count;
    }
    samples.push({
      level,
      hardest: c.hardest,
      guesses: c.logical ? 0 : c.guesses,
      logical: c.logical,
      steps,
      hardSteps,
      topSteps,
      score: difficultyScore(c),
    });
  }
}

const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

if (mode === 'spread') {
  console.log('level    n   hardest (25/50/75)   steps (25/50/75)   hard steps   top steps   stalls');
  for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
    const rows = samples.filter((s) => s.level === level);
    const q = (pick: (s: Sample) => number): string =>
      [0.25, 0.5, 0.75].map((p) => String(quantile(rows.map(pick), p)).padStart(3)).join(' ');
    const stalls = rows.filter((s) => !s.logical).length;
    console.log(
      `  ${level}   ${String(rows.length).padStart(3)}      ${q((s) => s.hardest)}          ` +
        `${q((s) => s.steps)}       ${q((s) => s.hardSteps)}    ${q((s) => s.topSteps)}   ` +
        `${String(stalls).padStart(3)}`,
    );
  }
} else {
  // How well the current scale reproduces the collection's own labels.
  let exact = 0;
  let error = 0;
  const grid = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (const s of samples) {
    const want = s.level - 1;
    if (s.score === want) exact++;
    error += Math.abs(s.score - want);
    grid[want][Math.min(5, s.score)]++;
  }
  console.log(`agreement with the collection: ${((exact / samples.length) * 100).toFixed(1)}%`);
  console.log(`mean rungs out: ${(error / samples.length).toFixed(2)}\n`);
  console.log('wanted \\ scored   0    1    2    3    4    5');
  grid.forEach((row, want) => {
    console.log(`      ${want}         ${row.map((n) => String(n).padStart(4)).join(' ')}`);
  });
}
