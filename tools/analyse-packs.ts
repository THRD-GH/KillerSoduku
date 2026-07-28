/**
 * The reference packs group puzzles two ways: by file, and by the rating digit
 * in field 1. Only one of those is the level. This runs both groupings through
 * our own solver and reports which produces a monotone difficulty ladder.
 *
 *   node tools/analyse-packs.ts <dir-with-nks-files> [perGroup]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { difficultyScore } from '../src/core/generator.ts';
import { buildConstraints, classify } from '../src/core/solver.ts';
import type { Cage } from '../src/core/types.ts';

const dir = process.argv[2];
const perGroup = Number(process.argv[3] ?? 25);

export interface PackPuzzle {
  flag: string;
  file: string;
  cages: Cage[];
  solution: number[];
}

export function parseLine(line: string, file: string): PackPuzzle | null {
  const [flag, letters, sums, solution] = line.split('|');
  if (letters?.length !== 81 || solution?.length !== 81) return null;

  const groups = new Map<string, number[]>();
  for (let i = 0; i < 81; i++) {
    if (!groups.has(letters[i])) groups.set(letters[i], []);
    groups.get(letters[i])!.push(i);
  }
  // Sums are listed in the order the cage letters first sort.
  const ids = [...groups.keys()].sort();
  const values = sums.split(',').map(Number);
  if (values.length !== ids.length) return null;

  const cages: Cage[] = ids.map((id, i) => ({ cells: groups.get(id)!, sum: values[i] }));
  return { flag, file, cages, solution: [...solution].map(Number) };
}

const all: PackPuzzle[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.nks')).sort()) {
  for (const line of readFileSync(join(dir, file), 'latin1').split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const p = parseLine(line, file);
    if (p) all.push(p);
  }
}
console.log(`parsed ${all.length} puzzles\n`);

// Do the declared sums actually match the declared solution? If the cage/sum
// pairing were wrong, everything downstream would be nonsense.
let mismatched = 0;
for (const p of all.slice(0, 400)) {
  for (const cage of p.cages) {
    if (cage.cells.reduce((t, i) => t + p.solution[i], 0) !== cage.sum) {
      mismatched++;
      break;
    }
  }
}
console.log(`sum/solution agreement on first 400: ${400 - mismatched}/400 ok\n`);
if (mismatched > 0) {
  console.log('cage-to-sum pairing is wrong; the grouping report below is meaningless');
}

function report(label: string, key: (p: PackPuzzle) => string): void {
  const groups = new Map<string, PackPuzzle[]>();
  for (const p of all) {
    if (!groups.has(key(p))) groups.set(key(p), []);
    groups.get(key(p))!.push(p);
  }

  console.log(`grouped by ${label}:`);
  for (const g of [...groups.keys()].sort()) {
    const sample = groups.get(g)!.filter((_, i) => i % Math.ceil(groups.get(g)!.length / perGroup) === 0);
    const scores: number[] = [];
    let unsolved = 0;
    for (const p of sample.slice(0, perGroup)) {
      const c = classify(buildConstraints(p.cages), 40000);
      if (!Number.isFinite(c.guesses)) unsolved++;
      scores.push(difficultyScore(c));
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const hist = [0, 1, 2, 3, 4, 5].map((s) => scores.filter((x) => x === s).length).join('/');
    console.log(
      `  ${g.padEnd(14)} n=${String(groups.get(g)!.length).padStart(4)}  ` +
        `meanScore=${mean.toFixed(2)}  scores 0-5: ${hist}${unsolved ? `  (${unsolved} over budget)` : ''}`,
    );
  }
  console.log();
}

report('file', (p) => p.file);
report('rating flag', (p) => `flag ${p.flag}`);
