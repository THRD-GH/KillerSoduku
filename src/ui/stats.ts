import { LEVELS, LEVEL_NAMES } from '../core/generator.ts';
import type { Level, PuzzleId, Source } from '../core/types.ts';
import type { PuzzleRecord } from '../game/storage.ts';
import { SOURCES, formatPuzzleId, sourceLabel } from '../core/types.ts';
import {
  clearSaveFor,
  forgetPuzzle,
  levelStats,
  allSaves,
  releasePuzzle,
  resetLevel,
  saveHistory,
  totalStats,
  unfinishedGames,
} from '../game/storage.ts';
import { clear, el, formatDate, formatTime, timeAgo } from './dom.ts';
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

  /*
   * Both halves of the screen are on show at once: the unfinished games and
   * the per-level history. They answer different questions — "what did I leave
   * lying around" and "how far through this pool am I" — and having to close
   * one to read the other made comparing them impossible. The unfinished list
   * still folds away, because it is the part that can run long, but folding it
   * no longer reveals anything: the level stats are always below it.
   */
  let showUnfinished = true;
  const unfinishedTab = el('button', { class: 'btn wide' });
  const unfinishedSummary = el('p', { class: 'summary' });
  const unfinishedRows = el('div', {});
  const levelTabs = el('div', { class: 'tabs' });
  const sourceTabs = el('div', { class: 'tabs' });
  const summary = el('p', { class: 'summary' });
  const rows = el('div', {});
  const totals = el('div', { class: 'totals' });

  /**
   * The running totals across everything played. The per-pool line below is
   * about one slice; this is the answer to "how am I doing", which is what
   * anyone opens a stats screen for.
   */
  const drawTotals = (): void => {
    clear(totals);
    const t = totalStats(ctx.history);
    if (t.played === 0) return;

    const tile = (value: string, label: string): HTMLElement =>
      el('div', { class: 'tile' }, el('b', {}, value), el('small', {}, label));

    totals.append(
      tile(String(t.finished), `solved of ${t.played}`),
      tile(t.averageMs === null ? '—' : formatTime(t.averageMs), 'average'),
      tile(
        t.best === null ? '—' : formatTime(t.best.ms),
        t.best === null ? 'best' : `best · ${t.best.id}`,
      ),
      tile(String(t.streak), t.streak === 1 ? 'day streak' : 'day streak'),
      tile(String(t.hints), t.hints === 1 ? 'hint' : 'hints'),
      tile(String(t.checks), t.checks === 1 ? 'check' : 'checks'),
    );

    // Where the solving has actually happened, at a glance.
    const spread = LEVELS.map((l) => `${LEVEL_NAMES[l]} ${t.byLevel[l]}`).join(' · ');
    totals.append(el('p', { class: 'spread' }, spread));
  };

  /** Every puzzle started and not solved, whatever its level or pool. */
  const drawUnfinished = (): void => {
    /*
     * When each was last touched. The history only records when a puzzle was
     * first opened; the save beside it is rewritten on every move, so its
     * timestamp is the one that answers "which was I in the middle of". A
     * puzzle opened and abandoned before a single move has no save, and falls
     * back to when it was started.
     */
    const lastPlayed = new Map(allSaves().map((game) => [formatPuzzleId(game.id), game.savedAt]));
    const touchedAt = ({ id, record }: { id: PuzzleId; record: PuzzleRecord }): number =>
      lastPlayed.get(formatPuzzleId(id)) ?? record.startedAt ?? 0;

    // Ordered by the same clock the rows show, or the order and the column
    // would tell different stories: storage sorts these by when they began.
    const games = unfinishedGames(ctx.history).sort((a, b) => touchedAt(b) - touchedAt(a));
    unfinishedSummary.textContent =
      games.length === 0
        ? 'No unfinished games — every puzzle you have opened is solved.'
        : `${games.length} unfinished ${games.length === 1 ? 'game' : 'games'}, last played first. Hold one to pick it up.`;

    clear(unfinishedRows);
    for (const { id, record } of games) {
      const touched = lastPlayed.get(formatPuzzleId(id)) ?? record.startedAt;
      const row = el(
        'button',
        { class: 'statrow open', 'aria-label': `Resume ${formatPuzzleId(id)}` },
        el('span', {}, formatPuzzleId(id)),
        el('span', { class: 'when' }, `${LEVEL_NAMES[id.level]} · ${sourceLabel(id.source)}`),
        el(
          'span',
          {
            class: 'when',
            // The exact date is a hover away, for when "3 weeks ago" is not enough.
            title: touched === undefined ? undefined : formatDate(touched),
          },
          touched === undefined ? '' : timeAgo(touched),
        ),
        el('span', { class: 'when' }, `${record.hints ?? 0}h ${record.checks ?? 0}c`),
        el('span', { class: 'hold' }, 'hold'),
      );
      /*
       * Held, not tapped. These rows sit right next to the reset crosses in a
       * scrolling list, and a stray tap while scrolling would drop you into a
       * puzzle you did not mean to open — the same reason the rest of the
       * screen guards its actions this way.
       */
      bindTap(row, {
        onTap: () => toast('Hold to resume'),
        onLong: () => ctx.playPuzzle(id),
      });
      // A keyboard has no long press; Enter or Space means what it says.
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ctx.playPuzzle(id);
        }
      });

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

      unfinishedRows.append(el('div', { class: 'unfinished-row' }, row, drop));
    }
  };

  /** Drop a puzzle from the history, and its board state if it is the saved one. */
  const forget = (id: PuzzleId): void => {
    clearSaveFor(id);
    ctx.history = forgetPuzzle(ctx.history, id);
    saveHistory(ctx.history);
  };

  const poolSize = (): number =>
    source === 'classic' ? (ctx.packCounts?.[level] ?? 0) : ctx.newPoolSize;

  const draw = (): void => {
    drawTotals();

    const unfinishedCount = unfinishedGames(ctx.history).length;
    unfinishedTab.textContent =
      `${showUnfinished ? '▾' : '▸'} Unfinished games (${unfinishedCount})`;
    unfinishedTab.classList.toggle('primary', showUnfinished);
    unfinishedSummary.hidden = !showUnfinished;
    unfinishedRows.hidden = !showUnfinished;
    resetAll.hidden = !showUnfinished || unfinishedCount === 0;
    drawUnfinished();

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
    showUnfinished = !showUnfinished;
    draw();
  });

  draw();
  screen.append(
    el('div', { class: 'titlebar' }, back, el('span', { class: 'id' }, 'STATS')),
    totals,
    unfinishedTab,
    unfinishedSummary,
    unfinishedRows,
    resetAll,
    el('p', { class: 'section-label' }, 'By level and pool'),
    levelTabs,
    sourceTabs,
    summary,
    rows,
    el('div', { class: 'actions', style: 'margin-top: 10px' }, reset, done),
  );
  return screen;
}
