/**
 * The 14/11 deduction, checked on a real grid.
 *
 * A 14 in two cells is 5+9 or 6+8. An 11 in two cells sharing that row could be
 * 2+9, 3+8, 4+7 or 5+6 — except 5+6, which leaves the 14 nothing. Puzzle 1-79
 * has exactly that pair in row 6, so 5 and 6 must be gone from the 11 by the
 * time the solver stops.
 *
 *   node tools/pair-check.ts
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';

const pack = JSON.parse(readFileSync('public/packs/level-1.json', 'utf8')) as string[];
const puzzle = parsePackRecord(pack[78], 1, 79);
const name = (i: number): string => `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
const digits = (mask: number): string => {
  let out = '';
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out += d;
  return out;
};

const eleven = puzzle.cages.find((c) => c.sum === 11 && c.cells.length === 2);
const fourteen = puzzle.cages.find((c) => c.sum === 14 && c.cells.length === 2);
if (!eleven || !fourteen) throw new Error('1-79 no longer holds the pair');

const cons = buildConstraints(puzzle.cages);
const cand = initialCandidates();
console.log(`14 at ${fourteen.cells.map(name).join(' + ')}, 11 at ${eleven.cells.map(name).join(' + ')}`);
console.log(`before: ${eleven.cells.map((c) => digits(cand[c])).join('  ')}`);
for (let guard = 0; guard < 4000; guard++) if (nextStep(cand, cons) === null) break;
const after = eleven.cells.map((c) => digits(cand[c]));
console.log(`after:  ${after.join('  ')}`);
console.log(`solution: ${eleven.cells.map((c) => puzzle.solution[c]).join(' + ')}`);

