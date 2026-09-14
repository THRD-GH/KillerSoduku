import { el } from './dom.ts';
import { fireworks } from './fireworks.ts';
import { openOverlay } from './overlay.ts';

/**
 * The solve's fireworks on demand, without solving a puzzle — from Settings,
 * and from F on a keyboard.
 *
 * They go off over a panel of their own rather than over nothing, because the
 * show is laid out on the panel it stands on: this one stands in for the
 * Solved panel, so what plays is what a solve would get. It plays whether or
 * not the switch is on, since seeing it is how to decide. Again runs it once
 * more, and closing the panel stops it.
 */
export function previewFireworks(): void {
  // The show plays nothing on a device that asks for less motion, and a panel
  // with nothing happening over it would look broken, so it says why instead.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    openOverlay((close) => {
      const done = el('button', { class: 'btn primary' }, 'Close');
      done.addEventListener('click', close);
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'Fireworks'),
        el(
          'p',
          {},
          'This device asks for reduced motion, so fireworks are not shown — not here, and not when a puzzle is solved.',
        ),
        el('div', { class: 'panel-footer' }, done),
      );
    });
    return;
  }

  let stop: () => void = () => {};
  let panel: HTMLElement | null = null;
  const play = (): void => {
    stop();
    stop = fireworks({ above: panel });
  };
  openOverlay(
    (close) => {
      const again = el('button', { class: 'btn' }, 'Again');
      again.addEventListener('click', play);
      const done = el('button', { class: 'btn primary' }, 'Close');
      done.addEventListener('click', close);
      panel = el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'Fireworks'),
        el('p', {}, 'What solving a puzzle sets off.'),
        el('div', { class: 'panel-footer two' }, again, done),
      );
      return panel;
    },
    { onClosed: () => stop() },
  );
  play();
}
