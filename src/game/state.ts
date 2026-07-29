import { CELLS, PEERS, bit, maskToDigit, popcount } from '../core/grid.ts';
import { buildConstraints, propagatedCandidates } from '../core/solver.ts';
import { nextStep } from '../core/techniques.ts';
import type { Step } from '../core/techniques.ts';
import { combosFor } from '../core/combos.ts';
import type { Cage, Puzzle, PuzzleId } from '../core/types.ts';
import type { Settings } from './storage.ts';

interface CellDelta {
  index: number;
  value: number;
  pencil: number;
}

/** One user action, stored as the cells it replaced and what was in them. */
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
  /** Moves taken back, waiting to be reapplied. Emptied by any fresh move. */
  private future: Move[] = [];
  private cageIndex: Int16Array;

  constructor(id: PuzzleId, puzzle: Puzzle, restore?: { values: number[]; pencils: number[] }) {
    this.id = id;
    this.puzzle = puzzle;
    this.values = restore ? [...restore.values] : new Array<number>(CELLS).fill(0);
    this.pencils = restore ? [...restore.pencils] : new Array<number>(CELLS).fill(0);
    this.cageIndex = new Int16Array(CELLS).fill(-1);
    puzzle.cages.forEach((cage, i) => cage.cells.forEach((c) => (this.cageIndex[c] = i)));
  }

  /**
   * Undo/redo flattened for storage: each move becomes a run of
   * index, value, pencil triples. Kept with the saved game so putting a
   * puzzle down and picking it up again does not cost you the history.
   */
  exportHistory(): { past: number[][]; future: number[][] } {
    const encode = (move: Move): number[] =>
      move.flatMap(({ index, value, pencil }) => [index, value, pencil]);
    return { past: this.history.map(encode), future: this.future.map(encode) };
  }

  importHistory(data: { past?: number[][]; future?: number[][] } | undefined): void {
    if (!data) return;
    const decode = (flat: number[]): Move => {
      const move: Move = [];
      for (let i = 0; i + 2 < flat.length; i += 3) {
        move.push({ index: flat[i], value: flat[i + 1], pencil: flat[i + 2] });
      }
      return move;
    };
    this.history = (data.past ?? []).map(decode);
    this.future = (data.future ?? []).map(decode);
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

  private snapshot(indices: number[]): Move {
    return indices.map((index) => ({
      index,
      value: this.values[index],
      pencil: this.pencils[index],
    }));
  }

  /** Swap the recorded cells into the grid, returning what was there before. */
  private apply(move: Move): Move {
    const previous = this.snapshot(move.map((d) => d.index));
    for (const { index, value, pencil } of move) {
      this.values[index] = value;
      this.pencils[index] = pencil;
      this.errors.delete(index);
    }
    return previous;
  }

  private record(indices: number[]): void {
    this.history.push(this.snapshot(indices));
    // Branching off the undone line abandons it, as in any editor.
    this.future.length = 0;
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

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Every mutation is recorded, so repeated undo winds the grid all the way
   * back to how it started — including past a Restart.
   */
  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;
    this.future.push(this.apply(move));
    this.completed = false;
    return true;
  }

  redo(): boolean {
    const move = this.future.pop();
    if (!move) return false;
    // Straight onto the history, not through record(), which would discard
    // the rest of the redo stack.
    this.history.push(this.apply(move));
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

    // Whether this tap took a digit out of the cell rather than putting one in.
    const removing = (this.pencils[index] & b) !== 0;
    this.pencils[index] ^= b;

    // Crossing off candidates until one survives has answered the cell, so it
    // resolves to an entry however the cell was being used. Adding a lone digit
    // is different — that is what "allow single candidates" governs.
    if (popcount(this.pencils[index]) === 1 && (removing || !settings.allowSingleCandidates)) {
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

  /** Entries that disagree with the solution, without flagging them. */
  wrongCount(): number {
    let wrong = 0;
    for (let i = 0; i < CELLS; i++) {
      if (this.values[i] !== 0 && this.values[i] !== this.puzzle.solution[i]) wrong++;
    }
    return wrong;
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

  /**
   * Sum calculator [Auto]: pencil a combination into the cage's empty cells.
   *
   * Digits already answered in the cage are dropped — they are spoken for, and
   * writing them back as candidates in the remaining cells is just wrong. Each
   * cell then drops anything its own row, column or box already rules out.
   */
  fillCombination(cageIndex: number, mask: number): number {
    const cage = this.puzzle.cages[cageIndex];
    const targets = cage.cells.filter((c) => this.values[c] === 0);
    if (targets.length === 0) return 0;

    let placed = 0;
    for (const c of cage.cells) if (this.values[c] !== 0) placed |= bit(this.values[c]);
    const available = mask & ~placed;

    this.record(targets);
    for (const c of targets) {
      let blocked = 0;
      for (const p of PEERS[c]) if (this.values[p] !== 0) blocked |= bit(this.values[p]);
      this.pencils[c] = available & ~blocked;
    }
    return targets.length;
  }

  /** Candidates a strong solver can still justify from the answers placed. */
  logicalCandidates(): Uint16Array | null {
    const start = new Uint16Array(CELLS).fill(0b111111111);
    for (let i = 0; i < CELLS; i++) if (this.values[i] !== 0) start[i] = bit(this.values[i]);
    return propagatedCandidates(buildConstraints(this.puzzle.cages), start);
  }

  /**
   * What a solver would do next from the answers currently on the board, so a
   * hint can explain itself instead of just filling a digit in silently.
   *
   * Worked from the entries alone, deliberately: the player's own pencil marks
   * may be wrong or incomplete, and a hint built on those could mislead.
   */
  nextLogicalStep(): Step | null {
    const start = new Uint16Array(CELLS).fill(0b111111111);
    for (let i = 0; i < CELLS; i++) if (this.values[i] !== 0) start[i] = bit(this.values[i]);
    const cons = buildConstraints(this.puzzle.cages);

    /*
     * Run forward until a step actually answers a cell. The early steps are
     * usually broad eliminations — "the cage total rules these digits out" —
     * touching dozens of cells at once, which is true but useless as a hint.
     * What a player wants is a cell they can fill and the reason for it, so
     * the elimination that gets there is only offered if nothing does.
     */
    let fallback: Step | null = null;
    for (let guard = 0; guard < 80; guard++) {
      const step = nextStep(start, cons);
      if (step === null) break;
      if (step.solved) return step;
      fallback ??= step;
    }
    return fallback;
  }

  /**
   * Pencil in every candidate the solver can still justify, for each empty
   * cell. One move, so a single undo takes the lot back.
   *
   * Returns -1 if the grid contradicts itself — that means an entry is wrong,
   * and filling from an impossible position would write nonsense.
   */
  fillAllCandidates(): number {
    const candidates = this.logicalCandidates();
    if (candidates === null) return -1;

    const targets: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      if (this.values[i] === 0 && this.pencils[i] !== candidates[i]) targets.push(i);
    }
    if (targets.length === 0) return 0;

    this.record(targets);
    for (const i of targets) this.pencils[i] = candidates[i];
    return targets.length;
  }
}
