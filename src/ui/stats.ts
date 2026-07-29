import { LEVELS, LEVEL_NAMES } from '../core/generator.ts';
import type { Level, PuzzleId, Source } from '../core/types.ts';
import { SOURCES, formatPuzzleId, sourceLabel } from '../core/types.ts';
import {
  clearSave,
  forgetPuzzle,
  levelStats,
  loadSave,
  releasePuzzle,
  resetLevel,
  saveHistory,
  unfinishedGames,
} from '../game/storage.ts';
import { clear, el, formatDate, formatTime } from './dom.ts';
import { confirmDialog, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import type { AppContext } from './app-context.ts';

/**
 * Personal history per level and pool. Pink rows are used up, green rows have
 * been released back — long-click a pink row to release it.
 */
export function buildStats(ctx: AppContext, initial: Level): HTMLElement {
  const screen = el('div', { class: 'screen' });
  let level = initial;
  let source: Source = 'classic';

  const back = el('button', { class: 'iconbtn', 'aria-label': 'Back' });
  back.append(el('i'), el('i'), el('i'));
  back.addEventListener('click', () => ctx.goMenu());

  let mode: 'level' | 'unfinished' = 'unfinished';
  const unfinishedTab = el('button', { class: 'btn wide' });
  const levelTabs = el('div', { class: 'tabs' });
  const sourceTabs = el('div', { class: 'tabs' });
  const summary = el('p', { class: 'summary' });
  const rows = el('div', {});

  /** Every puzzle started and not solved, whatever its level or pool. */
  const drawUnfinished = (): void => {
    const games = unfinishedGames(ctx.history);
    summary.textContent =
      games.length === 0
        ? 'No unfinished games — every puzzle you have opened is solved.'
        : `${games.length} unfinished ${games.length === 1 ? 'game' : 'games'}, newest first. Tap one to pick it up.`;

    clear(rows);
    for (const { id, record } of games) {
      const row = el(
        'button',
        { class: 'statrow open' },
        el('span', {}, formatPuzzleId(id)),
        el('span', { class: 'when' }, `${LEVEL_NAMES[id.level]} · ${sourceLabel(id.source)}`),
        el('span', { class: 'when' }, record.startedAt ? formatDate(record.startedAt) : ''),
        el('span', { class: 'when' }, `${record.hints ?? 0}h ${record.checks ?? 0}c`),
      );
      row.addEventListener('click', () => ctx.playPuzzle(id));

      const drop = el(
        'button',
        {
          class: 'rowx',
          'aria-label': `Reset ${formatPuzzleId(id)}`,
          title: 'Reset this puzzle',
        },
        '✕',
      );
      drop.addEventListener('click', () =>
        confirmDialog(
          `Reset ${formatPuzzleId(id)}? Any progress is discarded and it goes back into the pool as unplayed.`,
          () => {
            forget(id);
            draw();
            toast(`${formatPuzzleId(id)} reset`);
          },
          'Reset',
        ),
      );

      rows.append(el('div', { class: 'unfinished-row' }, row, drop));
    }
  };

  /** Drop a puzzle from the history, and its board state if it is the saved one. */
  const forget = (id: PuzzleId): void => {
    const saved = loadSave();
    if (saved && formatPuzzleId(saved.id) === formatPuzzleId(id)) clearSave();
    ctx.history = forgetPuzzle(ctx.history, id);
    saveHistory(ctx.history);
  };

  const poolSize = (): number =>
    source === 'classic' ? (ctx.packCounts?.[level] ?? 0) : ctx.randomPoolSize;

  const draw = (): void => {
    const unfinishedCount = unfinishedGames(ctx.history).length;
    unfinishedTab.textContent = `Unfinished games (${unfinishedCount})`;
    unfinishedTab.classList.toggle('primary', mode === 'unfinished');
    levelTabs.hidden = mode === 'unfinished';
    sourceTabs.hidden = mode === 'unfinished';
    reset.hidden = mode === 'unfinished';
    resetAll.hidden = mode !== 'unfinished';

    if (mode === 'unfinished') {
      drawUnfinished();
      return;
    }

    clear(levelTabs);
    for (const l of LEVELS) {
      const b = el('button', { class: `btn ${l === level ? 'on' : ''}`.trim() }, String(l));
      b.addEventListener('click', () => {
        level = l;
        draw();
      });
      levelTabs.append(b);
    }

    clear(sourceTabs);
    for (const s of SOURCES) {
      const b = el(
        'button',
        { class: `btn ${s === source ? 'on' : ''}`.trim() },
        sourceLabel(s),
      );
      b.addEventListener('click', () => {
        source = s;
        draw();
      });
      sourceTabs.append(b);
    }

    const size = poolSize();
    const stat = levelStats(ctx.history, level, source, size);
    summary.textContent =
      `${LEVEL_NAMES[level]} · ${sourceLabel(source)} — ` +
      `${stat.played} of ${size} played, ${stat.finished} finished` +
      (stat.averageMs === null ? '' : `, average ${formatTime(stat.averageMs)}`);

    clear(rows);
    let any = false;
    for (let n = 1; n <= size; n++) {
      const id = { level, number: n, source };
      const rec = ctx.history[formatPuzzleId(id)];
      if (!rec) continue;
      any = true;

      const row = el(
        'div',
        { class: `statrow ${rec.released ? 'released' : 'locked'}` },
        el(
          'span',
          {},
          formatPuzzleId(id),
          rec.bestAt !== undefined
            ? el('span', { class: 'when' }, ` · ${formatDate(rec.bestAt)}`)
            : el('span', { class: 'when' }, ' · unfinished'),
        ),
        el('span', {}, rec.bestMs === undefined ? '—' : formatTime(rec.bestMs)),
        el('span', { class: 'when' }, `${rec.hints ?? 0}h`),
        el('span', { class: 'when' }, `${rec.checks ?? 0}c`),
      );

      bindTap(row, {
        onTap: () =>
          toast(rec.released ? 'Already released — tap the level to play' : 'Hold to release'),
        onLong: () => {
          ctx.history = releasePuzzle(ctx.history, id);
          saveHistory(ctx.history);
          draw();
          toast(`${formatPuzzleId(id)} released`);
        },
      });
      rows.append(row);
    }

    if (!any) rows.append(el('p', { class: 'summary' }, 'Nothing played in this pool yet.'));
  };

  const reset = el('button', { class: 'btn wide' }, 'Reset this pool');
  reset.addEventListener('click', () =>
    confirmDialog(
      `Clear all history for level ${level} ${source}? Every puzzle becomes playable again.`,
      () => {
        ctx.history = resetLevel(ctx.history, level, source, poolSize());
        saveHistory(ctx.history);
        draw();
        toast('Reset');
      },
      'Reset',
    ),
  );

  const resetAll = el('button', { class: 'btn wide' }, 'Reset all unfinished');
  resetAll.addEventListener('click', () => {
    const games = unfinishedGames(ctx.history);
    if (games.length === 0) {
      toast('Nothing to reset');
      return;
    }
    confirmDialog(
      `Reset all ${games.length} unfinished games? Progress is discarded and they go back into their pools.`,
      () => {
        for (const { id } of games) forget(id);
        draw();
        toast(`${games.length} games reset`);
      },
      'Reset all',
    );
  });

  const done = el('button', { class: 'btn wide' }, 'Back to levels');
  done.addEventListener('click', () => ctx.goMenu());

  unfinishedTab.addEventListener('click', () => {
    mode = mode === 'unfinished' ? 'level' : 'unfinished';
    draw();
  });

  draw();
  screen.append(
    el('div', { class: 'titlebar' }, back, el('span', { class: 'id' }, 'STATS')),
    unfinishedTab,
    levelTabs,
    sourceTabs,
    summary,
    rows,
    el('div', { class: 'actions', style: 'margin-top: 10px' }, reset, resetAll, done),
  );
  return screen;
}
