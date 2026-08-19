/**
 * What the candidate grids actually hold.
 *
 * Every generated puzzle is a rung off a ladder of cage merges, and a belt can
 * only ask for something those rungs contain. Asking for six top-tier steps
 * when the ladder tops out at one means a search that spends its whole budget
 * and settles, which is twenty seconds a puzzle for a worse answer. This walks
 * the ladders and reports what is on offer.
 *
 *   node tools/ladder-spread.ts [grids]
 */
import { buildLadder, randomSolution, demandScore } from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { buildConstraints, classify } from '../src/core/solver.ts';
import { TECHNIQUES } from '../src/core/techniques.ts';

const grids = Number(process.argv[2] ?? 6);
const tierOf = new Map(TECHNIQUES.map((t) => [t.name, t.difficulty]));
const rnd = mulberry32(20260820);

const rows: { demand: number; hardest: number; top: number }[] = [];
for (let g = 0; g < grids; g++) {
  const ladder = buildLadder(randomSolution(rnd), rnd, 9, 2.9, 0.4);
  for (const step of ladder.filter((_, i) => i % 2 === 0)) {
    const c = classify(buildConstraints(step.cages));
    let top = 0;
    for (const [name, count] of c.used) if ((tierOf.get(name) ?? 1) >= 6) top += count;
    rows.push({ demand: demandScore(c), hardest: c.hardest, top });
  }
}

const band = (lo: number, hi: number): string => {
  const inside = rows.filter((r) => r.demand >= lo && r.demand < hi);
  if (inside.length === 0) return `${String(lo).padStart(3)}-${String(hi).padEnd(3)}  none`;
  const share = (test: (r: { hardest: number; top: number }) => boolean): string =>
    `${((inside.filter(test).length / inside.length) * 100).toFixed(0)}%`.padStart(4);
  return (
    `${String(lo).padStart(3)}-${String(hi).padEnd(3)} ${String(inside.length).padStart(4)} rungs   ` +
    `tier>=4 ${share((r) => r.hardest >= 4)}   tier>=5 ${share((r) => r.hardest >= 5)}   ` +
    `tier>=6 ${share((r) => r.hardest >= 6)}   top>=1 ${share((r) => r.top >= 1)}   ` +
    `top>=2 ${share((r) => r.top >= 2)}   top>=3 ${share((r) => r.top >= 3)}`
  );
};

console.log(`${rows.length} rungs from ${grids} grids\n`);
console.log('demand    how many          what they force');
for (const [lo, hi] of [[0, 10], [10, 16], [16, 24], [24, 32], [32, 40], [40, 48], [48, 60], [60, 999]]) {
  console.log(band(lo, hi));
}

