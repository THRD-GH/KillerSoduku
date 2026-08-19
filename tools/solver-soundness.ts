/**
 * The one thing a technique must never do: rule out the truth.
 *
 * Walks every Classic puzzle to the stall and checks the solution digit still
 * survives in every cell, and that anything the solver settled on matches the
 * solution. A technique that is merely weak costs a hint; a technique that is
 * wrong quietly makes puzzles unsolvable and mis-rates the generated ladder.
 *
 *   node tools/solver-soundness.ts        # every level
 *   node tools/solver-soundness.ts 6      # one level
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';
import type { Level } from '../src/core/types.ts';

const only = process.argv[2] ? Number(process.argv[2]) : null;
const levels = (only ? [only] : [1, 2, 3, 4, 5, 6]) as Level[];

let checked = 0;
let failures = 0;
let fullySolved = 0;
let cellsSolved = 0;
let cellsTotal = 0;

for (const level of levels) {
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
  let levelSolved = 0;
  let levelCells = 0;

  for (let i = 0; i < pack.length; i++) {
    const puzzle = parsePackRecord(pack[i], level, i + 1);
    const cons = buildConstraints(puzzle.cages);
    const cand = initialCandidates();
    for (let guard = 0; guard < 4000; guard++) if (nextStep(cand, cons) === null) break;

    let solved = 0;
    for (let cell = 0; cell < 81; cell++) {
      const truth = 1 << (puzzle.solution[cell] - 1);
      if ((cand[cell] & truth) === 0) {
        failures++;
        console.log(
          `UNSOUND ${level}-${i + 1} at R${Math.floor(cell / 9) + 1}C${(cell % 9) + 1}: ` +
            `solution ${puzzle.solution[cell]} was ruled out`,
        );
        break;
      }
      if (cand[cell] === truth) solved++;
    }
    if (solved === 81) levelSolved++;
    levelCells += solved;
    checked++;
  }

  fullySolved += levelSolved;
  cellsSolved += levelCells;
  cellsTotal += pack.length * 81;
  console.log(
    `level ${level}: ${levelSolved}/${pack.length} solved by logic alone, ` +
      `${((levelCells / (pack.length * 81)) * 100).toFixed(1)}% of cells`,
  );
}

console.log(
  `\n${checked} puzzles checked, ${failures} unsound, ` +
    `${fullySolved} solved outright, ${((cellsSolved / cellsTotal) * 100).toFixed(1)}% of all cells`,
);
process.exit(failures === 0 ? 0 : 1);
