/**
 * What each belt actually hands the player: how much work, and what kind.
 *
 * The ladder promises two things per belt — a demand and a technique it has to
 * force — so both are read back off freshly generated puzzles rather than
 * assumed.
 *
 *   node tools/belt-check.ts [per belt]
 */
import { classify, buildConstraints } from '../src/core/solver.ts';
import { BELT_GRADING, BELTS, LEVELS, demandScore, generatePuzzle } from '../src/core/generator.ts';
import { TECHNIQUES } from '../src/core/techniques.ts';

const sample = Number(process.argv[2] ?? 8);
const tierOf = new Map(TECHNIQUES.map((t) => [t.name, t.difficulty]));
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

console.log('belt          asks   gets    hardest tier   top-tier steps   seconds each');
for (const level of LEVELS) {
  const demands: number[] = [];
  const hardest: number[] = [];
  const tops: number[] = [];
  const started = process.hrtime.bigint();

  for (let n = 1; n <= sample; n++) {
    const c = classify(buildConstraints(generatePuzzle(level, n).cages));
    demands.push(demandScore(c));
    hardest.push(c.hardest);
    let top = 0;
    for (const [name, count] of c.used) if ((tierOf.get(name) ?? 1) >= 6) top += count;
    tops.push(top);
  }
  const seconds = Number(process.hrtime.bigint() - started) / 1e9 / sample;
  const belt = BELT_GRADING[level];

  console.log(
    `${BELTS[level].name.padEnd(12)}  ${String(belt.demand).padStart(4)}  ` +
      `${median(demands).toFixed(1).padStart(5)}    ` +
      `${String(median(hardest)).padStart(3)} (needs ${belt.tier})    ` +
      `${String(median(tops)).padStart(4)} (needs ${belt.topSteps})       ${seconds.toFixed(1)}s`,
  );
}

