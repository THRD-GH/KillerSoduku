/**
 * What is lying unused in the positions the solver still cannot finish.
 *
 * Rather than reason about which technique to write next, walk every puzzle to
 * the stall and count how often each candidate pattern is actually available
 * there. A technique that fires on two grids in a thousand is not worth the
 * arithmetic, however famous it is.
 *
 *   node tools/opening-scan.ts        # every level
 *   node tools/opening-scan.ts 6
 */
import { readFileSync } from 'node:fs';
import { parsePackRecord } from '../src/game/packs.ts';
import { buildConstraints, initialCandidates, nextStep } from '../src/core/techniques.ts';
import { PEERS, UNITS } from '../src/core/grid.ts';
import type { Level } from '../src/core/types.ts';

const only = process.argv[2] ? Number(process.argv[2]) : null;
const levels = (only ? [only] : [1, 2, 3, 4, 5, 6]) as Level[];

const bit = (d: number): number => 1 << (d - 1);
const popcount = (mask: number): number => {
  let n = 0;
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) n++;
  return n;
};
const digitsOf = (mask: number): number[] => {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
};

/** Two bivalue cells sharing a digit, both seeing a third that holds the rest. */
function hasXYWing(cand: Uint16Array): boolean {
  const bivalue: number[] = [];
  for (let c = 0; c < 81; c++) if (popcount(cand[c]) === 2) bivalue.push(c);
  for (const pivot of bivalue) {
    const [a, b] = digitsOf(cand[pivot]);
    for (const one of PEERS[pivot]) {
      if (popcount(cand[one]) !== 2 || !(cand[one] & bit(a)) || cand[one] === cand[pivot]) continue;
      const c1 = digitsOf(cand[one]).find((d) => d !== a);
      if (c1 === undefined) continue;
      for (const two of PEERS[pivot]) {
        if (popcount(cand[two]) !== 2 || !(cand[two] & bit(b)) || cand[two] === cand[pivot]) continue;
        const c2 = digitsOf(cand[two]).find((d) => d !== b);
        if (c2 !== c1) continue;
        // Anything both wings see, holding that shared digit, would go.
        for (let cell = 0; cell < 81; cell++) {
          if (cell === one || cell === two || !(cand[cell] & bit(c1))) continue;
          if (PEERS[one].includes(cell) && PEERS[two].includes(cell)) return true;
        }
      }
    }
  }
  return false;
}

/** A digit confined to N lines across N crossing lines — swordfish and up. */
function hasFish(cand: Uint16Array, size: number): boolean {
  for (let d = 1; d <= 9; d++) {
    for (const byRow of [true, false]) {
      const lines: number[][] = [];
      for (let i = 0; i < 9; i++) {
        const cells: number[] = [];
        for (let j = 0; j < 9; j++) {
          const cell = byRow ? i * 9 + j : j * 9 + i;
          if (cand[cell] & bit(d) && popcount(cand[cell]) > 1) cells.push(byRow ? j : j);
        }
        if (cells.length >= 2 && cells.length <= size) lines.push(cells);
      }
      if (lines.length < size) continue;
      const pick = (at: number, chosen: number[][], cover: Set<number>): boolean => {
        if (chosen.length === size) return cover.size === size;
        for (let i = at; i < lines.length; i++) {
          const next = new Set([...cover, ...lines[i]]);
          if (next.size > size) continue;
          if (pick(i + 1, [...chosen, lines[i]], next)) return true;
        }
        return false;
      };
      if (pick(0, [], new Set())) return true;
    }
  }
  return false;
}

/** A naked or hidden group of four in one unit. */
function hasQuad(cand: Uint16Array): boolean {
  for (const unit of UNITS) {
    const open = unit.filter((c) => popcount(cand[c]) > 1);
    const pool = open.filter((c) => popcount(cand[c]) <= 4);
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++)
        for (let c = b + 1; c < pool.length; c++)
          for (let e = c + 1; e < pool.length; e++) {
            const mask = cand[pool[a]] | cand[pool[b]] | cand[pool[c]] | cand[pool[e]];
            if (popcount(mask) === 4 && open.length > 4) return true;
          }
  }
  return false;
}

console.log('level   stalled   xy-wing   swordfish   jellyfish   quad');
for (const level of levels) {
  const pack = JSON.parse(readFileSync(`public/packs/level-${level}.json`, 'utf8')) as string[];
  let stalled = 0;
  const found = { xy: 0, sword: 0, jelly: 0, quad: 0 };

  for (let i = 0; i < pack.length; i++) {
    const puzzle = parsePackRecord(pack[i], level, i + 1);
    const cons = buildConstraints(puzzle.cages);
    const cand = initialCandidates();
    for (let guard = 0; guard < 4000; guard++) if (nextStep(cand, cons) === null) break;

    let solved = 0;
    for (let cell = 0; cell < 81; cell++) if (popcount(cand[cell]) === 1) solved++;
    if (solved === 81) continue;
    stalled++;

    if (hasXYWing(cand)) found.xy++;
    if (hasFish(cand, 3)) found.sword++;
    if (hasFish(cand, 4)) found.jelly++;
    if (hasQuad(cand)) found.quad++;
  }

  const pct = (n: number): string => (stalled === 0 ? '  —  ' : `${((n / stalled) * 100).toFixed(0)}%`.padStart(5));
  console.log(
    `  ${level}   ${String(stalled).padStart(5)}    ${pct(found.xy)}      ${pct(found.sword)}      ` +
      `${pct(found.jelly)}    ${pct(found.quad)}`,
  );
}
