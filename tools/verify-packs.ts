/**
 * Checks the imported packs really are playable: that each record parses, that
 * its cages partition the grid, and that our solver finds exactly the solution
 * the pack states.
 *
 *   node tools/verify-packs.ts [perLevel]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePackRecord } from '../src/game/packs.ts';
import { solve } from '../src/core/solver.ts';
import type { Level } from '../src/core/types.ts';

const perLevel = Number(process.argv[2] ?? 25);
const dir = join(process.cwd(), 'public', 'packs');

let checked = 0;
let failures = 0;

for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
  const puzzles = JSON.parse(readFileSync(join(dir, `level-${level}.json`), 'utf8')) as string[];
  const step = Math.max(1, Math.floor(puzzles.length / perLevel));
  const sizes: number[] = [];
  let unique = 0;
  let matched = 0;
  let sampled = 0;

  for (let i = 0; i < puzzles.length && sampled < perLevel; i += step) {
    sampled++;
    checked++;
    const number = i + 1;
    let p;
    try {
      p = parsePackRecord(puzzles[i], level, number);
    } catch (err) {
      console.error(`  parse failed ${level}-${number}: ${String(err)}`);
      failures++;
      continue;
    }

    const covered = new Set(p.cages.flatMap((c) => c.cells));
    const total = p.cages.reduce((t, c) => t + c.sum, 0);
    if (covered.size !== 81 || total !== 405) {
      console.error(`  bad partition ${level}-${number}: ${covered.size} cells, sum ${total}`);
      failures++;
      continue;
    }
    for (const c of p.cages) sizes.push(c.cells.length);

    const r = solve(p.cages, { maxSolutions: 2, nodeLimit: 200000 });
    if (r.count === 1) unique++;
    if (r.solution?.join('') === p.solution.join('')) matched++;
    else {
      console.error(`  solution mismatch ${level}-${number} (count ${r.count}, aborted ${r.aborted})`);
      failures++;
    }
  }

  const dist = [...new Set(sizes)]
    .sort((a, b) => a - b)
    .map((s) => `${s}:${sizes.filter((x) => x === s).length}`)
    .join(' ');
  console.log(
    `L${level} ${String(puzzles.length).padStart(4)} puzzles, sampled ${sampled}: ` +
      `unique ${unique}/${sampled}, solution matches ${matched}/${sampled}  sizes ${dist}`,
  );
}

console.log(`\n${checked} checked, ${failures} failures`);
if (failures > 0) process.exitCode = 1;
