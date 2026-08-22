import { BELTS } from '../core/generator.ts';
import type { Level } from '../core/types.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import { belt } from './belt.ts';

const LEVEL_GUIDE: Record<Level, { lead: string; techniques: string[] }> = {
  1: {
    lead: 'Direct logic and the core Killer Sudoku toolkit.',
    techniques: ['Singles in rows, columns and boxes', 'Cage totals and possible combinations', 'Locked candidates and cage consistency'],
  },
  2: {
    lead: 'Adds small groups of candidates that work together.',
    techniques: ['Naked pairs and triples', 'Hidden pairs and triples'],
  },
  3: {
    lead: 'Starts linking whole cages to the units around them.',
    techniques: ['Cage locking', 'Innies and outies within a row, column or box', 'Cages in one unit ruling each other out'],
  },
  4: {
    lead: 'Uses the deepest logical techniques in the solver.',
    techniques: ['Innies and outies across any shape of units', 'Cages measured across a unit edge', 'X-wing patterns'],
  },
  5: {
    lead: 'Extends beyond the named technique stack.',
    techniques: ['All techniques from earlier levels', 'Occasional enhanced logical deduction for the remaining cells'],
  },
  6: {
    lead: 'The most resistant puzzles in the collection.',
    techniques: ['All techniques from earlier levels', 'Sustained enhanced logical deduction for the remaining cells'],
  },
};

export function openLevelInfo(level: Level): void {
  const guide = LEVEL_GUIDE[level];
  openOverlay((close) => {
    const list = el('ul', { class: 'level-techniques' });
    for (const technique of guide.techniques) list.append(el('li', {}, technique));
    const done = el('button', { class: 'btn primary wide' }, 'Got it');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel level-info-panel' },
      el('div', { class: 'level-info-belt' }, belt(level, 96)),
      el('h2', {}, `${BELTS[level].name} · ${BELTS[level].rank}`),
      el('p', { class: 'level-info-descriptor' }, BELTS[level].descriptor),
      el('p', { class: 'level-info-lead' }, guide.lead),
      list,
      level > 1
        ? el('p', { class: 'summary' }, 'Each belt can also require techniques introduced below it. The rating reflects the hardest step needed.')
        : null,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
