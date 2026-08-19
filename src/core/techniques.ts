import { ALL_DIGITS, CELLS, PEERS, UNITS, bit, boxOf, colOf, popcount, rowOf } from './grid.ts';
import { combosFor } from './combos.ts';
import type { Cage } from './types.ts';

export type Candidates = Uint16Array;

export function initialCandidates(): Candidates {
  return new Uint16Array(CELLS).fill(ALL_DIGITS);
}

/** A group of cells with a known total. `distinct` groups also forbid repeats. */
interface SumGroup {
  cells: number[];
  sum: number;
  distinct: boolean;
}

export interface Constraints {
  cages: Cage[];
  /** Innies/outies of a single unit: known sum, and all distinct. */
  unitRemainder: Cage[];
  /** Innies/outies across two or three units: known sum, repeats allowed. */
  regionRemainder: SumGroup[];
  /** Cages inside one unit, paired with the rest of that unit. */
  locked: { cage: Cage; outside: number[] }[];
  /** Cells that total a known amount *more* than other cells — see below. */
  signed: SignedGroup[];
  /**
   * Cages touching each unit, with the cells of each that land in it. Cages
   * sharing a unit cannot want the same digits there — whether they lie wholly
   * inside it or only reach into it.
   */
  unitParts: { cage: Cage; inside: number[] }[][];
}

/**
 * sum(plus) - sum(minus) = total.
 *
 * Everything else here can only say "these cells total N". A cage that
 * straddles a unit needs the other sentence: the unit's leftover cells beyond
 * that cage total a known amount more than the part of the cage hanging
 * outside. On 6-4 the top-right box gives R2C7 + R3C7 - R4C9 = 14, and since
 * two cells cannot reach past 17, R4C9 is 3 at most — a bound no plain total
 * can express.
 */
export interface SignedGroup {
  plus: number[];
  minus: number[];
  total: number;
}

const MAX_DISTINCT_REMAINDER = 6;

/**
 * How many cells a unit's cages may spill before its outies stop being worth
 * the arithmetic. A handful is where the deduction lives; a dozen loose cells
 * with only a total between them says nothing.
 */
const MAX_SPILL = 6;

/** Either side of a signed group; beyond a handful the bounds say nothing. */
const MAX_SIGNED = 5;

/**
 * Every shape that can be made from whole units of one kind.
 *
 * N units total 45N — that is all the rule of 45 ever says — so there is
 * nothing special about a band of three, or about the units being neighbours.
 * Two boxes side by side, three in an L, the four corners: each is a region
 * whose total is known, and each can leave a cage hanging over its edge with
 * something to say about it.
 *
 * All three families are enumerated whole: every subset of the rows, of the
 * columns, and of the nine blocks. Mixing families is left alone, because a row
 * and a box overlap and a cell counted twice breaks the arithmetic — while
 * within a family the units are disjoint by construction.
 *
 * Sets of one are left to unitRemainder, which reasons about them far better:
 * those cells share a unit, so they are distinct, and it can work with the
 * combinations rather than only with the total. Sets of nine are the whole
 * grid, where every cage is inside and nothing is left over. The rest — 501
 * shapes per family — cost nothing to enumerate and are kept only when what
 * they leave over is small enough to be worth arithmetic.
 */
function regions(): number[][][] {
  const rows = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
  const cols = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c));
  const boxes = Array.from({ length: 9 }, (_, b) => {
    const top = Math.floor(b / 3) * 3;
    const left = (b % 3) * 3;
    return Array.from({ length: 9 }, (_, i) => (top + Math.floor(i / 3)) * 9 + left + (i % 3));
  });

  const out: number[][][] = [];
  for (const family of [rows, cols, boxes]) {
    for (let mask = 1; mask < 512; mask++) {
      const chosen: number[][] = [];
      for (let i = 0; i < 9; i++) if (mask & (1 << i)) chosen.push(family[i]);
      if (chosen.length < 2 || chosen.length > 8) continue;
      out.push(chosen);
    }
  }
  return out;
}

const REGIONS = regions();

/*
 * The shapes never change, so neither do their cells. Rebuilding a set for each
 * of the fifteen hundred of them, for every puzzle, was most of the cost of
 * knowing about them at all.
 */
const REGION_CELLS: Set<number>[] = REGIONS.map((region) => new Set(region.flat()));

