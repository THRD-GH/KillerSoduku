import { LEVELS, LEVEL_NAMES } from '../core/generator.ts';
import type { Level, Source } from '../core/types.ts';
import { SOURCES, formatPuzzleId, sourceLabel } from '../core/types.ts';
import { levelStats, unplayedNumbers } from '../game/storage.ts';
import { el, formatTime } from './dom.ts';
import { openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { stars } from './stars.ts';
import type { AppContext } from './app-context.ts';

/**
 * Choose Level. Each level offers the reference app's shipped grids and freshly
 * generated ones, as separate pools with separate history. A tap starts a
 * random unplayed puzzle from that pool; a long-click picks a number.
 */
export function buildMenu(ctx: AppContext, resume?: { label: string; run: () => void }): HTMLElement {
  const screen = el('div', { class: 'screen' });

  const menuBtn = el('button', { class: 'iconbtn', 'aria-label': 'Menu' });
  menuBtn.append(el('i'), el('i'), el('i'));
  menuBtn.addEventListener('click', () => openMainMenu(ctx));

  screen.append(
    el('div', { class: 'titlebar' }, menuBtn, el('span', { class: 'id' }, 'KILLER SUDOKU')),
    el(
      'div',
      { class: 'hero' },
      el('h1', {}, 'Choose ', el('span', {}, 'Level')),
      el('p', {}, 'Tap a pool to play · # to choose a puzzle number'),
    ),
  );

  if (resume) {
    const btn = el('button', { class: 'btn primary wide' }, resume.label);
    btn.addEventListener('click', resume.run);
    screen.append(el('div', { class: 'actions' }, btn));
  }

  const list = el('div', { class: 'levels' });
  for (const level of LEVELS) list.append(buildLevelPanel(ctx, level));
  screen.append(list);

  screen.append(
    el(
      'p',
      { class: 'hint-line' },
      ctx.packCounts
        ? 'Classic plays the original shipped grids, New generates one. Either way the number always gives the same puzzle.'
        : 'No puzzle packs installed, so only New is available. See tools/import-packs.ts.',
    ),
  );
  return screen;
}

function poolSize(ctx: AppContext, level: Level, source: Source): number {
  return source === 'classic' ? (ctx.packCounts?.[level] ?? 0) : ctx.newPoolSize;
}

/** One level as three columns: the difficulty, then each of its two pools. */
function buildLevelPanel(ctx: AppContext, level: Level): HTMLElement {
  const row = el(
    'div',
    { class: 'level' },
    el(
      'div',
      { class: 'level-head' },
      stars(level, 10),
      el('span', { class: 'name' }, LEVEL_NAMES[level]),
    ),
  );

  for (const source of SOURCES) {
    const size = poolSize(ctx, level, source);
    const left = size === 0 ? 0 : unplayedNumbers(ctx.history, level, source, size).length;

    const stat = levelStats(ctx.history, level, source, size);
    const button = el(
      'button',
      { class: `source ${source}`, disabled: size === 0 },
      el('span', { class: 'source-name' }, sourceLabel(source)),
      el(
        'span',
        { class: 'source-meta' },
        size === 0
          ? 'not installed'
          : `${left} left${stat.averageMs === null ? '' : ` · ${formatTime(stat.averageMs)}`}`,
      ),
    );
    if (size > 0) {
      bindTap(button, {
        onTap: () => ctx.playRandom(level, source),
        onLong: () => openPicker(ctx, level, source),
      });
    }

    // Picking a specific puzzle used to need a long-press, which nobody finds
    // on a phone. It gets its own button.
    const pick = el('button', {
      class: 'pick',
      disabled: size === 0,
      title: `Choose a ${source} puzzle number`,
      'aria-label': `Choose a ${source} puzzle number for level ${level}`,
    });
    pick.textContent = '#';
    if (size > 0) pick.addEventListener('click', () => openPicker(ctx, level, source));

    // Each pool is its own grid column, so it goes straight onto the row.
    row.append(el('div', { class: 'source-row' }, button, pick));
  }

  return row;
}

/**
 * Most buttons the picker will render at once. Enough to cover a whole New
 * pool; the Classic pools run to thousands, where a full list would be a wall
 * of buttons nobody scrolls through.
 */
const PICKER_LIMIT = 500;

/** The list of puzzle numbers not yet played in this level and pool. */
export function openPicker(ctx: AppContext, level: Level, source: Source): void {
  const size = poolSize(ctx, level, source);
  const numbers = unplayedNumbers(ctx.history, level, source, size);

  openOverlay((close) => {
    const grid = el('div', { class: 'picker' });
    if (numbers.length === 0) {
      grid.append(
        el('p', { class: 'summary' }, 'Every puzzle here has been played. Release some in Stats.'),
      );
    }
    for (const n of numbers.slice(0, PICKER_LIMIT)) {
      const b = el('button', { class: 'btn' }, formatPuzzleId({ level, number: n, source }));
      b.addEventListener('click', () => {
        close();
        ctx.playPuzzle({ level, number: n, source });
      });
      grid.append(b);
    }

    const cancel = el('button', { class: 'btn wide' }, 'Cancel');
    cancel.addEventListener('click', close);

    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, `Level ${level} — ${LEVEL_NAMES[level]} · ${sourceLabel(source)}`),
      el(
        'p',
        { class: 'summary' },
        `${numbers.length} of ${size} available` +
          (numbers.length > PICKER_LIMIT ? `, showing the first ${PICKER_LIMIT}` : ''),
      ),
      grid,
      el('div', { class: 'panel-footer' }, cancel),
    );
  });
}

export function openMainMenu(ctx: AppContext): void {
  openOverlay((close) => {
    const item = (label: string, run: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'btn' }, label);
      b.addEventListener('click', () => {
        close();
        run();
      });
      return b;
    };
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Menu'),
      el(
        'div',
        { class: 'menu-list' },
        item('Settings', () => ctx.openSettings()),
        item('Stats', () => ctx.goStats(1)),
        item('Help', () => ctx.openHelp()),
        item('About', () => toast('Killer Sudoku — a personal build')),
      ),
    );
  });
}
