import { findCombos, maxSum, minSum } from '../core/combos.ts';
import { bit, maskToDigits } from '../core/grid.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

type DigitState = 'neutral' | 'include' | 'exclude';

export interface SumCalcOptions {
  /** Prefilled from the selected cage; the player may override both. */
  size: number;
  sum: number;
  /** Digits already entered in that cage, so they can be picked out on sight. */
  placed?: number;
  /**
   * Digits already in the selected cell's row, column or box. They may still
   * belong to the cage, just not in this cell.
   */
  blocked?: number;
  /** Called by [Auto] when exactly one combination remains. */
  onAuto?: (mask: number) => void;
}

/**
 * The combination finder. Digits cycle neutral → include (green) → exclude
 * (red), [Go] lists what fits, and [Auto] writes the single remaining
 * combination into the cage as candidates.
 */
export function openSumCalculator(opts: SumCalcOptions): void {
  openOverlay((close) => {
    const state: DigitState[] = Array.from({ length: 10 }, () => 'neutral');
    const placed = opts.placed ?? 0;
    // A digit in the cage is the stronger fact, so it wins where both apply.
    const blocked = (opts.blocked ?? 0) & ~placed;

    const sumInput = el('input', {
      type: 'number',
      min: 1,
      max: 45,
      value: String(opts.sum),
      inputmode: 'numeric',
    });
    const sizeInput = el('input', {
      type: 'number',
      min: 1,
      max: 9,
      value: String(opts.size),
      inputmode: 'numeric',
    });

    const results = el('div', { class: 'results' });
    const digitRow = el('div', { class: 'calc-keys' });
    const autoBtn = el('button', { class: 'btn' }, 'Auto');
    autoBtn.disabled = true;
    let lastMatches: number[] = [];
    /**
     * Combinations the player has ruled out by hand. Some eliminations come
     * from reasoning about the grid that no digit filter can express, so a row
     * can simply be struck off. Keyed by digit mask, so a strike survives
     * re-filtering and reappears if that same combination comes back.
     */
    const struck = new Set<number>();
    let remaining: number[] = [];

    const digitButtons: HTMLButtonElement[] = [];
    for (let d = 1; d <= 9; d++) {
      const b = el('button', { class: 'btn' }, String(d));
      b.addEventListener('click', () => {
        state[d] = state[d] === 'neutral' ? 'include' : state[d] === 'include' ? 'exclude' : 'neutral';
        b.className = `btn ${state[d] === 'include' ? 'inc' : state[d] === 'exclude' ? 'exc' : ''}`.trim();
        run();
      });
      digitButtons.push(b);
      digitRow.append(b);
    }

    const run = (): void => {
      const size = Math.max(1, Math.min(9, Number(sizeInput.value) || 0));
      const sum = Math.max(1, Math.min(45, Number(sumInput.value) || 0));
      let include = 0;
      let exclude = 0;
      for (let d = 1; d <= 9; d++) {
        if (state[d] === 'include') include |= bit(d);
        if (state[d] === 'exclude') exclude |= bit(d);
      }

      results.replaceChildren();
      if (sum < minSum(size) || sum > maxSum(size)) {
        results.append(
          el(
            'div',
            { class: 'none' },
            `${size} digit${size === 1 ? '' : 's'} cannot total ${sum} ` +
              `(range ${minSum(size)}–${maxSum(size)}).`,
          ),
        );
        lastMatches = [];
      } else {
        lastMatches = findCombos(size, sum, include, exclude);
        if (lastMatches.length === 0) {
          results.append(el('div', { class: 'none' }, 'No combination fits those constraints.'));
        } else {
          for (const mask of lastMatches) {
            const row = el('div', {
              class: struck.has(mask) ? 'combo struck' : 'combo',
              role: 'button',
              tabindex: 0,
              title: 'Tap to rule this combination out',
            });
            for (const d of maskToDigits(mask)) {
              const inCage = (placed & bit(d)) !== 0;
              const inPeers = (blocked & bit(d)) !== 0;
              row.append(
                el(
                  'span',
                  {
                    class: `d${inCage ? ' placed' : inPeers ? ' blocked' : ''}`,
                    title: inCage
                      ? 'already in this cage'
                      : inPeers
                        ? "already in this cell's row, column or box"
                        : undefined,
                  },
                  String(d),
                ),
              );
            }
            const toggle = (): void => {
              if (struck.has(mask)) struck.delete(mask);
              else struck.add(mask);
              run();
            };
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            });
            results.append(row);
          }
        }
      }

      remaining = lastMatches.filter((m) => !struck.has(m));
      autoBtn.disabled = !(remaining.length === 1 && opts.onAuto !== undefined);
      const ruledOut = lastMatches.length - remaining.length;
      count.textContent =
        (remaining.length === 1 ? '1 combination' : `${remaining.length} combinations`) +
        (ruledOut > 0 ? ` (${ruledOut} ruled out)` : '');
    };

    const count = el('span', { class: 'label' });
    sumInput.addEventListener('input', run);
    sizeInput.addEventListener('input', run);

    const back = el('button', { class: 'btn' }, 'Back');
    back.addEventListener('click', close);
    autoBtn.addEventListener('click', () => {
      if (remaining.length !== 1) return;
      opts.onAuto?.(remaining[0]);
      close();
    });

    const reset = el('button', { class: 'btn' }, 'Reset');
    reset.addEventListener('click', () => {
      for (let d = 1; d <= 9; d++) {
        state[d] = 'neutral';
        digitButtons[d - 1].className = 'btn';
      }
      struck.clear();
      run();
    });

    const panel = el(
      'div',
      { class: 'panel calc' },
      el('h2', {}, 'Sum calculator'),
      el(
        'div',
        { class: 'row' },
        el('label', {}, 'Sum'),
        sumInput,
        el('label', {}, 'Cells'),
        sizeInput,
        count,
      ),
      // Keypad on the left, the combinations it filters on the right. The
      // controls explain themselves through colour; Help carries the detail.
      el('div', { class: 'calc-body' }, digitRow, results),
      el('div', { class: 'panel-footer three' }, back, reset, autoBtn),
    );

    run();
    return panel;
  });
}
