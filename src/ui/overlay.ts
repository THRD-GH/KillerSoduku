import { el } from './dom.ts';

/**
 * Opens a modal panel. `build` receives a close callback so the content can
 * dismiss itself; clicking the backdrop or pressing Escape also closes.
 */
export function openOverlay(
  build: (close: () => void) => HTMLElement,
  opts: { dismissable?: boolean } = {},
): () => void {
  const dismissable = opts.dismissable ?? true;
  const backdrop = el('div', { class: 'overlay' });

  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
  };

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
  const node = el('div', { class: 'toast' }, message);
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
