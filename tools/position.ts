/**
 * A puzzle laid out as text, with the candidates the technique stack is left
 * holding when it stalls. For working out by hand what it should have seen.
 *
 *   node tools/position.ts 6 4
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';
import type { Level } from '../src/core/types.ts';

const level = Number(process.argv[2] ?? 6) as Level;
const number = Number(process.argv[3] ?? 4);

const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
const puzzle = parsePackRecord(pack[number - 1], level, number);

const cageOf = new Int16Array(81).fill(-1);
puzzle.cages.forEach((cage, i) => cage.cells.forEach((c) => (cageOf[c] = i)));

const name = (i: number): string => `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
const digits = (mask: number): string => {
  let out = '';
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out += d;
  return out;
};

console.log(`${level}-${number}: ${puzzle.cages.length} cages`);
console.log('\ncages (letter = cage, number = its total):');
const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+*/=?!@#$%^&';
for (let r = 0; r < 9; r++) {
  let line = '';
  for (let c = 0; c < 9; c++) line += ` ${letters[cageOf[r * 9 + c] % letters.length]}`;
  console.log(line);
}
console.log('\ncage totals:');
console.log(
  puzzle.cages
    .map((cage, i) => `${letters[i % letters.length]}=${cage.sum}(${cage.cells.map(name).join(',')})`)
    .join('  '),
);

const cons = buildConstraints(puzzle.cages);
const cand = initialCandidates();
for (let guard = 0; guard < 4000; guard++) if (nextStep(cand, cons) === null) break;

console.log('\ncandidates where it stalls:');
for (let r = 0; r < 9; r++) {
  console.log(
    Array.from({ length: 9 }, (_, c) => digits(cand[r * 9 + c]).padEnd(9)).join('|'),
  );
}

console.log(`\nsolution R5C5 = ${puzzle.solution[40]}`);
console.log('solution:');
for (let r = 0; r < 9; r++) console.log(puzzle.solution.slice(r * 9, r * 9 + 9).join(' '));
