import { el } from './dom.ts';
import { lastPress } from './pointer.ts';

/**
 * Opens a modal panel. `build` receives a close callback so the content can
 * dismiss itself; clicking the backdrop or pressing Escape also closes.
 */
/** Open panels, innermost last, so the back button can close the top one. */
const stack: { close: () => void }[] = [];

/** Told when a panel opens, so the app shell can arm the back button. */
let onOpen: (() => void) | null = null;
export const onOverlayOpen = (fn: () => void): void => {
  onOpen = fn;
};

/** And when one closes, so it can let the entry go again. */
let onClose: (() => void) | null = null;
export const onOverlayClose = (fn: () => void): void => {
  onClose = fn;
};

/** How many panels are open, innermost included. */
export const overlaysOpen = (): number => stack.length;

/** Close the innermost open panel. True if there was one. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/**
 * How long a panel watches for the tail of the gesture that opened it.
 *
 * A panel usually appears because of a tap, and it appears *under the finger
 * that made it*. Finishing a puzzle with a double-press is the plain case: the
 * first press completes the grid and the win panel opens, and the second press
 * — already on its way — lands on whichever button has just moved into that
 * spot. On a phone that is Main menu, Next puzzle, or the backdrop, none of
 * which the player asked for, and the win screen is gone before it was read.
 *
 * Matched to the double-tap window in pointer.ts: within it, a second tap
 * belongs to the gesture that just happened, not to what is now on screen.
 */
const TAP_GUARD_MS = 400;

/**
 * And how far from that gesture a press still counts as part of it.
 *
 * Time alone is not enough to tell the two apart, and guessing by time alone
 * meant a deliberate tap made straight after a win — the eager ones, taken
 * before the panel has settled — was thrown away with the stray one, leaving a
 * panel that ignored the first press and answered the second.
 *
 * The stray press is the second half of a double-press: same finger, same key,
 * a few pixels at most from the first. A press anywhere else is somebody
 * reading the panel and choosing, however quickly they did it.
 */
const STRAY_RADIUS_PX = 48;

export function openOverlay(
  build: (close: () => void) => HTMLElement,
  opts: {
    dismissable?: boolean;
    overlayClass?: string;
    /** Run once this panel has gone, however it went. */
    onClosed?: () => void;
  } = {},
): () => void {
  const dismissable = opts.dismissable ?? true;
  const backdrop = el('div', {
    class: `overlay${opts.overlayClass ? ` ${opts.overlayClass}` : ''}`,
  });

  /*
   * The gesture that brought this panel up, and how long it has to finish
   * arriving. A press is taken away only if it lands where that gesture was;
   * everything else reaches the panel at once, however soon after it opened.
   */
  const opened = performance.now();
  const origin = lastPress();
  let guarded = true;
  window.setTimeout(() => {
    guarded = false;
  }, TAP_GUARD_MS);

  const belongsToOpeningGesture = (e: PointerEvent): boolean => {
    if (origin === null) return false;
    // The panel was opened by something other than a tap — a keystroke, or the
    // last move of a puzzle typed in. Nothing is in flight to swallow.
    if (opened - origin.at > TAP_GUARD_MS) return false;
    return Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <= STRAY_RADIUS_PX;
  };

  /*
   * Swallowed on the way down, before it reaches a button or the backdrop's own
   * dismissal — and the click the browser makes of it afterwards is swallowed
   * too, since preventDefault on a pointer event is not everywhere enough to
   * stop it.
   */
  backdrop.addEventListener(
    'pointerdown',
    (e) => {
      // Judged press by press for as long as the window lasts, rather than
      // spent on the first one: a nervous triple-press puts three of them on
      // the panel, and all three belong to the gesture, not to the panel.
      if (!guarded) return;
      if (!belongsToOpeningGesture(e)) return;
      e.preventDefault();
      // Immediate: a press that lands on the backdrop has the backdrop's own
      // dismissal listener waiting on the very same node, which plain
      // stopPropagation does nothing about.
      e.stopImmediatePropagation();
      const eatClick = (click: Event): void => {
        click.preventDefault();
        click.stopPropagation();
        window.removeEventListener('click', eatClick, true);
      };
      window.addEventListener('click', eatClick, true);
      window.setTimeout(() => window.removeEventListener('click', eatClick, true), TAP_GUARD_MS);
    },
    true,
  );

  const entry = { close: (): void => undefined };
  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    const at = stack.indexOf(entry);
    if (at < 0) return;
    stack.splice(at, 1);
    opts.onClosed?.();
    onClose?.();
  };
  entry.close = close;
  stack.push(entry);
  onOpen?.();

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    }
  };

  backdrop.append(build(close));
  if (dismissable) {
    // No guard check here: a press belonging to the gesture that opened this
    // panel never gets this far, and anything that does is a deliberate tap
    // outside it — which means what it means, however soon it came.
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  return close;
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  // A status region, so the message is spoken as well as shown.
  const node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, message);
  document.body.append(node);
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.remove(), 2200);
}

/** Yes/no panel used for the destructive actions (restart, reset a level). */
export function confirmDialog(message: string, onYes: () => void, yesLabel = 'Yes'): void {
  openOverlay((close) => {
    const cancel = el('button', { class: 'btn' }, 'Cancel');
    const yes = el('button', { class: 'btn primary' }, yesLabel);
    cancel.addEventListener('click', close);
    yes.addEventListener('click', () => {
      close();
      onYes();
    });
    return el(
      'div',
      { class: 'panel' },
      el('p', {}, message),
      el(
        'div',
        { class: 'actions', style: 'grid-template-columns: 1fr 1fr; margin-top: 12px' },
        cancel,
        yes,
      ),
    );
  });
}
