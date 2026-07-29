import { CELLS, boxOf, colOf, maskToDigits, popcount, rowOf } from '../core/grid.ts';
import type { Game } from '../game/state.ts';
import type { Settings } from '../game/storage.ts';
import { cageOutlinePath } from './cage-outline.ts';
import { el } from './dom.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Distance from the cell edge to the cage outline, in cell widths. Everything
 * drawn in a cell sits inside this (see .sum and .marks in style.css), so the
 * dashes never cut through a digit.
 */
const CAGE_INSET = 0.05;

interface CellNodes {
  root: HTMLDivElement;
  big: HTMLSpanElement;
  marks: HTMLSpanElement[];
  /** Structural classes that never change. */
  base: string;
}

export class Board {
  readonly root: HTMLDivElement;
  private cells: CellNodes[] = [];
  private game: Game;
  /** Live reference — the settings panel mutates this object in place. */
  private settings: Settings;

  constructor(game: Game, settings: Settings) {
    this.game = game;
    this.settings = settings;
    this.root = el('div', { class: 'board', role: 'grid', 'aria-label': 'Killer sudoku grid' });
    this.build();
  }

  /** Cell index under an event, or -1. */
  indexOf(e: Event): number {
    const target = (e.target as HTMLElement | null)?.closest('.cell');
    if (!target) return -1;
    const raw = (target as HTMLElement).dataset.i;
    return raw === undefined ? -1 : Number(raw);
  }

  private build(): void {
    for (let i = 0; i < CELLS; i++) {
      const r = rowOf(i);
      const c = colOf(i);
      const cage = this.game.cageAt(i);

      const classes = ['cell'];
      if (c % 3 === 0 && c !== 0) classes.push('box-l');
      if (r % 3 === 0 && r !== 0) classes.push('box-t');

      const sum = el('span', { class: 'sum' }, cage.cells[0] === i ? String(cage.sum) : '');
      const big = el('span', { class: 'big' });
      const marksBox = el('span', { class: 'marks' });
      const marks: HTMLSpanElement[] = [];
      for (let d = 1; d <= 9; d++) {
        const mark = el('span', { class: 'mark' });
        marks.push(mark);
        marksBox.append(mark);
      }

      const root = el(
        'div',
        {
          class: classes.join(' '),
          'data-i': i,
          'data-cage': this.game.cageIndexAt(i),
          role: 'gridcell',
        },
        sum,
        marksBox,
        big,
      );
      this.cells.push({ root, big, marks, base: classes.join(' ') });
      this.root.append(root);
    }

    this.root.append(this.buildCageLayer());
  }

  /**
   * Cage outlines live in one SVG over the whole board rather than as borders
   * on each cell, so a cage reads as a single closed shape with continuous
   * dashes and properly mitred corners.
   */
  private buildCageLayer(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cages');
    svg.setAttribute('viewBox', '0 0 9 9');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    for (const cage of this.game.puzzle.cages) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', cageOutlinePath(cage.cells, CAGE_INSET));
      svg.append(path);
    }
    return svg;
  }

  render(): void {
    const g = this.game;
    const sel = g.selected;
    const selRow = sel >= 0 ? rowOf(sel) : -1;
    const selCol = sel >= 0 ? colOf(sel) : -1;
    const selBox = sel >= 0 ? boxOf(sel) : -1;
    const selCage = sel >= 0 ? g.cageIndexAt(sel) : -1;
    const selValue = sel >= 0 ? g.values[sel] : 0;

    const clashes = findClashes(g);

    for (let i = 0; i < CELLS; i++) {
      const node = this.cells[i];
      const value = g.values[i];

      node.big.textContent = value === 0 ? '' : String(value);
      const digits = value === 0 ? maskToDigits(g.pencils[i]) : [];
      for (let d = 1; d <= 9; d++) {
        node.marks[d - 1].textContent = digits.includes(d) ? String(d) : '';
      }

      const cls = [node.base];
      if (i === sel) cls.push('sel');
      else if (sel >= 0) {
        if (
          this.settings.highlightPeers &&
          (rowOf(i) === selRow || colOf(i) === selCol || boxOf(i) === selBox)
        ) {
          cls.push('peer');
        }
        if (this.settings.highlightCage && g.cageIndexAt(i) === selCage) cls.push('cage-peer');
      }
      if (this.settings.highlightSameDigit && value !== 0 && selValue !== 0 && value === selValue) {
        cls.push('same');
      }
      // One candidate left is an answer waiting to be written in — worth
      // spotting the moment an entry elsewhere reduces a cell to it. Derived
      // from the marks each render, so it clears itself when that stops holding.
      if (value === 0 && popcount(g.pencils[i]) === 1) cls.push('single');
      if (g.errors.has(i)) cls.push('error');
      else if (clashes.has(i)) cls.push('clash');
      node.root.className = cls.join(' ');
    }
  }
}

/**
 * Cells that break a rule against another filled cell: a repeat in a unit, a
 * repeat inside a cage, or a cage whose entries already exceed its sum.
 */
function findClashes(g: Game): Set<number> {
  const bad = new Set<number>();

  const flagDuplicates = (cells: number[]): void => {
    const seen = new Map<number, number>();
    for (const c of cells) {
      const v = g.values[c];
      if (v === 0) continue;
      const first = seen.get(v);
      if (first !== undefined) {
        bad.add(first);
        bad.add(c);
      } else seen.set(v, c);
    }
  };

  for (let r = 0; r < 9; r++) flagDuplicates(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) flagDuplicates(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    const cells: number[] = [];
    for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) cells.push(r * 9 + c);
    flagDuplicates(cells);
  }

  for (const cage of g.puzzle.cages) {
    flagDuplicates(cage.cells);
    const filled = cage.cells.filter((c) => g.values[c] !== 0);
    const total = filled.reduce((t, c) => t + g.values[c], 0);
    const complete = filled.length === cage.cells.length;
    if (total > cage.sum || (complete && total !== cage.sum)) {
      for (const c of filled) bad.add(c);
    }
  }

  return bad;
}
