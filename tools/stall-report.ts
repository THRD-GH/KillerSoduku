/**
 * Where the technique stack runs out on the hard packs.
 *
 * `classify` calls a puzzle "not logical" when the twelve techniques in
 * techniques.ts cannot finish it — which is a statement about the solver, not
 * about the grid. This walks a pack to the stall and reports what is left
 * standing there, so a missing technique can be identified from the position
 * rather than guessed at.
 *
 *   node tools/stall-report.ts 6 12
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';
import type { Level } from '../src/core/types.ts';

const level = Number(process.argv[2] ?? 6) as Level;
const sample = Number(process.argv[3] ?? 10);

const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];

const popcount = (mask: number): number => {
  let n = 0;
  for (let bit = 0; bit < 9; bit++) if (mask & (1 << bit)) n++;
  return n;
};

console.log(`level ${level}: ${pack.length} puzzles in the pack, walking ${sample}`);
console.log('puzzle   solved  bivalue  steps  last technique');

for (let i = 0; i < sample && i < pack.length; i++) {
  const puzzle = parsePackRecord(pack[i], level, i + 1);
  const cons = buildConstraints(puzzle.cages);
  const cand = initialCandidates();

  let steps = 0;
  let last = '—';
  for (let guard = 0; guard < 4000; guard++) {
    const step = nextStep(cand, cons);
    if (step === null) break;
    steps++;
    last = step.technique;
  }

  let solved = 0;
  let bivalue = 0;
  for (let cell = 0; cell < 81; cell++) {
    const n = popcount(cand[cell]);
    if (n === 1) solved++;
    else if (n === 2) bivalue++;
  }

  console.log(
    `${String(level) + '-' + String(i + 1).padEnd(4)}   ` +
      `${String(solved).padStart(2)}/81   ${String(bivalue).padStart(3)}     ` +
      `${String(steps).padStart(3)}    ${last}`,
  );
}
