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
import { difficultyScore, generatePuzzle } from '../src/core/generator.ts';
import type { Level } from '../src/core/types.ts';

const sample = Number(process.argv[2] ?? 8);
const levels = [1, 2, 3, 4, 5, 6] as Level[];

const rung = (cages: ReturnType<typeof parsePackRecord>['cages']): number =>
  difficultyScore(classify(buildConstraints(cages)));

console.log(`${sample} puzzles per level per source; "rung" is what this solver makes of them\n`);
console.log('level   classic rungs (wanted %d)        new rungs                 new: seconds each');

for (const level of levels) {
  const want = level - 1;
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];

  const classicRungs: number[] = [];
  const step = Math.max(1, Math.floor(pack.length / sample));
  for (let i = 0; i < pack.length && classicRungs.length < sample; i += step) {
    classicRungs.push(rung(parsePackRecord(pack[i], level, i + 1).cages));
  }

  const newRungs: number[] = [];
  const started = process.hrtime.bigint();
  for (let n = 1; n <= sample; n++) newRungs.push(rung(generatePuzzle(level, n).cages));
  const seconds = Number(process.hrtime.bigint() - started) / 1e9 / sample;

  const spread = (rungs: number[]): string => {
    const counts = new Array<number>(6).fill(0);
    for (const r of rungs) counts[r]++;
    return counts.map((c, i) => (c === 0 ? '  ' : `${i}×${c}`)).join(' ').padEnd(24);
  };
  const mean = (rungs: number[]): string =>
    (rungs.reduce((a, b) => a + b, 0) / rungs.length).toFixed(1);

  console.log(
    `  ${level}     ${spread(classicRungs)} mean ${mean(classicRungs)}   ` +
      `${spread(newRungs)} mean ${mean(newRungs)}   ${seconds.toFixed(1)}s`,
  );
}

console.log(
  '\nwanted rung for level N is N-1. A classic mean well below it means the ' +
    'source collection rates those puzzles harder than this solver now does.',
);
