import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const SECTIONS: [string, string[]][] = [
  [
    'Rules',
    [
      'Normal sudoku rules: 1–9 once per row, column and box.',
      'The digits in a dashed cage must add up to the small number in its corner.',
      'A digit never repeats inside a cage.',
    ],
  ],
  [
    'Entering digits',
    [
      'Tap a cell to select it.',
      'Tap the keypad to put a digit in that cell. Two or more digits in a cell are candidates (pencil marks).',
      'Tap a candidate again to take it out.',
      'Long-click or double-click a keypad digit to force it in as the answer, clearing any candidates.',
      'Forcing an answer that way also strikes that digit from the pencil marks of its row, column and box. A plain tap never does — only the deliberate gesture, so a stray tap cannot wipe your candidates. One undo takes back the answer and those candidates together. Turn it off with “Tidy candidates automatically”.',
      'Long-click or double-click CLEAR to empty a cell.',
      'The selected cell’s cage total and candidates are echoed in the title bar.',
    ],
  ],
  [
    'Buttons',
    [
      'Check — mark entries that disagree with the solution. Hold it: checks are counted, and Settings can put the tap back.',
      'Hint — fill one correct digit, fixing a wrong one first if there is one.',
      'Sum — open the combination calculator.',
      'Restart — clear the grid and start the same puzzle again.',
      'New — leave for a fresh puzzle at the same level.',
      'Undo and redo — the two arrow buttons. Undo winds back move by move, as far as the empty grid. Redo goes forward again, until you make a new move, which abandons it.',
      'Pause — stop the clock. You can also long-click any cell.',
      'The tally adds up cage totals for innie/outie arithmetic: tap it to count the selected cage, tap again on a cage already counted to take it back off, and hold to clear the lot. Each cage counts once, and counted cages are tinted on the grid so a gap in a run is easy to spot.',
      'The white box is the clock. Tap it to hide or show the time; it keeps running.',
    ],
  ],
  [
    'Keyboard',
    [
      'Arrow keys move, 1–9 enter a digit, Shift+digit forces an answer.',
      'Backspace clears, Z undoes, H hints, C checks, S opens the calculator, Escape pauses.',
    ],
  ],
  [
    'Pausing',
    [
      'Press Pause, or long-click any cell. Long-click the pause screen (or press Escape) to continue.',
      'The game also pauses when you switch away from the tab.',
    ],
  ],
  [
    'Sum calculator',
    [
      'Sum and cell count are filled in from the selected cage; both can be overridden.',
      'Tap a digit once to rule it out (red), again to require it (green), again for neutral.',
      'Tap a combination to strike it off — for when you can rule one out by reasoning that no digit filter expresses. Tap again to bring it back.',
      'In each combination, digits already in that cage are marked in the accent colour, and digits already in the selected cell’s row, column or box are marked in red — those cannot go in this cell, though they may still belong elsewhere in the cage.',
      'When exactly one combination is left — after strikes — Auto writes it into the cage as candidates.',
      'Reset clears the digit filters and every strike.',
    ],
  ],
  [
    'Levels and puzzle numbers',
    [
      'Six belts, white through black. Each has two pools: Classic plays hand-picked grids, while New generates grids deterministically from their level and number.',
      'Tap a pool to play a random puzzle from it, hold to choose a number.',
      'Classic puzzles are numbered 3-10; New ones 3-N10. Either way the number always gives the same puzzle on every device.',
      'The two pools keep separate history. Only unplayed puzzles are offered — release used ones from Stats by long-clicking a pink row.',
    ],
  ],
  [
    'Stats',
    [
      'Per level and pool: puzzles played, puzzles finished, and the average of your best times.',
      'Each row shows your best time, the date you set it, and the hints and checks it took.',
      'Pink rows are used up; green rows have been released back into the pool.',
      '“Unfinished games” lists every puzzle you started and never solved, across all levels and both pools, with the one you touched most recently at the top. Each row says how long ago you put it down. Hold one to pick it up, exactly where you left it.',
    ],
  ],
];

export function openHelp(): void {
  openOverlay((close) => {
    const panel = el('div', { class: 'panel' }, el('h2', {}, 'How to play'));
    for (const [title, lines] of SECTIONS) {
      panel.append(el('h3', {}, title));
      const ul = el('ul', { style: 'margin: 0; padding-left: 18px' });
      for (const line of lines) ul.append(el('li', {}, line));
      panel.append(ul);
    }
    const done = el('button', { class: 'btn primary' }, 'Close');
    done.addEventListener('click', close);
    panel.append(el('div', { class: 'panel-footer' }, done));
    return panel;
  });
}
