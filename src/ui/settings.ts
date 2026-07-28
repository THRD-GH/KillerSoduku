import { saveSettings } from '../game/storage.ts';
import type { Settings } from '../game/storage.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

interface Toggle {
  key: keyof Settings;
  title: string;
  detail: string;
}

const TOGGLES: Toggle[] = [
  {
    key: 'allowSingleCandidates',
    title: 'Allow single candidates',
    detail:
      'Off: the first digit you tap into an empty cell becomes the answer. ' +
      'On: every tap is a pencil mark, and only a long-click writes an answer.',
  },
  {
    key: 'lazyMode',
    title: 'Lazy mode',
    detail:
      'Pre-fill candidates for any cage with only one possible combination. ' +
      'Applies when a puzzle is started or restarted.',
  },
  {
    key: 'nightColors',
    title: 'Night colours',
    detail: 'Dark board and panels. Takes effect immediately.',
  },
  {
    key: 'highlightPeers',
    title: 'Highlight row, column and box',
    detail: 'Tints every cell the selected one shares a row, column or box with.',
  },
  {
    key: 'highlightCage',
    title: 'Highlight the cage',
    detail: 'Tints the rest of the selected cell’s cage.',
  },
  {
    key: 'highlightSameDigit',
    title: 'Highlight matching digits',
    detail: 'Tints other cells already holding the selected cell’s digit.',
  },
  {
    key: 'clearNeedsLongClick',
    title: 'CLEAR needs a long-click',
    detail: 'Guards against wiping a cell by accident.',
  },
  { key: 'hintNeedsLongClick', title: 'Hint needs a long-click', detail: 'Avoids stray hints.' },
  { key: 'undoNeedsLongClick', title: 'Undo needs a long-click', detail: 'Avoids stray undos.' },
  {
    key: 'showTimer',
    title: 'Show the timer',
    detail: 'The clock keeps running either way. Tapping the timer box also toggles this.',
  },
];

export function openSettings(ctx: AppContext): void {
  openOverlay((close) => {
    const list = el('div', {});

    for (const toggle of TOGGLES) {
      const knob = el('span', { class: `switch ${ctx.settings[toggle.key] ? 'on' : ''}`.trim() });
      const row = el(
        'div',
        { class: 'setting' },
        el(
          'span',
          { class: 'label' },
          toggle.title,
          el('small', {}, toggle.detail),
        ),
        knob,
      );
      row.addEventListener('click', () => {
        ctx.settings[toggle.key] = !ctx.settings[toggle.key];
        knob.classList.toggle('on', ctx.settings[toggle.key]);
        saveSettings(ctx.settings);
        if (toggle.key === 'nightColors') ctx.applyTheme();
        // The board reads settings live, so it just needs a repaint.
        ctx.refreshBoard();
      });
      list.append(row);
    }

    const done = el('button', { class: 'btn wide' }, 'Done');
    done.addEventListener('click', close);

    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Settings'),
      list,
      el('div', { class: 'actions', style: 'margin-top: 12px' }, done),
    );
  });
}
