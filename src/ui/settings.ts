import { exportBackup, importBackup, saveSettings } from '../game/storage.ts';
import type { KeypadSide, Settings, Theme } from '../game/storage.ts';
import { clear, el } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import type { AppContext } from './app-context.ts';

/** Only the on/off settings belong on this screen. */
type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

interface Toggle {
  key: BooleanSetting;
  title: string;
  detail: string;
}

const TOGGLES: Toggle[] = [
  {
    key: 'allowSingleCandidates',
    title: 'Allow single candidates',
    detail:
      'On, a lone digit you tap in stays a pencil mark. Crossing candidates off until one is left still answers the cell either way.',
  },
  {
    key: 'autoRemoveCandidates',
    title: 'Tidy candidates automatically',
    detail: 'Forcing an answer (long-click or double-click) strikes that digit from its row, column, box and the rest of its cage. A plain tap never does.',
  },
  {
    key: 'instantCheck',
    title: 'Flag mistakes as you go',
    detail: 'Marks a wrong entry the moment it is made, instead of waiting for Check.',
  },
  {
    key: 'lazyMode',
    title: 'Lazy mode',
    detail: 'Pre-fill cages that have only one possible combination.',
  },
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
    key: 'keepAwake',
    title: 'Keep the screen awake',
    detail: 'Stops the phone dimming and locking while a puzzle is open.',
  },
  {
    key: 'showTimer',
    title: 'Show the timer',
    detail: 'The clock keeps running either way.',
  },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'night', label: 'Night' },
  { value: 'day', label: 'Day' },
  { value: 'contrast', label: 'High contrast' },
];

const KEYPAD_SIDES: { value: KeypadSide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

/**
 * A row of buttons where exactly one is on — used for the settings that are a
 * choice rather than a switch.
 */
function picker<T extends string>(
  options: { value: T; label: string }[],
  current: () => T,
  choose: (value: T) => void,
): HTMLElement {
  const tabs = el('div', { class: 'tabs' });
  const draw = (): void => {
    clear(tabs);
    for (const option of options) {
      const on = current() === option.value;
      const button = el(
        'button',
        { class: `btn ${on ? 'on' : ''}`.trim(), 'aria-pressed': String(on) },
        option.label,
      );
      button.addEventListener('click', () => {
        choose(option.value);
        draw();
      });
      tabs.append(button);
    }
  };
  draw();
  return tabs;
}

/** A labelled row whose control sits underneath rather than beside it. */
const stacked = (title: string, detail: string | null, control: HTMLElement): HTMLElement =>
  el(
    'div',
    { class: 'setting stacked' },
    el('span', { class: 'label' }, title, detail === null ? null : el('small', {}, detail)),
    control,
  );

export function openSettings(ctx: AppContext): void {
  openOverlay((close) => {
    const list = el('div', {});

    // Theme first: it changes everything else on the screen.
    list.append(
      stacked(
        'Theme',
        null,
        picker(
          THEMES,
          () => ctx.settings.theme,
          (theme) => {
            ctx.settings.theme = theme;
            saveSettings(ctx.settings);
            ctx.applyTheme();
          },
        ),
      ),
      stacked(
        'Keypad side',
        'Right puts the digits under a right thumb, with the other buttons across from them. Applies in portrait and landscape.',
        picker(
          KEYPAD_SIDES,
          () => ctx.settings.keypadSide,
          (side) => {
            ctx.settings.keypadSide = side;
            saveSettings(ctx.settings);
            ctx.applyKeypadSide();
          },
        ),
      ),
    );

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
        if (toggle.key === 'keepAwake') ctx.applyWakeLock();
        // The board reads settings live, so it just needs a repaint.
        ctx.refreshBoard();
      });
      list.append(row);
    }

    /*
     * Everything lives in localStorage, which a browser can clear without
     * warning. A file you keep is the only real protection for a long history.
     */
    const save = el('button', { class: 'btn' }, 'Export data');
    save.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: `killer-sudoku-backup.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Backup downloaded');
    });

    const file = el('input', { type: 'file', accept: 'application/json,.json' });
    file.hidden = true;
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen) return;
      void chosen
        .text()
        .then((text) => {
          const counts = importBackup(JSON.parse(text) as unknown);
          close();
          ctx.reload();
          toast(`Restored ${counts.history} puzzles and ${counts.saves} games`);
        })
        .catch((err: unknown) => {
          toast(err instanceof Error ? err.message : 'Could not read that file');
        });
    });

    const load = el('button', { class: 'btn' }, 'Import data');
    load.addEventListener('click', () =>
      confirmDialog(
        'Replace your history and saved games with a backup file?',
        () => file.click(),
        'Choose file',
      ),
    );

    list.append(
      stacked(
        'Your data',
        'History, settings and parked games as a file you keep.',
        el('div', { class: 'tabs' }, save, load, file),
      ),
    );

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
