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
  'naked subset': 'Naked pair or triple',
  'hidden subset': 'Hidden pair or triple',
  'cage locking': 'Cage locks a digit',
  'innies/outies (unit)': 'Innies and outies',
  'innies/outies (band)': 'Innies and outies across a band',
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
    'Two or three cells in a unit share only the same two or three candidates between them, so those digits are spoken for and leave the other cells.',
  'hidden subset':
    'Two or three digits in a unit can only go in the same two or three cells, so nothing else can go in them.',
  'cage locking':
    'Every combination still open to this cage contains that digit, so the digit is somewhere inside the cage — and therefore nowhere else in the unit that holds it.',
  'innies/outies (unit)':
    'Every row, column and box totals 45. Take away the cages that sit wholly inside one, and the cells left over have a known total — which pins down what they can be.',
  'innies/outies (band)':
    'Three rows total 135. Subtracting the cages wholly inside the band leaves a known total for the cells that spill over its edge.',
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
