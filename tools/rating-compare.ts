/**
 * Do New puzzles still sit where Classic puzzles of the same level sit?
 *
 * Both are put through the same measurement: classify the grid with the current
 * technique stack, and read off the rung difficultyScore gives it. Classic
 * levels come from the source collection's own rating, so agreement means our
 * ladder still matches theirs — and the technique stack has moved a long way
 * since that ladder was calibrated.
 *
 *   node tools/rating-compare.ts 8      # 8 puzzles per level per source
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { classify } from '../src/core/solver.ts';
import { buildConstraints } from '../src/core/techniques.ts';
import { demandScore, difficultyScore, generatePuzzle } from '../src/core/generator.ts';
import type { Level } from '../src/core/types.ts';

const sample = Number(process.argv[2] ?? 8);
const levels = [1, 2, 3, 4, 5, 6] as Level[];

const measure = (cages: ReturnType<typeof parsePackRecord>['cages']): { rung: number; demand: number } => {
  const c = classify(buildConstraints(cages));
  return { rung: difficultyScore(c), demand: demandScore(c) };
};
const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

console.log(`${sample} puzzles per level per source; "rung" is what this solver makes of them\n`);
console.log('level    what each side demands of the solver, at the median');

for (const level of levels) {
  const want = level - 1;
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];

  const classic: number[] = [];
  const step = Math.max(1, Math.floor(pack.length / sample));
  for (let i = 0; i < pack.length && classic.length < sample; i += step) {
    classic.push(measure(parsePackRecord(pack[i], level, i + 1).cages).demand);
  }

  const fresh: number[] = [];
  const started = process.hrtime.bigint();
  for (let n = 1; n <= sample; n++) fresh.push(measure(generatePuzzle(level, n).cages).demand);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9 / sample;

  console.log(
    `  ${level}      classic median demand ${median(classic).toFixed(1).padStart(5)}` +
      `      new ${median(fresh).toFixed(1).padStart(5)}      ${seconds.toFixed(1)}s each`,
  );
}

console.log(
  '\nwanted rung for level N is N-1. A classic mean well below it means the ' +
    'source collection rates those puzzles harder than this solver now does.',
);
