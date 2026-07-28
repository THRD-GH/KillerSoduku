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
    detail: 'On, every tap is a pencil mark and only a long-click writes an answer.',
  },
  {
    key: 'autoRemoveCandidates',
    title: 'Tidy candidates automatically',
    detail: 'Placing an answer strikes that digit from its row, column and box.',
  },
  {
    key: 'lazyMode',
    title: 'Lazy mode',
    detail: 'Pre-fill cages that have only one possible combination.',
  },
  { key: 'nightColors', title: 'Night colours', detail: 'Dark board and panels.' },
  {
    key: 'highlightPeers',
    title: 'Highlight row, column and box',
    detail: 'Tints the selected cell’s row, column and box.',
  },
  { key: 'highlightCage', title: 'Highlight the cage', detail: 'Tints the rest of the cage.' },
  {
    key: 'highlightSameDigit',
    title: 'Highlight matching digits',
    detail: 'Tints cells holding the same digit.',
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
    detail: 'The clock keeps running either way.',
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

    const done = el('button', { class: 'btn primary' }, 'Done');
    done.addEventListener('click', close);

    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Settings'),
      list,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
