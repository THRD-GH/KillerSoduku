/**
 * The demand each Classic level actually makes, as a band.
 *
 * Reproducing the collection's labels exactly is not possible and not the
 * point: levels 1 to 3 are barely distinguishable to this solver. What matters
 * is that a generated level N sits where Classic level N sits, so this measures
 * the spread of a demand figure per level and prints the boundaries between
 * them — the numbers the generator should be aiming at.
 *
 *   node tools/fit-bands.ts [per level]
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { classify, buildConstraints } from '../src/core/solver.ts';
import { TECHNIQUES } from '../src/core/techniques.ts';
import type { Level } from '../src/core/types.ts';

const perLevel = Number(process.argv[2] ?? 150);
const tierOf = new Map(TECHNIQUES.map((t) => [t.name, t.difficulty]));

/**
 * What the grid asked of the solver. Steps at the top of the stack count for
 * much more than the singles that fall out around them, and a grid that logic
 * cannot finish at all counts for more again.
 */
function demand(used: Map<string, number>, logical: boolean, guesses: number): number {
  let total = 0;
  for (const [name, count] of used) {
    const tier = tierOf.get(name) ?? 1;
    total += count * (tier >= 6 ? 8 : tier === 5 ? 4 : tier === 4 ? 2 : tier >= 3 ? 1 : 0.15);
  }
  return total + (logical ? 0 : 25 + Math.min(guesses, 8) * 5);
}

const byLevel = new Map<Level, number[]>();
for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
  const step = Math.max(1, Math.floor(pack.length / perLevel));
  const values: number[] = [];
  for (let i = 0; i < pack.length && values.length < perLevel; i += step) {
    const puzzle = parsePackRecord(pack[i], level, i + 1);
    const c = classify(buildConstraints(puzzle.cages));
    values.push(demand(c.used, c.logical, c.guesses));
  }
  byLevel.set(level, values.sort((a, b) => a - b));
}

const at = (values: number[], q: number): number => values[Math.min(values.length - 1, Math.floor(values.length * q))];

console.log('level    n     10%     25%     50%     75%     90%');
for (const [level, values] of byLevel) {
  console.log(
    `  ${level}   ${String(values.length).padStart(4)}  ` +
      [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => at(values, q).toFixed(1).padStart(6)).join('  '),
  );
}

// Boundaries midway between neighbouring medians: the simplest cut that puts a
// generated puzzle in the same company as the Classic puzzles of that level.
console.log('\nboundaries (midway between medians):');
const medians = [...byLevel.values()].map((v) => at(v, 0.5));
for (let i = 0; i < medians.length - 1; i++) {
  console.log(`  ${i + 1} | ${i + 2}   ${((medians[i] + medians[i + 1]) / 2).toFixed(1)}`);
}

