import { LEVEL_NAMES } from '../core/generator.ts';
import type { Level } from '../core/types.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import { stars } from './stars.ts';

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
    techniques: ['Cage locking', 'Innies and outies within a row, column or box'],
  },
  4: {
    lead: 'Uses the deepest logical techniques in the solver.',
    techniques: ['Innies and outies across three rows or columns', 'X-wing patterns'],
  },
  5: {
    lead: 'Logic alone may not finish these puzzles.',
    techniques: ['All techniques from earlier levels', 'A small amount of trial and error when logic runs out'],
  },
  6: {
    lead: 'The most resistant puzzles in the collection.',
    techniques: ['All techniques from earlier levels', 'Deeper trial and error after the logical techniques are exhausted'],
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
      el('div', { class: 'level-info-stars' }, stars(level, 15)),
      el('h2', {}, `Level ${level} · ${LEVEL_NAMES[level]}`),
      el('p', { class: 'level-info-lead' }, guide.lead),
      list,
      el('p', { class: 'summary' }, 'Each level can also require techniques introduced below it. The rating reflects the hardest step needed.'),
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
