import { el } from './dom.ts';

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

/** Close the innermost open panel. True if there was one. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function openOverlay(
  build: (close: () => void) => HTMLElement,
  opts: { dismissable?: boolean; overlayClass?: string } = {},
): () => void {
  const dismissable = opts.dismissable ?? true;
  const backdrop = el('div', {
    class: `overlay${opts.overlayClass ? ` ${opts.overlayClass}` : ''}`,
  });

  const entry = { close: (): void => undefined };
  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
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
