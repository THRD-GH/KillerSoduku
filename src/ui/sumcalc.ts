import { findCombos, maxSum, minSum } from '../core/combos.ts';
import { bit, maskToDigits } from '../core/grid.ts';
import { el } from './dom.ts';
import { transparencyIcon } from './icons.ts';
import { openOverlay } from './overlay.ts';

type DigitState = 'neutral' | 'include' | 'exclude';

export interface SumCalcOptions {
  /** Prefilled from the selected cage; the player may override both. */
  size: number;
  sum: number;
  /** Digits already entered in that cage, so they can be picked out on sight. */
  placed?: number;
  /**
   * Digits no empty cell of the cage can take, because each is already used in
   * that cell's row, column or box. Judged across the whole cage, so a digit
   * merely blocked at the cursor is not counted.
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
  // Translucent: the calculator is read against the grid, so the grid has to
  // stay visible behind it.
  openOverlay((close) => {
    const placed = opts.placed ?? 0;

    /**
     * Digits already written into the cage start out required. Any combination
     * without them cannot be this cage's, so listing them is just noise — and
     * showing the keys as green says why the list is filtered, and leaves them
     * tappable if the sum or cell count is being overridden to ask something else.
     */
    const state: DigitState[] = Array.from({ length: 10 }, (_, d) =>
      d >= 1 && placed & bit(d) ? 'include' : 'neutral',
    );
    const classFor = (d: number): string =>
      `btn ${state[d] === 'include' ? 'inc' : state[d] === 'exclude' ? 'exc' : ''}`.trim();
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
      const b = el('button', { class: classFor(d) }, String(d));
      b.addEventListener('click', () => {
        // Ruling a digit out is the common move, so it comes first:
        // neutral -> exclude -> include -> neutral.
        state[d] =
          state[d] === 'neutral' ? 'exclude' : state[d] === 'exclude' ? 'include' : 'neutral';
        b.className = classFor(d);
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
                        ? 'cannot go in any empty cell of this cage'
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
      holdHeight();
    };

    /*
     * The list of combinations is the only thing in the panel that changes
     * size, and filtering it down used to shrink the whole panel — which moved
     * the buttons underneath while you were still aiming at them. The box is
     * held at the tallest it has needed so far, so ruling digits out empties
     * space rather than collapsing it. It still grows if a new sum or cell
     * count needs more room, and the cap in the stylesheet still applies.
     */
    let floor = 0;
    const holdHeight = (): void => {
      // A detached box measures zero, and the panel is built before it is
      // attached — measuring then would pin it shut. The first real
      // measurement is taken once it is on screen.
      if (!results.isConnected) return;
      results.style.height = 'auto';
      // scrollHeight covers the padding but not the border, and the box sizes
      // border-box, so the two edges have to be added back.
      floor = Math.max(floor, results.scrollHeight + 2);
      results.style.height = `${floor}px`;
    };

    sumInput.addEventListener('input', run);
    sizeInput.addEventListener('input', run);

    /*
     * Slides the panel between almost-clear and solid. The value rides on the
     * overlay as a custom property, so every surface inside it follows.
     *
     * Always opens solid. Seeing through the panel is something you want for a
     * moment, to check the grid behind it — carrying that setting over to the
     * next time you open the calculator only means opening it half-readable.
     */
    const glass = el('input', {
      type: 'range',
      min: '0.35',
      max: '1',
      step: '0.01',
      value: '1',
      'aria-label': 'Sum calculator transparency',
    });
    glass.addEventListener('input', () => {
      glass.closest<HTMLElement>('.overlay')?.style.setProperty('--glass', glass.value);
    });

    const back = el('button', { class: 'btn' }, 'Back');
    back.addEventListener('click', close);
    autoBtn.addEventListener('click', () => {
      if (remaining.length !== 1) return;
      opts.onAuto?.(remaining[0]);
      close();
    });

    const reset = el('button', { class: 'btn' }, 'Reset');
    // Back to the opening state, which keeps the cage's own digits required —
    // those are facts about the board, not a filter the player chose.
    reset.addEventListener('click', () => {
      for (let d = 1; d <= 9; d++) {
        state[d] = placed & bit(d) ? 'include' : 'neutral';
        digitButtons[d - 1].className = classFor(d);
      }
      struck.clear();
      run();
    });

    const panel = el(
      'div',
      { class: 'panel calc' },
      el('h2', {}, 'Sum calculator'),
      // Keypad and the two fields on the left, the combinations they filter on
      // the right, given the full height. The controls explain themselves
      // through colour; Help carries the detail.
      el(
        'div',
        { class: 'calc-body' },
        el(
          'div',
          { class: 'calc-left' },
          digitRow,
          el(
            'div',
            { class: 'calc-fields' },
            el('label', {}, 'Sum', sumInput),
            el('label', {}, 'Cells', sizeInput),
          ),
        ),
        results,
      ),
      el(
        'div',
        { class: 'panel-footer' },
        el(
          'label',
          { class: 'glass-slider', title: 'How much of the grid shows through' },
          transparencyIcon(),
          glass,
        ),
        el('div', { class: 'footer-buttons three' }, back, reset, autoBtn),
      ),
    );

    run();
    // Now that it is on screen it can be measured, and held at that height.
    queueMicrotask(holdHeight);
    return panel;
  }, { overlayClass: 'see-through bottom-sheet' });
}
