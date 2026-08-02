/**
 * Verifies generated puzzles and reports the cage-size distribution, which is
 * compared against the 5,200 hand-picked Classic puzzles.
 *
 *   node tools/calibrate.ts          # verify all 6 levels end to end
 *   node tools/calibrate.ts spread   # how tier/guesses vary along the ladder
 */
import {
  LEVELS,
  LEVEL_CONFIG,
  MAX_CAGE_SIZE,
  MIN_CAGE_SIZE,
  buildLadder,
  generatePuzzle,
  randomSolution,
} from '../src/core/generator.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { buildConstraints, classify, solve } from '../src/core/solver.ts';

/** Measured from the archived Classic `.nks` source files. */
const REFERENCE_DIST: Record<number, number> = {
  2: 51.5,
  3: 26.5,
  4: 12.0,
  5: 6.0,
  6: 2.0,
  7: 1.0,
  8: 0.3,
  9: 0.1,
};

const mode = process.argv[2] ?? 'verify';
/** Puzzles per level. The cage-size tail only shows up over a few thousand cages. */
const SAMPLE = Number(process.argv[3] ?? 6);

function distribution(sizes: number[]): string {
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((s) => `${s}:${((counts.get(s)! / sizes.length) * 100).toFixed(1)}%`)
    .join(' ');
}

if (mode === 'spread') {
  const rnd = mulberry32(20260728);
  const hardestCounts = new Map<string, number>();
  const techniqueCounts = new Map<string, number>();

  for (let grid = 0; grid < 4; grid++) {
    const ladder = buildLadder(randomSolution(rnd), rnd, MAX_CAGE_SIZE, 3.4);
    const line = ladder
      .filter((_, i) => i % 3 === 0)
      .map((step) => {
        const c = classify(buildConstraints(step.cages));
        const key = c.logical ? `logical/h${c.hardest}` : `guess/h${c.hardest}`;
        hardestCounts.set(key, (hardestCounts.get(key) ?? 0) + 1);
        for (const [name, n] of c.used) {
          techniqueCounts.set(name, (techniqueCounts.get(name) ?? 0) + n);
        }
        return `${step.meanSize.toFixed(2)}→h${c.hardest}${c.logical ? '' : `/g${c.guesses}`}`;
      })
      .join('  ');
    console.log(`grid ${grid}: ${line}`);
  }

  console.log('\nhardest technique required:');
  for (const key of [...hardestCounts.keys()].sort()) {
    console.log(`  ${key.padEnd(14)} ${hardestCounts.get(key)}`);
  }
  console.log('\ntechnique firings across all sampled puzzles:');
  for (const [name, n] of [...techniqueCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(24)} ${n}`);
  }
} else {
  const allSizes: number[] = [];

  for (const level of LEVELS) {
    const times: number[] = [];
    const scores: number[] = [];
    const sizes: number[] = [];

    for (let n = 1; n <= SAMPLE; n++) {
      const t0 = performance.now();
      const p = generatePuzzle(level, n);
      times.push(performance.now() - t0);
      scores.push(p.rating);
      for (const c of p.cages) sizes.push(c.cells.length);

      const r = solve(p.cages, { maxSolutions: 2 });
      if (r.count !== 1) throw new Error(`${level}-${n}: ${r.count} solutions`);
      if (r.solution!.join('') !== p.solution.join('')) {
        throw new Error(`${level}-${n}: solver disagrees with generator`);
      }
      const covered = new Set(p.cages.flatMap((c) => c.cells));
      const total = p.cages.reduce((t, c) => t + c.sum, 0);
      if (covered.size !== 81 || total !== 405) {
        throw new Error(`${level}-${n}: bad partition (${covered.size} cells, sum ${total})`);
      }
      for (const c of p.cages) {
        const ds = c.cells.map((i) => p.solution[i]);
        if (new Set(ds).size !== ds.length) throw new Error(`${level}-${n}: repeated digit in cage`);
        if (c.cells.length < MIN_CAGE_SIZE) {
          throw new Error(`${level}-${n}: single-cell cage at ${c.cells[0]}`);
        }
        if (c.cells.length > MAX_CAGE_SIZE) throw new Error(`${level}-${n}: cage over size cap`);
      }
    }

    allSizes.push(...sizes);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const onTarget = scores.filter((s) => s === level - 1).length;
    console.log(
      `L${level} ok  on target ${onTarget}/${SAMPLE}  ` +
        `meanCage=${mean.toFixed(2)} (aim ${LEVEL_CONFIG[level].targetMean})  ` +
        `gen ${Math.round(Math.min(...times))}-${Math.round(Math.max(...times))}ms`,
    );
  }

  console.log(`\ncage sizes over ${allSizes.length} cages`);
  console.log(`            ours ${distribution(allSizes)}`);
  console.log(
    `            them ${Object.entries(REFERENCE_DIST)
      .map(([s, p]) => `${s}:${p.toFixed(1)}%`)
      .join(' ')}`,
  );
  console.log('\nall levels: unique, consistent, digit-distinct, no single-cell cages');
}
