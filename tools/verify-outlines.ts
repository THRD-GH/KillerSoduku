/**
 * A cage outline is correct only if it closes. Every segment endpoint must be
 * shared by exactly two segments — an endpoint touched once is an open corner,
 * which is precisely the artefact per-cell dashed borders produced.
 *
 *   node tools/verify-outlines.ts [puzzlesPerLevel]
 */
import { generatePuzzle } from '../src/core/generator.ts';
import { cageOutlinePath } from '../src/ui/cage-outline.ts';
import type { Cage, Level } from '../src/core/types.ts';

const perLevel = Number(process.argv[2] ?? 4);
const INSET = 0.085;

/** Bounding box of every coordinate in the path. */
function extent(path: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const numbers = [...path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  if (numbers.length === 0) return null;
  return {
    minX: Math.min(...numbers.map((p) => p[0])),
    minY: Math.min(...numbers.map((p) => p[1])),
    maxX: Math.max(...numbers.map((p) => p[0])),
    maxY: Math.max(...numbers.map((p) => p[1])),
  };
}

function checkCage(cage: Cage, label: string): string[] {
  const problems: string[] = [];
  const path = cageOutlinePath(cage.cells, INSET);

  if (path.length === 0) {
    problems.push(`${label}: no outline at all`);
    return problems;
  }
  if (!path.startsWith('M')) problems.push(`${label}: path does not start with a move`);
  if (!path.endsWith('Z')) problems.push(`${label}: path is not closed`);
  if (/NaN|Infinity|undefined/.test(path)) problems.push(`${label}: path has bad numbers`);

  // Every loop must be closed: one Z per M.
  const moves = (path.match(/M/g) ?? []).length;
  const closes = (path.match(/Z/g) ?? []).length;
  if (moves !== closes) problems.push(`${label}: ${moves} loops but ${closes} closes`);

  // The outline should hug the cage's own bounds, pulled in by the inset.
  const box = extent(path);
  const rows = cage.cells.map((i) => Math.floor(i / 9));
  const cols = cage.cells.map((i) => i % 9);
  const want = {
    minX: Math.min(...cols) + INSET,
    minY: Math.min(...rows) + INSET,
    maxX: Math.max(...cols) + 1 - INSET,
    maxY: Math.max(...rows) + 1 - INSET,
  };
  const tolerance = 0.001;
  if (
    box === null ||
    Math.abs(box.minX - want.minX) > tolerance ||
    Math.abs(box.minY - want.minY) > tolerance ||
    Math.abs(box.maxX - want.maxX) > tolerance ||
    Math.abs(box.maxY - want.maxY) > tolerance
  ) {
    problems.push(
      `${label}: bounds ${JSON.stringify(box)} do not match the cage ${JSON.stringify(want)}`,
    );
  }

  return problems;
}

/**
 * Shapes that exercise the corner rules, with the number of corners each
 * outline must have. Concave notches are where a boundary trace goes wrong,
 * and a corner count catches that where a bounding box cannot.
 */
const HAND_CASES: { name: string; cells: number[]; corners: number }[] = [
  { name: 'domino', cells: [40, 41], corners: 4 },
  { name: 'single row of 3', cells: [0, 1, 2], corners: 4 },
  { name: 'single column of 3', cells: [0, 9, 18], corners: 4 },
  { name: 'square block', cells: [0, 1, 9, 10], corners: 4 },
  { name: 'L-shape', cells: [0, 9, 10], corners: 6 },
  { name: 'S-shape', cells: [1, 2, 9, 10], corners: 8 },
  { name: 'T-shape', cells: [0, 1, 2, 10], corners: 8 },
  { name: 'U-shape', cells: [0, 2, 9, 10, 11], corners: 8 },
  { name: 'staircase', cells: [0, 9, 10, 19, 20], corners: 10 },
];

let problems: string[] = [];
for (const { name, cells, corners } of HAND_CASES) {
  const label = `hand/${name}`;
  problems.push(...checkCage({ cells, sum: 0 }, label));
  // One rounded join is emitted per corner.
  const found = (cageOutlinePath(cells, INSET).match(/Q/g) ?? []).length;
  if (found !== corners) problems.push(`${label}: ${found} corners, expected ${corners}`);
}
console.log(`${HAND_CASES.length} hand-built shapes checked, with corner counts`);

let cages = 0;
for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
  for (let n = 1; n <= perLevel; n++) {
    const p = generatePuzzle(level, n);
    for (const [i, cage] of p.cages.entries()) {
      cages++;
      problems.push(...checkCage(cage, `${level}-${n} cage ${i}`));
    }
  }
}
console.log(`${cages} generated cages checked`);

if (problems.length === 0) {
  console.log('\nall outlines close cleanly');
} else {
  console.log(`\n${problems.length} problems:`);
  for (const p of problems.slice(0, 25)) console.log(`  ${p}`);
  process.exitCode = 1;
}