export function buildConstraints(cages: Cage[]): Constraints {
  const owner = new Int16Array(CELLS).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((cell) => (owner[cell] = i)));

  const unitRemainder: Cage[] = [];
  const regionRemainder: SumGroup[] = [];
  const locked: { cage: Cage; outside: number[] }[] = [];
  const signed: SignedGroup[] = [];
  const unitParts: { cage: Cage; inside: number[] }[][] = [];

  for (const unit of UNITS) {
    const inUnit = new Set(unit);
    const ids = new Set<number>();
    for (const cell of unit) ids.add(owner[cell]);

    let insideSum = 0;
    let straddlingSum = 0;
    const leftover: number[] = [];
    const spilled: number[] = [];
    const contained: Cage[] = [];
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => inUnit.has(c))) {
        insideSum += cage.sum;
        if (cage.cells.length >= 2 && cage.cells.length <= 4) contained.push(cage);
      } else {
        straddlingSum += cage.sum;
        for (const c of cage.cells) (inUnit.has(c) ? leftover : spilled).push(c);
      }
    }

    for (const cage of contained) {
      const own = new Set(cage.cells);
      locked.push({ cage, outside: unit.filter((c) => !own.has(c)) });
    }
    /*
     * Every cage with a cell in this unit, whole or not. A cage hanging over
     * the edge still cannot take digits its neighbour in here has taken, and on
     * 6-4's bottom-right box that is the whole game: the 6 fills three cells
     * with 1, 2 and 3, so the 7 reaching in from the left is down to a 4, 5 or
     * 6 there, and the 21 reaching down from above must find its three digits
     * among what is left.
     */
    const parts: { cage: Cage; inside: number[] }[] = [];
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.length > MAX_PART_CAGE) continue;
      parts.push({ cage, inside: cage.cells.filter((c) => inUnit.has(c)) });
    }
    if (parts.length >= 2) unitParts.push(parts);
    if (leftover.length >= 1 && leftover.length <= MAX_DISTINCT_REMAINDER) {
      unitRemainder.push({ cells: leftover.sort((a, b) => a - b), sum: 45 - insideSum });
    }

    /*
     * And the other half of the same subtraction — the outies.
     *
     * The cells of those straddling cages that fall *outside* the unit are
     * known too: their cages total `straddlingSum`, the part of them lying in
     * the unit has to make up whatever the wholly-inside cages leave of 45, and
     * the difference is what sticks out. Only the innies were ever built, so
     * half of a technique the app already names went missing.
     *
     * On 6-4 this is the step after the centre: box 5 is covered by a 22 and a
     * 36, neither wholly inside, so the three cells they spill — R5C3, R4C7,
     * R6C7 — total 58 - 45 = 13, which is what forces the 36 cage's share of
     * the centre block. These cells sit in different units, so they may repeat
     * a digit and only the total is known.
     */
    /*
     * And the same subtraction once more, this time keeping a cage whole.
     *
     * The unit's leftovers are the inside parts of the cages that straddle it.
     * Take one of those cages: its inside part is its total less whatever hangs
     * outside, so the *other* leftovers come to (45 - inside cages) - that
     * cage's total, plus the cells it spills. Written as a difference, it fixes
     * a relationship between two groups that no single total can.
     *
     * This is the step after box 3's arithmetic on 6-4: the leftovers are
     * R2C7, R3C7 and the 9-cage's two cells, and pulling the 9-cage out leaves
     * R2C7 + R3C7 - R4C9 = 14.
     */
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => inUnit.has(c))) continue;
      const own = new Set(cage.cells);
      const plus = leftover.filter((c) => !own.has(c));
      const minus = cage.cells.filter((c) => !inUnit.has(c));
      if (plus.length === 0 || plus.length > MAX_SIGNED || minus.length > MAX_SIGNED) continue;
      signed.push({ plus, minus, total: 45 - insideSum - cage.sum });
    }

    if (spilled.length >= 1 && spilled.length <= MAX_SPILL) {
      regionRemainder.push({
        cells: spilled.sort((a, b) => a - b),
        sum: straddlingSum - (45 - insideSum),
        distinct: false,
      });
    }
  }

  // The same subtraction over runs of lines. Cells left over here span more
  // than one unit, so they may repeat a digit — only the total is known.
  for (let index = 0; index < REGIONS.length; index++) {
    const region = REGIONS[index];
    const cells = REGION_CELLS[index];
    const ids = new Set<number>();
    for (const c of cells) ids.add(owner[c]);

    let insideSum = 0;
    let straddlingSum = 0;
    const leftover: number[] = [];
    const spilled: number[] = [];
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => cells.has(c))) insideSum += cage.sum;
      else {
        straddlingSum += cage.sum;
        for (const c of cage.cells) (cells.has(c) ? leftover : spilled).push(c);
      }
    }
    const sum = 45 * region.length - insideSum;
    if (leftover.length >= 1 && leftover.length <= 10) {
      regionRemainder.push({ cells: [...leftover].sort((a, b) => a - b), sum, distinct: false });
    }

    /*
     * A band has an outside too, and cages hang below it exactly as they hang
     * outside a single box. Rows 1-3 of 6-4 come to 135, the cages wholly
     * inside come to 122, so the two straddling the bottom edge leave
     * 30 - 13 = 17 across the three cells they spill into row 4.
     */
    if (spilled.length >= 1 && spilled.length <= MAX_SPILL) {
      regionRemainder.push({
        cells: [...spilled].sort((a, b) => a - b),
        sum: straddlingSum - sum,
        distinct: false,
      });
    }

    // And the same cage-at-a-time difference, so a band can pin a cell the way
    // a box can — see the signed groups built for units above.
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => cells.has(c))) continue;
      const own = new Set(cage.cells);
      const plus = leftover.filter((c) => !own.has(c));
      const minus = cage.cells.filter((c) => !cells.has(c));
      if (plus.length === 0 || plus.length > MAX_SIGNED || minus.length > MAX_SIGNED) continue;
      signed.push({ plus, minus, total: sum - cage.sum });
    }
  }

  /*
   * Shapes overlap, and many of them leave the same cells over — three boxes in
   * a row and the band across them are different regions with identical
   * arithmetic. Every stored group is walked on every pass of the technique, so
   * the duplicates are pure cost: with 501 shapes per family they multiplied the
   * work over the whole collection sixfold before this.
   */
  const seen = new Set<string>();
  const uniqueRegions = regionRemainder.filter((group) => {
    const key = `${group.cells.join(',')}=${group.sum}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const signedSeen = new Set<string>();
  const uniqueSigned = signed.filter((group) => {
    const key = `${group.plus.join(',')}-${group.minus.join(',')}=${group.total}`;
    if (signedSeen.has(key)) return false;
    signedSeen.add(key);
    return true;
  });

  return {
    cages,
    unitRemainder,
    regionRemainder: uniqueRegions,
    locked,
    signed: uniqueSigned,
    unitParts,
  };
}

// ---------------------------------------------------------------- primitives

const eliminate = (cand: Candidates, cell: number, mask: number): number => {
  const next = cand[cell] & ~mask;
  if (next === cand[cell]) return 0;
  if (next === 0) return -1;
  cand[cell] = next;
  return 1;
};

const restrict = (cand: Candidates, cell: number, mask: number): number => {
  const next = cand[cell] & mask;
  if (next === cand[cell]) return 0;
  if (next === 0) return -1;
  cand[cell] = next;
  return 1;
};

/** Result of one technique pass: -1 contradiction, 0 nothing, 1 progress. */
type Outcome = -1 | 0 | 1;

function nakedSingles(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (let i = 0; i < CELLS; i++) {
    const m = cand[i];
    if (m === 0) return -1;
    if (popcount(m) !== 1) continue;
    for (const p of PEERS[i]) {
      const r = eliminate(cand, p, m);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

function hiddenSingles(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let count = 0;
      let where = -1;
      for (const c of unit) {
        if (cand[c] & b) {
          count++;
          where = c;
        }
      }
      if (count === 0) return -1;
      if (count === 1 && cand[where] !== b) {
        cand[where] = b;
        changed = 1;
      }
    }
  }
  return changed;
}

/**
 * No digit twice in a cage. Trivial reasoning, but it is the only thing
 * enforcing distinctness in cages too big to enumerate (8 and 9 cells), where
 * the combination rules have nothing to say — a nine-cell cage sums to 45 and
 * holds every digit, so its only real content is that its cells all differ.
 */
function cageDistinct(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    for (const cell of cage.cells) {
      const m = cand[cell];
      if (m === 0) return -1;
      if (popcount(m) !== 1) continue;
      for (const other of cage.cells) {
        if (other === cell) continue;
        const r = eliminate(cand, other, m);
        if (r === -1) return -1;
        if (r === 1) changed = 1;
      }
    }
  }
  return changed;
}

/** Digits that survive in a cage when only the sum, not placement, is checked. */
function cageCombinations(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    const cells = cage.cells;
    const n = cells.length;
    let union = 0;
    let any = false;

    for (const combo of combosFor(n, cage.sum)) {
      let live = true;
      for (let i = 0; i < n && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
      let rest = combo;
      while (rest && live) {
        const b = rest & -rest;
        rest ^= b;
        let placeable = false;
        for (let i = 0; i < n && !placeable; i++) if (cand[cells[i]] & b) placeable = true;
        if (!placeable) live = false;
      }
      if (!live) continue;
      any = true;
      union |= combo;
    }

    if (!any) return -1;
    for (const c of cells) {
      const r = restrict(cand, c, union);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/**
 * Full arc consistency on a cage: a digit stays only if some complete
 * assignment of the whole cage — distinct digits, right total — uses it there.
 */
function cageArcConsistency(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    const r = cageSupport(cand, cage);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

function cageSupport(cand: Candidates, cage: Cage): Outcome {
  const cells = cage.cells;
  const n = cells.length;
  if (n > 7) return 0; // enumeration stops paying off past this
  const allowed = new Array<number>(n).fill(0);
  const path = new Int8Array(n);
  let feasible = false;

  const assign = (i: number, used: number, combo: number): boolean => {
    if (i === n) {
      for (let k = 0; k < n; k++) allowed[k] |= bit(path[k]);
      return true;
    }
    let m = cand[cells[i]] & combo & ~used;
    let found = false;
    while (m) {
      const b = m & -m;
      m ^= b;
      path[i] = 32 - Math.clz32(b);
      if (assign(i + 1, used | b, combo)) found = true;
    }
    return found;
  };

  for (const combo of combosFor(n, cage.sum)) {
    let live = true;
    for (let i = 0; i < n && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
    if (!live) continue;

    let covered = true;
    for (let i = 0; i < n; i++) {
      const want = cand[cells[i]] & combo;
      if ((allowed[i] & want) !== want) {
        covered = false;
        break;
      }
    }
    if (covered) {
      feasible = true;
      continue;
    }
    if (assign(0, 0, combo)) feasible = true;
  }

  if (!feasible) return -1;
  let changed: Outcome = 0;
  for (let i = 0; i < n; i++) {
    const r = restrict(cand, cells[i], allowed[i]);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

/**
 * Locked candidates. Pointing: a digit confined to one box within a line
 * leaves the rest of the box. Claiming: confined to one line within a box, it
 * leaves the rest of the line.
 */
function lockedCandidates(cand: Candidates): Outcome {
  let changed: Outcome = 0;

  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const isBox = u >= 18;
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const spots = unit.filter((c) => cand[c] & b);
      if (spots.length < 2 || spots.length > 3) continue;
      const inside = new Set(spots);

      const sweep = (cells: number[]): boolean => {
        for (const c of cells) {
          if (inside.has(c)) continue;
          const r = eliminate(cand, c, b);
          if (r === -1) return false;
          if (r === 1) changed = 1;
        }
        return true;
      };

      if (isBox) {
        // Pointing: confined to one line inside this box, so it leaves the line.
        if (spots.every((c) => rowOf(c) === rowOf(spots[0]))) {
          if (!sweep(UNITS[rowOf(spots[0])])) return -1;
        }
        if (spots.every((c) => colOf(c) === colOf(spots[0]))) {
          if (!sweep(UNITS[9 + colOf(spots[0])])) return -1;
        }
      } else if (spots.every((c) => boxOf(c) === boxOf(spots[0]))) {
        // Claiming: confined to one box inside this line, so it leaves the box.
        if (!sweep(UNITS[18 + boxOf(spots[0])])) return -1;
      }
    }
  }
  return changed;
}

/** Naked pairs and triples: n cells in a unit sharing exactly n candidates. */
function nakedSubsets(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    const open = unit.filter((c) => popcount(cand[c]) > 1);
    for (let size = 2; size <= 4; size++) {
      const pool = open.filter((c) => popcount(cand[c]) <= size);
      const n = pool.length;
      if (n <= size) continue;

      const walk = (start: number, picked: number[], mask: number): boolean => {
        if (picked.length === size) {
          if (popcount(mask) !== size) return true;
          const inside = new Set(picked);
          for (const c of unit) {
            if (inside.has(c)) continue;
            const r = eliminate(cand, c, mask);
            if (r === -1) return false;
            if (r === 1) changed = 1;
          }
          return true;
        }
        for (let i = start; i < n; i++) {
          const next = mask | cand[pool[i]];
          if (popcount(next) > size) continue;
          if (!walk(i + 1, [...picked, pool[i]], next)) return false;
        }
        return true;
      };
      if (!walk(0, [], 0)) return -1;
    }
  }
  return changed;
}

/** Hidden pairs and triples: n digits in a unit confined to exactly n cells. */
function hiddenSubsets(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    const spots = new Map<number, number[]>();
    for (let d = 1; d <= 9; d++) {
      const cells = unit.filter((c) => cand[c] & bit(d));
      if (cells.length >= 2 && cells.length <= 3) spots.set(d, cells);
    }
    const digits = [...spots.keys()];

    for (let size = 2; size <= 4; size++) {
      const walk = (start: number, picked: number[], cells: Set<number>): boolean => {
        if (picked.length === size) {
          if (cells.size !== size) return true;
          const mask = picked.reduce((m, d) => m | bit(d), 0);
          for (const c of cells) {
            const r = restrict(cand, c, mask);
            if (r === -1) return false;
            if (r === 1) changed = 1;
          }
          return true;
        }
        for (let i = start; i < digits.length; i++) {
          const merged = new Set([...cells, ...spots.get(digits[i])!]);
          if (merged.size > size) continue;
          if (!walk(i + 1, [...picked, digits[i]], merged)) return false;
        }
        return true;
      };
      if (!walk(0, [], new Set())) return -1;
    }
  }
  return changed;
}

/** Digits every surviving combination of an enclosed cage must contain. */
function cageLocking(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const { cage, outside } of cons.locked) {
    const cells = cage.cells;
    let common = ALL_DIGITS;
    let any = false;
    for (const combo of combosFor(cells.length, cage.sum)) {
      let live = true;
      for (let i = 0; i < cells.length && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
      if (!live) continue;
      any = true;
      common &= combo;
      if (common === 0) break;
    }
    if (!any) return -1;
    if (common === 0) continue;
    for (const c of outside) {
      const r = eliminate(cand, c, common);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/** Innies and outies of a single unit — a known sum over distinct digits. */
function unitRemainders(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const group of cons.unitRemainder) {
    const r = cageSupport(cand, group);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

/**
 * Innies and outies across a band or stack. Those cells span several units so
 * digits may repeat — only the total is known, which still bounds each cell.
 */
/** How far the all-at-once search will go before it settles for what it has. */
const MAX_UNIT_NODES = 40000;

/** Cages bigger than this are left out of the unit-by-unit comparison. */
const MAX_PART_CAGE = 5;

/** How many ways a cage may be filled before it stops being worth listing. */
const MAX_FILLINGS = 400;

/**
 * Every way a cage could be filled, given what its cells still allow: the
 * digits in cell order, and the set of them as a mask.
 */
function fillings(cand: Candidates, cage: Cage): { digits: number[]; mask: number }[] | null {
  const out: { digits: number[]; mask: number }[] = [];
  const digits: number[] = [];
  let overflowed = false;

  const walk = (at: number, used: number, sum: number): void => {
    if (overflowed) return;
    if (at === cage.cells.length) {
      if (sum === cage.sum) {
        if (out.length >= MAX_FILLINGS) overflowed = true;
        else out.push({ digits: [...digits], mask: used });
      }
      return;
    }
    const mask = cand[cage.cells[at]];
    for (let d = 1; d <= 9; d++) {
      if (!(mask & bit(d)) || used & bit(d) || sum + d > cage.sum) continue;
      digits.push(d);
      walk(at + 1, used | bit(d), sum + d);
      digits.pop();
      if (overflowed) return;
    }
  };
  walk(0, 0, 0);
  return overflowed ? null : out;
}

/**
 * Two cages in the same unit cannot want the same digits — which is the single
 * candidate rule one level up: instead of a cell whose options are used up by
 * its neighbours, a whole cage whose fillings are used up by the cage beside
 * it.
 *
 * A 14 in two cells is 5+9 or 6+8. An 11 in two cells sharing that row could be
 * 2+9, 3+8, 4+7 or 5+6 — except 5+6, which leaves the 14 nothing: 5 is taken
 * from one of its fillings and 6 from the other. So 5 and 6 come out of the 11,
 * having never touched a cell of it directly.
 *
 * Each cage's fillings are cut down to those that leave every other cage in the
 * unit something, over and over until nothing more falls, and what survives says
 * what each cell can still be.
 */
function cageInteraction(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  // A cage touching three units would otherwise be filled out three times over.
  const cache = new Map<Cage, { digits: number[]; mask: number }[] | null>();

  for (const group of cons.unitParts) {
    const options: { digits: number[]; mask: number }[][] = [];
    let listable = true;
    for (const { cage, inside } of group) {
      let list = cache.get(cage);
      if (list === undefined) {
        list = fillings(cand, cage);
        cache.set(cage, list);
      }
      if (list === null) {
        listable = false;
        break;
      }
      if (list.length === 0) return -1;

      /*
       * Only the part inside this unit is the unit's business. Two fillings
       * that agree in here and differ outside are one option as far as this
       * comparison goes, so they are folded together — it keeps the lists short
       * and the digits outside cannot be judged from in here anyway.
       */
      const seen = new Set<string>();
      const projected: { digits: number[]; mask: number }[] = [];
      for (const filling of list) {
        const digits: number[] = [];
        let mask = 0;
        for (const cell of inside) {
          const digit = filling.digits[cage.cells.indexOf(cell)];
          digits.push(digit);
          mask |= bit(digit);
        }
        const key = digits.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        projected.push({ digits, mask });
      }
      options.push(projected);
    }
    if (!listable) continue;

    /*
     * All of them at once, not two at a time.
     *
     * Taken in pairs, an option survives if some option of each other cage
     * avoids it — which misses three cages that clash only together. Two cages
     * that could each take a 5 are fine in isolation; a third that needs the 5
     * as well is not, and no pair of the three ever notices. So an option is
     * kept only when the cages beside it can all be filled around it at the
     * same time, which is the same step from a pair to a triple that a naked
     * subset makes.
     *
     * The search is bounded, and a bound reached means keeping the option: a
     * technique may fail to spot something, never claim something false.
     */
    let nodes = 0;
    const order = options.map((_, i) => i).sort((a, b) => options[a].length - options[b].length);
    const roomForTheRest = (fixed: number, taken: number): boolean => {
      const walk = (at: number, used: number): boolean => {
        if (++nodes > MAX_UNIT_NODES) return true;
        if (at === order.length) return true;
        const i = order[at];
        if (i === fixed) return walk(at + 1, used);
        for (const option of options[i]) {
          if ((option.mask & used) === 0 && walk(at + 1, used | option.mask)) return true;
        }
        return false;
      };
      return walk(0, taken);
    };

    for (let settled = false; !settled; ) {
      settled = true;
      for (let i = 0; i < group.length; i++) {
        const kept = options[i].filter((option) => roomForTheRest(i, option.mask));
        if (kept.length === 0) return -1;
        if (kept.length !== options[i].length) {
          options[i] = kept;
          settled = false;
        }
      }
      if (nodes > MAX_UNIT_NODES) break;
    }

    for (let i = 0; i < group.length; i++) {
      const { inside } = group[i];
      for (let k = 0; k < inside.length; k++) {
        let mask = 0;
        for (const filling of options[i]) mask |= bit(filling.digits[k]);
        const r = restrict(cand, inside[k], mask);
        if (r === -1) return -1;
        if (r === 1) changed = 1;
      }
    }
  }
  return changed;
}

/**
 * Bounds from a difference. Each cell is whatever the equation leaves it once
 * every other cell is pushed to its extreme, which is the arithmetic a player
 * does out loud: "those two cannot make more than seventeen, so this one is
 * three at most."
 */
function signedGroups(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const { plus, minus, total } of cons.signed) {
    const lo: number[] = [];
    const hi: number[] = [];
    for (const c of [...plus, ...minus]) {
      const m = cand[c];
      if (m === 0) return -1;
      lo.push(32 - Math.clz32(m & -m));
      hi.push(32 - Math.clz32(m));
    }
    const plusLo = lo.slice(0, plus.length).reduce((a, b) => a + b, 0);
    const plusHi = hi.slice(0, plus.length).reduce((a, b) => a + b, 0);
    const minusLo = lo.slice(plus.length).reduce((a, b) => a + b, 0);
    const minusHi = hi.slice(plus.length).reduce((a, b) => a + b, 0);
    if (plusHi - minusLo < total || plusLo - minusHi > total) return -1;

    for (let i = 0; i < plus.length; i++) {
      // This cell = total + sum(minus) - sum(the other plus cells).
      const floor = total + minusLo - (plusHi - hi[i]);
      const ceiling = total + minusHi - (plusLo - lo[i]);
      const r = restrict(cand, plus[i], rangeMask(floor, ceiling));
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
    for (let i = 0; i < minus.length; i++) {
      // This cell = sum(plus) - total - sum(the other minus cells).
      const j = plus.length + i;
      const floor = plusLo - total - (minusHi - hi[j]);
      const ceiling = plusHi - total - (minusLo - lo[j]);
      const r = restrict(cand, minus[i], rangeMask(floor, ceiling));
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/** Every digit between two bounds, as a mask. */
function rangeMask(floor: number, ceiling: number): number {
  let mask = 0;
  for (let d = Math.max(1, floor); d <= Math.min(9, ceiling); d++) mask |= bit(d);
  return mask;
}

/** Do these two cells share a row, a column or a box, and so have to differ? */
function sharesUnit(a: number, b: number): boolean {
  if (Math.floor(a / 9) === Math.floor(b / 9)) return true;
  if (a % 9 === b % 9) return true;
  return (
    Math.floor(Math.floor(a / 9) / 3) === Math.floor(Math.floor(b / 9) / 3) &&
    Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3)
  );
}

/** Groups wider than this are left to the bounds; the search would not pay. */
const MAX_EXACT_CELLS = 6;
/** And the search gives up rather than run away on a wide-open grid. */
const MAX_EXACT_NODES = 20000;

/**
 * What a group of cells with a known total can actually be, rather than what
 * its bounds allow.
 *
 * A single unit's leftovers have always been worked out this way — the cells
 * are all in one unit, so they are distinct and the combinations are short.
 * Everything spanning two units fell back to arithmetic on the smallest and
 * largest each cell could be, which cannot tell "these four total 17" from
 * "these four are 1+3+6+7 or 2+3+5+7". Every deduction that prompted this
 * work needed the second sentence.
 *
 * So the assignments are enumerated outright: each cell takes one of its
 * candidates, cells that share a row, column or box must differ, and the total
 * must land. A digit survives in a cell only if some whole assignment puts it
 * there. Cells outside any shared unit may of course repeat, which is the one
 * thing that makes this different from filling a cage.
 *
 * Returns null when the search runs long, and the caller keeps its bounds.
 */
function exactSupport(cand: Candidates, cells: number[], total: number): number[] | null {
  const options = cells.map((c) => {
    const list: number[] = [];
    for (let d = 1; d <= 9; d++) if (cand[c] & bit(d)) list.push(d);
    return list;
  });
  const support = new Array<number>(cells.length).fill(0);
  const chosen = new Array<number>(cells.length).fill(0);

  // Cheapest cells first, so the sum is pinned down before the search widens.
  const order = cells.map((_, i) => i).sort((a, b) => options[a].length - options[b].length);
  const clashes = order.map((i) => order.filter((j) => sharesUnit(cells[i], cells[j])));

  const lowestLeft: number[] = new Array(order.length + 1).fill(0);
  const highestLeft: number[] = new Array(order.length + 1).fill(0);
  for (let at = order.length - 1; at >= 0; at--) {
    const list = options[order[at]];
    if (list.length === 0) return null;
    lowestLeft[at] = lowestLeft[at + 1] + list[0];
    highestLeft[at] = highestLeft[at + 1] + list[list.length - 1];
  }

  let nodes = 0;
  let found = false;

  const walk = (at: number, sum: number): boolean => {
    if (++nodes > MAX_EXACT_NODES) return true;
    if (at === order.length) {
      if (sum !== total) return false;
      found = true;
      for (let i = 0; i < order.length; i++) support[order[i]] |= bit(chosen[order[i]]);
      return false;
    }
    if (sum + lowestLeft[at] > total || sum + highestLeft[at] < total) return false;

    const i = order[at];
    for (const d of options[i]) {
      let clash = false;
      for (const j of clashes[at]) {
        if (chosen[j] === d) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      chosen[i] = d;
      const abandoned = walk(at + 1, sum + d);
      chosen[i] = 0;
      if (abandoned) return true;
    }
    return false;
  };

  const abandoned = walk(0, 0);
  if (abandoned) return null;
  return found ? support : [];
}

function regionRemainders(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const { cells, sum } of cons.regionRemainder) {
    if (cells.length <= MAX_EXACT_CELLS) {
      const support = exactSupport(cand, cells, sum);
      if (support !== null) {
        if (support.length === 0) return -1;
        for (let i = 0; i < cells.length; i++) {
          const r = restrict(cand, cells[i], support[i]);
          if (r === -1) return -1;
          if (r === 1) changed = 1;
        }
        continue;
      }
    }

    const lo: number[] = [];
    const hi: number[] = [];
    for (const c of cells) {
      const m = cand[c];
      if (m === 0) return -1;
      lo.push(32 - Math.clz32(m & -m));
      hi.push(32 - Math.clz32(m));
    }
    const totalLo = lo.reduce((a, b) => a + b, 0);
    const totalHi = hi.reduce((a, b) => a + b, 0);
    if (sum < totalLo || sum > totalHi) return -1;

    for (let i = 0; i < cells.length; i++) {
      const othersLo = totalLo - lo[i];
      const othersHi = totalHi - hi[i];
      let mask = 0;
      for (let d = 1; d <= 9; d++) {
        if (!(cand[cells[i]] & bit(d))) continue;
        if (sum - d >= othersLo && sum - d <= othersHi) mask |= bit(d);
      }
      const r = restrict(cand, cells[i], mask);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/** X-Wing: a digit locked to the same two lines in two crossing lines. */
function xWing(cand: Candidates): Outcome {
  let changed: Outcome = 0;

  const scan = (byRow: boolean): boolean => {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const lines: number[][] = [];
      for (let i = 0; i < 9; i++) {
        const cells: number[] = [];
        for (let j = 0; j < 9; j++) {
          const cell = byRow ? i * 9 + j : j * 9 + i;
          if (cand[cell] & b) cells.push(j);
        }
        lines.push(cells);
      }
      for (let a = 0; a < 9; a++) {
        if (lines[a].length !== 2) continue;
        for (let c = a + 1; c < 9; c++) {
          if (lines[c].length !== 2) continue;
          if (lines[a][0] !== lines[c][0] || lines[a][1] !== lines[c][1]) continue;
          for (const j of lines[a]) {
            for (let i = 0; i < 9; i++) {
              if (i === a || i === c) continue;
              const cell = byRow ? i * 9 + j : j * 9 + i;
              const r = eliminate(cand, cell, b);
              if (r === -1) return false;
              if (r === 1) changed = 1;
            }
          }
        }
      }
    }
    return true;
  };

  if (!scan(true) || !scan(false)) return -1;
  return changed;
}

// ----------------------------------------------------------------- the stack

export interface Technique {
  name: string;
  /** Roughly how hard a person finds it, 1 easiest. */
  difficulty: number;
  run(cand: Candidates, cons: Constraints): Outcome;
}

/**
 * Ordered easiest first. The solver always applies the cheapest technique that
 * fires, so a puzzle's rating is the hardest rung it was ever forced onto.
 */
export const TECHNIQUES: Technique[] = [
  { name: 'naked single', difficulty: 1, run: (c) => nakedSingles(c) },
  { name: 'cage distinct', difficulty: 1, run: (c, k) => cageDistinct(c, k.cages) },
  { name: 'hidden single', difficulty: 1, run: (c) => hiddenSingles(c) },
  { name: 'cage combinations', difficulty: 2, run: (c, k) => cageCombinations(c, k.cages) },
  { name: 'locked candidates', difficulty: 3, run: (c) => lockedCandidates(c) },
  { name: 'cage arc consistency', difficulty: 3, run: (c, k) => cageArcConsistency(c, k.cages) },
  { name: 'naked subset', difficulty: 4, run: (c) => nakedSubsets(c) },
  { name: 'cages sharing a unit', difficulty: 4, run: (c, k) => cageInteraction(c, k) },
  { name: 'hidden subset', difficulty: 4, run: (c) => hiddenSubsets(c) },
  { name: 'cage locking', difficulty: 5, run: (c, k) => cageLocking(c, k) },
  { name: 'innies/outies (unit)', difficulty: 5, run: (c, k) => unitRemainders(c, k) },
  { name: 'innies/outies (band)', difficulty: 6, run: (c, k) => regionRemainders(c, k) },
  { name: 'cage across a unit edge', difficulty: 6, run: (c, k) => signedGroups(c, k) },
  { name: 'x-wing', difficulty: 7, run: (c) => xWing(c) },
];

export const MAX_DIFFICULTY = Math.max(...TECHNIQUES.map((t) => t.difficulty));

export interface Step {
  /** Which technique moved things on. */
  technique: string;
  difficulty: number;
  /** Cells it changed, for pointing at them on the board. */
  cells: number[];
  /** A cell it answered outright, if any. */
  solved: { cell: number; digit: number } | null;
}

/**
 * Striking a placed digit out of its own row, column, box and cage is not a
 * hint — it is bookkeeping any player does without thinking. Settled before
 * looking for the next real step, or every hint would be "we removed some
 * candidates", pointing at half the grid.
 */
const BOOKKEEPING = new Set(['naked single', 'cage distinct']);

/**
 * The next thing a solver would do from this position, using the easiest
 * technique that still achieves something. Returns null when the grid is
 * finished, contradictory, or beyond the technique stack.
 */
export function nextStep(cand: Candidates, cons: Constraints): Step | null {
  for (;;) {
    let moved = false;
    for (const technique of TECHNIQUES) {
      if (!BOOKKEEPING.has(technique.name)) continue;
      const outcome = technique.run(cand, cons);
      if (outcome === -1) return null;
      if (outcome === 1) moved = true;
    }
    if (!moved) break;
  }

  for (const technique of TECHNIQUES) {
    if (BOOKKEEPING.has(technique.name)) continue;
    const before = Uint16Array.from(cand);
    const outcome = technique.run(cand, cons);
    if (outcome === -1) return null;
    if (outcome === 0) continue;

    const cells: number[] = [];
    let solved: Step['solved'] = null;
    for (let i = 0; i < CELLS; i++) {
      if (cand[i] === before[i]) continue;
      cells.push(i);
      if (solved === null && popcount(cand[i]) === 1 && popcount(before[i]) > 1) {
        solved = { cell: i, digit: 32 - Math.clz32(cand[i]) };
      }
    }
    return { technique: technique.name, difficulty: technique.difficulty, cells, solved };
  }
  return null;
}

export interface LogicTrace {
  /** Hardest technique the solve was forced onto. 0 if nothing was needed. */
  hardest: number;
  /** How many times each technique fired. */
  used: Map<string, number>;
}

/**
 * Applies techniques to a fixed point, always reaching for the easiest one
 * that still does something. Returns false only on a contradiction.
 */
export function propagate(
  cand: Candidates,
  cons: Constraints,
  maxDifficulty = MAX_DIFFICULTY,
  trace?: LogicTrace,
): boolean {
  for (;;) {
    let progressed = false;
    for (const technique of TECHNIQUES) {
      if (technique.difficulty > maxDifficulty) break;
      const outcome = technique.run(cand, cons);
      if (outcome === -1) return false;
      if (outcome === 0) continue;
      if (trace) {
        trace.hardest = Math.max(trace.hardest, technique.difficulty);
        trace.used.set(technique.name, (trace.used.get(technique.name) ?? 0) + 1);
      }
      progressed = true;
      break; // restart from the easiest technique
    }
    if (!progressed) return true;
  }
}
