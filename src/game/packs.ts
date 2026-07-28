import type { Cage, Level, Puzzle } from '../core/types.ts';

/**
 * The reference app's shipped puzzles, imported by tools/import-packs.ts.
 * Absent packs are not an error — Fixed mode simply switches itself off.
 */
/** Resolved lazily so the parsing helpers can also be used outside Vite. */
const packBase = (): string => {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  return `${env?.BASE_URL ?? '/'}packs/`;
};

let counts: Record<number, number> | null | undefined;
const loaded = new Map<Level, string[]>();

/** Puzzles available per level, or null when no packs are installed. */
export async function packCounts(): Promise<Record<number, number> | null> {
  if (counts !== undefined) return counts ?? null;
  try {
    const res = await fetch(`${packBase()}index.json`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { counts: Record<string, number> };
    counts = Object.fromEntries(Object.entries(data.counts).map(([k, v]) => [Number(k), v]));
  } catch {
    counts = null;
  }
  return counts;
}

async function levelPack(level: Level): Promise<string[]> {
  const cached = loaded.get(level);
  if (cached) return cached;
  const res = await fetch(`${packBase()}level-${level}.json`);
  if (!res.ok) throw new Error(`pack for level ${level} is missing`);
  const puzzles = (await res.json()) as string[];
  loaded.set(level, puzzles);
  return puzzles;
}

/**
 * Records are `cageLetters|sums|solution`. Each distinct letter is one cage,
 * and the sums are listed in sorted-letter order.
 */
export function parsePackRecord(record: string, level: Level, number: number): Puzzle {
  const [letters, sums, solution] = record.split('|');
  if (letters?.length !== 81 || solution?.length !== 81) {
    throw new Error(`malformed pack record ${level}-${number}`);
  }

  const groups = new Map<string, number[]>();
  for (let i = 0; i < 81; i++) {
    const key = letters[i];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }

  const ids = [...groups.keys()].sort();
  const values = sums.split(',').map(Number);
  if (values.length !== ids.length) throw new Error(`cage/sum mismatch in ${level}-${number}`);

  const cages: Cage[] = ids.map((id, i) => ({ cells: groups.get(id)!, sum: values[i] }));
  return {
    cages,
    solution: [...solution].map(Number),
    difficulty: level,
    seed: number,
    rating: level - 1,
  };
}

export async function fixedPuzzle(level: Level, number: number): Promise<Puzzle> {
  const pack = await levelPack(level);
  const record = pack[number - 1];
  if (!record) throw new Error(`puzzle ${level}-${number} is not in the pack`);
  return parsePackRecord(record, level, number);
}
