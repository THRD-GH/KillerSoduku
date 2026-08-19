/**
 * What a cage's surviving combinations force, and where those digits can go.
 *
 * The solver already asks whether a cage can be filled at all. This asks the
 * two questions a player asks next: which digits appear in *every* remaining
 * combination, and — for each of those — whether every cell that could hold it
 * happens to sit in one row, column or box. When it does, that digit belongs to
 * that unit and comes out of the rest of it, even though the cage itself spans
 * several.
 *
 *   node tools/cage-scan.ts 6 4 l
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';
import type { Level } from '../src/core/types.ts';

const level = Number(process.argv[2] ?? 6) as Level;
const number = Number(process.argv[3] ?? 4);
const wanted = process.argv[4] ?? null;

const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
const puzzle = parsePackRecord(pack[number - 1], level, number);
const letters = 'abcdefghijklmnopqrstuvwxyz';

const name = (i: number): string => `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
const boxOf = (i: number): number => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

const cons = buildConstraints(puzzle.cages);
const cand = initialCandidates();
for (let guard = 0; guard < 4000; guard++) if (nextStep(cand, cons) === null) break;

puzzle.cages.forEach((cage, index) => {
  const letter = letters[index % letters.length];
  if (wanted !== null && letter !== wanted) return;

  // Every set of distinct digits that fits the cells' candidates and the total.
  const combos: number[][] = [];
  const walk = (at: number, used: number, sum: number, picked: number[]): void => {
    if (at === cage.cells.length) {
      if (sum === cage.sum) combos.push([...picked]);
      return;
    }
    for (let d = 1; d <= 9; d++) {
      if (!(cand[cage.cells[at]] & (1 << (d - 1)))) continue;
      if (used & (1 << (d - 1))) continue;
      if (sum + d > cage.sum) continue;
      picked.push(d);
      walk(at + 1, used | (1 << (d - 1)), sum + d, picked);
      picked.pop();
    }
  };
  walk(0, 0, 0, []);

  if (combos.length === 0) {
    console.log(`${letter}=${cage.sum}: no combination fits — contradiction`);
    return;
  }

  const always: number[] = [];
  for (let d = 1; d <= 9; d++) if (combos.every((c) => c.includes(d))) always.push(d);

  console.log(
    `${letter}=${cage.sum} (${cage.cells.map(name).join(',')}) — ` +
      `${combos.length} combinations, in every one: ${always.join(' ') || 'nothing'}`,
  );

  for (const d of always) {
    const places = cage.cells.filter((c) => cand[c] & (1 << (d - 1)));
    const rows = new Set(places.map((c) => Math.floor(c / 9)));
    const cols = new Set(places.map((c) => c % 9));
    const boxes = new Set(places.map(boxOf));
    const shared: string[] = [];
    if (rows.size === 1) shared.push(`row ${[...rows][0] + 1}`);
    if (cols.size === 1) shared.push(`column ${[...cols][0] + 1}`);
    if (boxes.size === 1) shared.push(`box ${[...boxes][0] + 1}`);
    console.log(
      `   ${d} can only sit in ${places.map(name).join(' ')}` +
        (shared.length > 0 ? `  →  all in ${shared.join(' and ')}` : ''),
    );
  }
});
