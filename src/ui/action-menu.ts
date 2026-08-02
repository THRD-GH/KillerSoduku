import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

export interface MenuAction {
  label: string;
  run: () => void;
}

/** Shared button-list panel used by both the home and in-game menus. */
export function openActionMenu(title: string, actions: MenuAction[]): void {
  openOverlay((close) => {
    const list = el('div', { class: 'menu-list' });
    for (const action of actions) {
      const button = el('button', { class: 'btn' }, action.label);
      button.addEventListener('click', () => {
        close();
        action.run();
      });
      list.append(button);
    }
    return el('div', { class: 'panel' }, el('h2', {}, title), list);
  });
}
