import { CELLS, PEERS, bit, maskToDigit, popcount } from '../core/grid.ts';
import { buildConstraints, propagatedCandidates } from '../core/solver.ts';
import { combosFor } from '../core/combos.ts';
import type { Cage, Puzzle, PuzzleId } from '../core/types.ts';
import type { Settings } from './storage.ts';

interface CellDelta {
  index: number;
  value: number;
  pencil: number;
}

/** One user action, stored as the state it replaced. Undo pops; there is no redo. */
type Move = CellDelta[];

export class Game {
  readonly id: PuzzleId;
  readonly puzzle: Puzzle;
  /** Entry digit per cell, 0 when empty. */
  values: number[];
  /** Candidate bitmask per cell. */
  pencils: number[];
  selected = -1;
  elapsedMs = 0;
  hints = 0;
  checks = 0;
  completed = false;
  /** Cells flagged wrong by the last [Check]. Cleared as soon as they change. */
  errors = new Set<number>();
  private history: Move[] = [];
  private cageIndex: Int16Array;

  constructor(id: PuzzleId, puzzle: Puzzle, restore?: { values: number[]; pencils: number[] }) {
    this.id = id;
    this.puzzle = puzzle;
    this.values = restore ? [...restore.values] : new Array<number>(CELLS).fill(0);
    this.pencils = restore ? [...restore.pencils] : new Array<number>(CELLS).fill(0);
    this.cageIndex = new Int16Array(CELLS).fill(-1);
    puzzle.cages.forEach((cage, i) => cage.cells.forEach((c) => (this.cageIndex[c] = i)));
  }

  cageAt(index: number): Cage {
    return this.puzzle.cages[this.cageIndex[index]];
  }

  cageIndexAt(index: number): number {
    return this.cageIndex[index];
  }

  get filledCount(): number {
    return this.values.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
  }

  /** How many of `digit` are placed, so the numpad can grey out finished digits. */
  countOf(digit: number): number {
    return this.values.reduce((n, v) => n + (v === digit ? 1 : 0), 0);
  }

  private record(indices: number[]): void {
    this.history.push(
      indices.map((index) => ({ index, value: this.values[index], pencil: this.pencils[index] })),
    );
    for (const i of indices) this.errors.delete(i);
  }

  /** Fold more cells into the move already in progress, so undo stays atomic. */
  private recordAlso(indices: number[]): void {
    const move = this.history[this.history.length - 1];
    if (!move) return;
    for (const index of indices) {
      if (move.some((d) => d.index === index)) continue;
      move.push({ index, value: this.values[index], pencil: this.pencils[index] });
      this.errors.delete(index);
    }
  }

  /**
   * Forcing an answer rules that digit out for every cell sharing its row,
   * column or box, so strike it from their pencil marks. Folded into the
   * current move: one undo puts the candidates back along with the answer.
   *
   * Only the deliberate gestures do this — long-click and double-click. A
   * plain tap is far too easy to make by accident to be wiping candidates
   * across the grid.
   */
  private cleanPeers(index: number, digit: number, settings: Settings): number {
    if (!settings.autoRemoveCandidates) return 0;
    const b = bit(digit);
    const targets = PEERS[index].filter((p) => this.values[p] === 0 && (this.pencils[p] & b) !== 0);
    if (targets.length === 0) return 0;
    this.recordAlso(targets);
    for (const p of targets) this.pencils[p] &= ~b;
    return targets.length;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;
    for (const { index, value, pencil } of move) {
      this.values[index] = value;
      this.pencils[index] = pencil;
      this.errors.delete(index);
    }
    this.completed = false;
    return true;
  }

  /**
   * A numpad tap. The cell holds a set of digits: one digit shows as an entry,
   * two or more show as candidates — which is why tapping a second digit turns
   * an entry into pencil marks, and tapping a candidate removes it.
   */
  tapDigit(index: number, digit: number, settings: Settings): void {
    if (index < 0 || this.completed) return;
    this.record([index]);
    const b = bit(digit);

    if (this.values[index] !== 0) {
      if (this.values[index] === digit && !settings.allowSingleCandidates) {
        this.values[index] = 0;
        return;
      }
      // Demote the entry into the candidate set, then toggle the new digit in.
      this.pencils[index] = bit(this.values[index]);
      this.values[index] = 0;
    }

    this.pencils[index] ^= b;

    if (!settings.allowSingleCandidates && popcount(this.pencils[index]) === 1) {
      this.values[index] = maskToDigit(this.pencils[index]);
      this.pencils[index] = 0;
      // Deliberately no peer cleanup here: a tap is easy to make by accident,
      // and it should never strip candidates elsewhere in the grid.
    }
  }

