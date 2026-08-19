import type { Step } from '../core/techniques.ts';
import type { Game } from '../game/state.ts';

/** R4C2 — the usual way of naming a cell out loud. */
export const cellName = (index: number): string =>
  `R${Math.floor(index / 9) + 1}C${(index % 9) + 1}`;

const TITLES: Record<string, string> = {
  'hidden single': 'Hidden single',
  'cage combinations': 'Cage combinations',
  'locked candidates': 'Locked candidates',
  'cage arc consistency': 'Cage arc consistency',
  'naked subset': 'Naked pair, triple or quad',
  'hidden subset': 'Hidden pair, triple or quad',
  'cages sharing a unit': 'Cages sharing a unit',
  'cage locking': 'Cage locks a digit',
  'innies/outies (unit)': 'Innies and outies',
  'innies/outies (shape)': 'Innies and outies across several units',
  'cage across a unit edge': 'Cage across a unit edge',
  'x-wing': 'X-wing',
};

export const describeTechnique = (technique: string): string => TITLES[technique] ?? technique;

/**
 * Why the step works, in the terms a player would use. Deliberately explains
 * the reasoning rather than just naming the cell — a hint that only says
 * "put 7 here" teaches nothing.
 */
const REASONS: Record<string, string> = {
  'hidden single':
    'Only one cell in that row, column or box can still take this digit, so that is where it goes.',
  'cage combinations':
    'The cage total cannot be made with those digits, so they come out of its cells.',
  'locked candidates':
    'Within a box the digit is confined to a single line — so it cannot appear elsewhere on that line. (Or the other way round: confined to one box within a line, it leaves the rest of the box.)',
  'cage arc consistency':
    'There is no way to fill the whole cage — distinct digits, correct total — that puts those digits in those cells.',
  'naked subset':
    'A few cells in a unit share only the same few candidates between them, so those digits are spoken for and leave the other cells.',
  'hidden subset':
    'A few digits in a unit can only go in the same few cells, so nothing else can go in them.',
  'cages sharing a unit':
    'Two cages in the same row, column or box cannot want the same digits — and nor can three of them together. Each cage keeps only the ways of filling it that leave every other cage in that unit something, and what survives says what its cells can be. A 14 in two cells is 5+9 or 6+8, so an 11 beside it cannot be 5+6: that would leave the 14 nothing.',
  'cage locking':
    'Every combination still open to this cage contains that digit, so the digit is somewhere inside the cage — and therefore nowhere else in the unit that holds it.',
  'innies/outies (unit)':
    'Every row, column and box totals 45. Take away the cages that sit wholly inside one, and the cells left over have a known total — which pins down what they can be.',
  'innies/outies (shape)':
    'Any set of rows, of columns, or of blocks totals 45 for each one it contains — two side by side, three in an L, whatever the shape. Subtracting the cages that sit wholly inside leaves a known total for the cells that spill over its edge, and one cell left over is an answer outright.',
  'cage across a unit edge':
    'A unit totals 45. Take away the cages wholly inside it, then set aside one cage that crosses its edge: what remains inside is fixed against the part of that cage hanging outside, so each bounds the other. Two cells cannot reach past 17 between them, and that alone can pin the cell they are measured against.',
  'x-wing':
    'A digit is limited to the same two columns in two different rows, so in those columns it must lie on those rows — and comes out of the others.',
};

export function explainStep(step: Step, game: Game): string {
  const reason = REASONS[step.technique] ?? 'This narrows the candidates.';
  if (step.solved) {
    const { cell, digit } = step.solved;
    const cage = game.cageAt(cell);
    return (
      `${cellName(cell)} must be ${digit}. ` +
      `It is in a cage of ${cage.cells.length} totalling ${cage.sum}. ` +
      reason
    );
  }
  const count = step.cells.length;
  return `${reason} It rules candidates out of ${count} cell${count === 1 ? '' : 's'}.`;
}
