import { LEVEL_NAMES } from '../core/generator.ts';
import { formatPuzzleId, sourceLabel } from '../core/types.ts';
import { allSaves, clearSaveFor, forgetPuzzle, saveHistory } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { clear, el, formatDate, formatTime, timeAgo } from './dom.ts';
import { binIcon } from './icons.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';

/** Pick up or discard any parked game without going through Stats. */
export function openUnfinishedPicker(ctx: AppContext, onChanged: () => void): void {
  openOverlay((close) => {
    const summary = el('p', { class: 'summary' });
    const rows = el('div', { class: 'unfinished-picker' });

    const draw = (): void => {
      const saves = allSaves();
      // What a row does belongs in the description, not repeated down the list.
      // The ordering does not: the times are right there in the rows.
      summary.textContent =
        `${saves.length} unfinished ${saves.length === 1 ? 'game' : 'games'}. ` +
        'Tap one to pick it up again, or the bin to reset it to unplayed.';
      clear(rows);

      for (const saved of saves) {
        const id = saved.id;
        const resume = el(
          'button',
          { class: 'statrow open', 'aria-label': `Resume ${formatPuzzleId(id)}` },
          el('span', {}, formatPuzzleId(id)),
          el('span', { class: 'when' }, `${LEVEL_NAMES[id.level]} · ${sourceLabel(id.source)}`),
          /*
           * Two different clocks, and both are worth knowing: how long ago you
           * put it down, and how long you had spent on it when you did.
           */
          el(
            'span',
            {
              // Bold: this is the column the list is scanned by.
              class: 'when since',
              title: saved.savedAt === undefined ? undefined : formatDate(saved.savedAt),
            },
            saved.savedAt === undefined ? '' : timeAgo(saved.savedAt),
          ),
          // Bracketed, so it does not read as another point in time next to
          // the one beside it: this is how long the puzzle has taken so far.
          el('span', { class: 'when' }, `(${formatTime(saved.elapsedMs)})`),
        );
        resume.addEventListener('click', () => {
          close();
          ctx.playPuzzle(id);
        });

        const reset = el(
          'button',
          { class: 'rowx', 'aria-label': `Reset ${formatPuzzleId(id)} to unplayed`, title: 'Reset to unplayed' },
          binIcon(),
        );
        reset.addEventListener('click', () => {
          confirmDialog(
            `Reset ${formatPuzzleId(id)}? Its progress will be discarded and the puzzle will return to the unplayed pool.`,
            () => {
              clearSaveFor(id);
              ctx.history = forgetPuzzle(ctx.history, id);
              saveHistory(ctx.history);
              onChanged();
              draw();
              toast(`${formatPuzzleId(id)} reset to unplayed`);
              if (allSaves().length === 0) close();
            },
            'Reset',
          );
        });
        rows.append(el('div', { class: 'unfinished-row' }, resume, reset));
      }
    };

    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    draw();
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Unfinished games'),
      summary,
      rows,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
