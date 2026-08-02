import { LEVELS, LEVEL_NAMES } from '../core/generator.ts';
import type { Level, Source } from '../core/types.ts';
import { SOURCES, formatPuzzleId, sourceLabel } from '../core/types.ts';
import { levelStats, unplayedNumbers } from '../game/storage.ts';
import { buildStamp, clear, el, formatTime } from './dom.ts';
import { openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { stars } from './stars.ts';
import type { AppContext } from './app-context.ts';
import { openActionMenu } from './action-menu.ts';

/**
 * Choose Level. Each level offers curated Classic grids and freshly
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
      el('p', {}, 'Pick a difficulty, then choose Classic or New'),
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
        ? 'Classic plays hand-picked grids. New creates a repeatable puzzle on your device.'
        : 'No Classic puzzle collection is installed, so New puzzles are available.',
    ),
    el('p', { class: 'build-stamp' }, buildStamp()),
  );
  return screen;
}

function poolSize(ctx: AppContext, level: Level, source: Source): number {
  return source === 'classic' ? (ctx.packCounts?.[level] ?? 0) : ctx.newPoolSize;
}

const poolLabel = (source: Source): string => sourceLabel(source);

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
      el('span', { class: 'source-name' }, poolLabel(source)),
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
      title: `Choose ${poolLabel(source).toLowerCase()} puzzle number`,
      'aria-label': `Choose ${poolLabel(source).toLowerCase()} puzzle number for level ${level}`,
    });
    pick.textContent = '#';
    if (size > 0) pick.addEventListener('click', () => openPicker(ctx, level, source));

    // Each pool is its own grid column, so it goes straight onto the row.
    row.append(el('div', { class: 'source-row' }, button, pick));
  }

  return row;
}

/** Puzzle numbers per range tab. A Classic pool runs to thousands. */
const RANGE_SIZE = 200;

/**
 * The list of puzzle numbers not yet played in this level and pool.
 *
 * Classic pools hold thousands, so the numbers are broken into ranges and only
 * one range is drawn at a time — a flat list is a wall of buttons nobody reads.
 * A box for typing a number outright covers the case where you know the one
 * you want.
 */
export function openPicker(ctx: AppContext, level: Level, source: Source): void {
  const size = poolSize(ctx, level, source);
  const available = new Set(unplayedNumbers(ctx.history, level, source, size));

  openOverlay((close) => {
    const play = (n: number): void => {
      close();
      ctx.playPuzzle({ level, number: n, source });
    };

    const ranges: { from: number; to: number; free: number }[] = [];
    for (let from = 1; from <= size; from += RANGE_SIZE) {
      const to = Math.min(from + RANGE_SIZE - 1, size);
      let free = 0;
      for (let n = from; n <= to; n++) if (available.has(n)) free++;
      ranges.push({ from, to, free });
    }
    // Open on the first range that still has something to play.
    let current = Math.max(0, ranges.findIndex((r) => r.free > 0));

    const tabs = el('div', { class: 'picker-ranges' });
    const grid = el('div', { class: 'picker' });
    const summary = el('p', { class: 'summary' });

    const draw = (): void => {
      clear(tabs);
      if (ranges.length > 1) {
        for (const [i, range] of ranges.entries()) {
          const tab = el(
            'button',
            { class: `btn ${i === current ? 'on' : ''}`.trim(), disabled: range.free === 0 },
            `${range.from}–${range.to}`,
          );
          tab.addEventListener('click', () => {
            current = i;
            draw();
          });
          tabs.append(tab);
        }
      }

      const range = ranges[current];
      clear(grid);
      let shown = 0;
      for (let n = range.from; n <= range.to; n++) {
        if (!available.has(n)) continue;
        shown++;
        const b = el('button', { class: 'btn' }, formatPuzzleId({ level, number: n, source }));
        b.addEventListener('click', () => play(n));
        grid.append(b);
      }
      if (shown === 0) {
        grid.append(
          el('p', { class: 'summary' }, 'Nothing left here. Release some in Stats, or try another range.'),
        );
      }

      summary.textContent =
        available.size === 0
          ? 'Every puzzle here has been played. Release some in Stats.'
          : `${available.size} of ${size} available` +
            (ranges.length > 1 ? ` · showing ${range.from}–${range.to}` : '');
    };

    // Straight to a number, for when you already know which one you want.
    const jump = el('input', {
      type: 'number',
      min: 1,
      max: size,
      inputmode: 'numeric',
      placeholder: 'no.',
      'aria-label': 'Go to puzzle number',
    });
    const go = el('button', { class: 'btn' }, 'Go');
    const goTo = (): void => {
      const n = Number(jump.value);
      if (!Number.isInteger(n) || n < 1 || n > size) {
        toast(`Pick a number between 1 and ${size}`);
        return;
      }
      if (!available.has(n)) {
        toast(`${formatPuzzleId({ level, number: n, source })} has been played — release it in Stats`);
        return;
      }
      play(n);
    };
    go.addEventListener('click', goTo);
    jump.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goTo();
    });

    const cancel = el('button', { class: 'btn wide' }, 'Cancel');
    cancel.addEventListener('click', close);

    draw();
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, `Level ${level} — ${LEVEL_NAMES[level]} · ${poolLabel(source)}`),
      el('div', { class: 'picker-jump' }, el('label', {}, 'Go to'), jump, go),
      tabs,
      summary,
      grid,
      el('div', { class: 'panel-footer' }, cancel),
    );
  });
}

export function openMainMenu(ctx: AppContext): void {
  openActionMenu('Menu', [
    { label: 'Settings', run: () => ctx.openSettings() },
    { label: 'Stats', run: () => ctx.goStats(1) },
    { label: 'Help', run: () => ctx.openHelp() },
    { label: 'About', run: () => toast('Killer Sudoku — a personal build') },
  ]);
}