  /** Long-click or double-click: this digit is the answer, candidates go away. */
  forceDigit(index: number, digit: number, settings: Settings): number {
    if (index < 0 || this.completed) return 0;
    this.record([index]);
    this.values[index] = digit;
    this.pencils[index] = 0;
    return this.cleanPeers(index, digit, settings);
  }

  clearCell(index: number): void {
    if (index < 0 || this.completed) return;
    if (this.values[index] === 0 && this.pencils[index] === 0) return;
    this.record([index]);
    this.values[index] = 0;
    this.pencils[index] = 0;
  }

  /** [Check] — flag entries that disagree with the solution. */
  check(): number {
    this.checks++;
    this.errors.clear();
    for (let i = 0; i < CELLS; i++) {
      if (this.values[i] !== 0 && this.values[i] !== this.puzzle.solution[i]) this.errors.add(i);
    }
    return this.errors.size;
  }

  /** [Hint] — fill one correct digit, preferring the selected cell. */
  hint(): number | null {
    const wrong: number[] = [];
    const empty: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      if (this.values[i] === 0) empty.push(i);
      else if (this.values[i] !== this.puzzle.solution[i]) wrong.push(i);
    }
    // Correcting a mistake helps more than filling a fresh cell.
    const pool = wrong.length > 0 ? wrong : empty;
    if (pool.length === 0) return null;
    const target = pool.includes(this.selected) ? this.selected : pool[0];
    this.hints++;
    this.record([target]);
    this.values[target] = this.puzzle.solution[target];
    this.pencils[target] = 0;
    return target;
  }

  /** Every cell filled and correct. */
  isSolved(): boolean {
    for (let i = 0; i < CELLS; i++) if (this.values[i] !== this.puzzle.solution[i]) return false;
    return true;
  }

  restart(): void {
    this.record(Array.from({ length: CELLS }, (_, i) => i));
    this.values.fill(0);
    this.pencils.fill(0);
    this.errors.clear();
    this.completed = false;
    this.hints = 0;
    this.checks = 0;
  }

  /**
   * Lazy Mode: cages with exactly one possible combination get their digits
   * written in as candidates. Counts as a single move so undo takes it all back.
   */
  fillSingleCombinationCages(): number {
    const touched: number[] = [];
    const pending: { index: number; mask: number }[] = [];

    for (const cage of this.puzzle.cages) {
      const combos = combosFor(cage.cells.length, cage.sum);
      if (combos.length !== 1) continue;
      for (const index of cage.cells) {
        if (this.values[index] !== 0 || this.pencils[index] === combos[0]) continue;
        touched.push(index);
        pending.push({ index, mask: combos[0] });
      }
    }

    if (touched.length === 0) return 0;
    this.record(touched);
    for (const { index, mask } of pending) this.pencils[index] = mask;
    return touched.length;
  }

  /** Sum calculator [Auto]: write one combination into the cage's empty cells. */
  fillCombination(cageIndex: number, mask: number): number {
    const cage = this.puzzle.cages[cageIndex];
    const targets = cage.cells.filter((c) => this.values[c] === 0);
    if (targets.length === 0) return 0;
    this.record(targets);
    for (const c of targets) this.pencils[c] = mask;
    return targets.length;
  }

  /** Candidates a strong solver can still justify — used to sanity-check hints. */
  logicalCandidates(): Uint16Array | null {
    const start = new Uint16Array(CELLS).fill(0b111111111);
    for (let i = 0; i < CELLS; i++) if (this.values[i] !== 0) start[i] = bit(this.values[i]);
    return propagatedCandidates(buildConstraints(this.puzzle.cages), start);
  }
}
