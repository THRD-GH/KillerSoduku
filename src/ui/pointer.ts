export interface TapOptions {
  onTap?: (index: number) => void;
  /** Long-press. The reference app treats double-click as the same gesture. */
  onLong?: (index: number) => void;
  /** Fired on double-click when a tap has already been delivered for it. */
  onDouble?: (index: number) => void;
  longMs?: number;
}

const DEFAULT_LONG_MS = 450;

/**
 * Binds the tap / long-press / double-click trio the reference app uses.
 *
 * A tap fires immediately — waiting to see whether a double-click follows would
 * make every digit entry feel laggy. So on a double-click the caller gets
 * `onDouble` *after* having already had `onTap`, and is expected to undo the
 * tap before applying the stronger action.
 */
export function bindTap(target: HTMLElement, opts: TapOptions, indexOf?: (e: Event) => number): void {
  const longMs = opts.longMs ?? DEFAULT_LONG_MS;
  let timer: number | undefined;
  let longFired = false;
  let downIndex = -1;

  const index = (e: Event): number => (indexOf ? indexOf(e) : 0);

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  target.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    downIndex = index(e);
    if (downIndex < 0) return;
    longFired = false;
    cancel();
    timer = window.setTimeout(() => {
      longFired = true;
      timer = undefined;
      opts.onLong?.(downIndex);
    }, longMs);
  });

  target.addEventListener('pointerup', (e) => {
    cancel();
    const i = index(e);
    if (i < 0 || i !== downIndex) return;
    if (longFired) {
      // Swallow the click that follows a long-press.
      e.preventDefault();
      return;
    }
    opts.onTap?.(i);
  });

  for (const ev of ['pointercancel', 'pointerleave'] as const) {
    target.addEventListener(ev, cancel);
  }

  target.addEventListener('dblclick', (e) => {
    const i = index(e);
    if (i < 0) return;
    e.preventDefault();
    (opts.onDouble ?? opts.onLong)?.(i);
  });

  // A long-press on touch would otherwise raise the text-selection menu.
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}
