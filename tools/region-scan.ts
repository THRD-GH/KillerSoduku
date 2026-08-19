/**
 * The rule of 45 over every run of consecutive rows or columns: N units total
 * 45N, so subtracting the cages wholly inside leaves a known total for the
 * cells that spill over the edge. One cell left over is an outright answer.
 *
 * Written to check a deduction the solver misses — four columns pinning the
 * centre of 6-4 — and to count how many such openings a pack holds.
 *
 *   node tools/region-scan.ts 6 4
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import type { Level } from '../src/core/types.ts';

const level = Number(process.argv[2] ?? 6) as Level;
const number = Number(process.argv[3] ?? 4);

const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
const puzzle = parsePackRecord(pack[number - 1], level, number);

const name = (i: number): string => `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
const rowCells = (r: number): number[] => Array.from({ length: 9 }, (_, c) => r * 9 + c);
const colCells = (c: number): number[] => Array.from({ length: 9 }, (_, r) => r * 9 + c);

const owner = new Int16Array(81).fill(-1);
puzzle.cages.forEach((cage, i) => cage.cells.forEach((c) => (owner[c] = i)));

console.log(`${level}-${number}: runs of lines with one or two cells left over\n`);

for (const [label, line] of [
  ['rows', rowCells],
  ['columns', colCells],
] as const) {
  for (let start = 0; start < 9; start++) {
    for (let length = 1; start + length <= 9; length++) {
      const cells = new Set<number>();
      for (let i = start; i < start + length; i++) for (const c of line(i)) cells.add(c);

      const ids = new Set<number>();
      for (const c of cells) ids.add(owner[c]);

      let inside = 0;
      const leftover: number[] = [];
      for (const id of ids) {
        const cage = puzzle.cages[id];
        if (cage.cells.every((c) => cells.has(c))) inside += cage.sum;
        else for (const c of cage.cells) if (cells.has(c)) leftover.push(c);
      }

      const sum = 45 * length - inside;
      if (leftover.length === 0 || leftover.length > 2) continue;
      const answer =
        leftover.length === 1 ? `  →  ${name(leftover[0])} = ${sum}` : `  →  the pair totals ${sum}`;
      console.log(
        `${label} ${start + 1}-${start + length} (${length} × 45 = ${45 * length}), ` +
          `cages inside ${inside}, leftover ${leftover.map(name).join(' ')}${answer}`,
      );
    }
  }
}

console.log(`\nsolution has R5C5 = ${puzzle.solution[40]}`);
