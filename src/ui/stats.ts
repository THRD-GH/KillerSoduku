import { LEVELS, LEVEL_NAMES } from '../core/generator.ts';
import type { Level, Source } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import { levelStats, releasePuzzle, resetLevel, saveHistory } from '../game/storage.ts';
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
  let source: Source = 'fixed';

  const back = el('button', { class: 'iconbtn', 'aria-label': 'Back' });
  back.append(el('i'), el('i'), el('i'));
  back.addEventListener('click', () => ctx.goMenu());

  const levelTabs = el('div', { class: 'tabs' });
  const sourceTabs = el('div', { class: 'tabs' });
  const summary = el('p', { class: 'summary' });
  const rows = el('div', {});

  const poolSize = (): number =>
    source === 'fixed' ? (ctx.packCounts?.[level] ?? 0) : ctx.randomPoolSize;

  const draw = (): void => {
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
    for (const s of ['fixed', 'random'] as Source[]) {
      const b = el(
        'button',
        { class: `btn ${s === source ? 'on' : ''}`.trim() },
        s === 'fixed' ? 'Fixed' : 'Random',
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
      `${LEVEL_NAMES[level]} · ${source === 'fixed' ? 'Fixed' : 'Random'} — ` +
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

  const done = el('button', { class: 'btn wide' }, 'Back to levels');
  done.addEventListener('click', () => ctx.goMenu());

  draw();
  screen.append(
    el('div', { class: 'titlebar' }, back, el('span', { class: 'id' }, 'STATS')),
    levelTabs,
    sourceTabs,
    summary,
    rows,
    el('div', { class: 'actions', style: 'margin-top: 10px' }, reset, done),
  );
  return screen;
}
