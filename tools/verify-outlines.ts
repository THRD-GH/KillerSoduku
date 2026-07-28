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

function segments(path: string): [string, string][] {
  return [...path.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)].map((m) => [
    `${m[1]},${m[2]}`,
    `${m[3]},${m[4]}`,
  ]);
}

function checkCage(cage: Cage, label: string): string[] {
  const problems: string[] = [];
  const segs = segments(cageOutlinePath(cage.cells, INSET));

  if (segs.length === 0) {
    problems.push(`${label}: no outline at all`);
    return problems;
  }

  const touches = new Map<string, number>();
  for (const [a, b] of segs) {
    touches.set(a, (touches.get(a) ?? 0) + 1);
    touches.set(b, (touches.get(b) ?? 0) + 1);
    if (a === b) problems.push(`${label}: zero-length segment at ${a}`);
  }
  for (const [point, n] of touches) {
    if (n !== 2) problems.push(`${label}: corner at ${point} touched ${n}x (want 2)`);
  }

  // Total outline length should scale with the cage's perimeter, not explode.
  const length = segs.reduce((t, [a, b]) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return t + Math.abs(ax - bx) + Math.abs(ay - by);
  }, 0);
  if (length < 2) problems.push(`${label}: outline length ${length.toFixed(2)} is too short`);

  return problems;
}

// Shapes that specifically exercise the corner rules.
const HAND_CASES: { name: string; cells: number[] }[] = [
  { name: 'single row of 3', cells: [0, 1, 2] },
  { name: 'single column of 3', cells: [0, 9, 18] },
  { name: 'L-shape', cells: [0, 9, 10] },
  { name: 'S-shape', cells: [1, 2, 9, 10] },
  { name: 'square block', cells: [0, 1, 9, 10] },
  { name: 'T-shape', cells: [0, 1, 2, 10] },
  { name: 'U-shape', cells: [0, 2, 9, 10, 11] },
  { name: 'staircase', cells: [0, 9, 10, 19, 20] },
  { name: 'domino', cells: [40, 41] },
];

let problems: string[] = [];
for (const { name, cells } of HAND_CASES) {
  problems.push(...checkCage({ cells, sum: 0 }, `hand/${name}`));
}
console.log(`${HAND_CASES.length} hand-built shapes checked`);

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
