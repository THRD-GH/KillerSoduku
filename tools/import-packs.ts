/**
 * Imports the reference app's puzzle packs so "Fixed" mode can play them.
 *
 *   node tools/import-packs.ts <dir-with-nks-files>
 *
 * Levels come from the rating digit in field 1, not from the filename — see
 * tools/analyse-packs.ts, which shows difficulty is flat across files and
 * monotone across that digit.
 *
 * Output lands in public/packs/ and is gitignored: it is another app's content,
 * extracted from a copy you own, for local play. Keep it out of anything you
 * publish.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node tools/import-packs.ts <dir-with-nks-files>');
  process.exit(1);
}

const out = join(process.cwd(), 'public', 'packs');
mkdirSync(out, { recursive: true });

const byLevel = new Map<string, string[]>();
let skipped = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.nks')).sort()) {
  for (const line of readFileSync(join(dir, file), 'latin1').split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const [flag, letters, sums, solution] = line.split('|');
    if (letters?.length !== 81 || solution?.length !== 81 || !/^[1-6]$/.test(flag)) {
      skipped++;
      continue;
    }
    // Cage letters, cage sums, solution. The rating digit is dropped: it has
    // done its job by choosing the level.
    if (!byLevel.has(flag)) byLevel.set(flag, []);
    byLevel.get(flag)!.push(`${letters}|${sums}|${solution}`);
  }
}

const counts: Record<string, number> = {};
for (const [level, puzzles] of [...byLevel].sort()) {
  counts[level] = puzzles.length;
  writeFileSync(join(out, `level-${level}.json`), JSON.stringify(puzzles));
  console.log(`level ${level}: ${puzzles.length} puzzles`);
}

writeFileSync(join(out, 'index.json'), JSON.stringify({ counts }));
console.log(`\nwrote public/packs/ (${skipped} lines skipped)`);
