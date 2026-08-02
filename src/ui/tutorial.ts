import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const TUTORIAL_KEY = 'ks:v1:tutorial-complete';

const STEPS = [
  ['Choose a cell', 'Tap any square on the board. Its row, column, box and cage light up to keep your place.', '①  Tap a square'],
  ['Write candidates', 'Tap number keys to toggle small candidate marks. Tap more than one number to keep your possibilities visible.', '②  Tap 1–9 for notes'],
  ['Commit an answer', 'Hold or double-tap a number to enter it as the answer. Related candidates are removed for you.', '③  Hold a number to answer'],
  ['Use the Sum calculator', 'Select a cage, then tap Sum to list every distinct-digit combination that fits its total and size. Tap digits to rule them out or require them.', '④  Explore cage combinations'],
  ['Keep a cage tally', 'Select a cage and tap Tally to add its total. Tap an already-counted cage to subtract it, or hold Tally to clear everything. Counted cages are tinted on the board.', '⑤  Add and subtract cage totals'],
  ['You are ready', 'CLEAR removes marks, Undo takes back a move, and Hint explains a solving step. The full guide is in Menu → Help.', '⑥  Solve at your pace'],
] as const;

function tutorialComplete(): boolean {
  try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { return false; }
}

function rememberTutorial(): void {
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* Storage is optional. */ }
}

/** Open the walkthrough. First-run callers can ask it to respect completion. */
export function openTutorial(onlyIfNew = false): void {
  if (onlyIfNew && tutorialComplete()) return;
  openOverlay((close) => {
    let current = 0;
    const title = el('h2');
    const demo = el('div', { class: 'tutorial-demo' });
    const body = el('p', { class: 'summary tutorial-copy' });
    const progress = el('div', { class: 'tutorial-progress', 'aria-label': 'Tutorial progress' });
    const back = el('button', { class: 'btn' }, 'Back');
    const next = el('button', { class: 'btn primary' });
    const finish = (): void => { rememberTutorial(); close(); };
    const draw = (): void => {
      const step = STEPS[current];
      title.textContent = step[0];
      body.textContent = step[1];
      demo.textContent = step[2];
      progress.textContent = STEPS.map((_, i) => i === current ? '●' : '○').join(' ');
      back.disabled = current === 0;
      next.textContent = current === STEPS.length - 1 ? 'Start playing' : 'Next';
    };
    back.addEventListener('click', () => { if (current > 0) current--; draw(); });
    next.addEventListener('click', () => { if (current === STEPS.length - 1) finish(); else { current++; draw(); } });
    const skip = el('button', { class: 'tutorial-skip' }, 'Skip tutorial');
    skip.addEventListener('click', finish);
    draw();
    return el('div', { class: 'panel tutorial' }, el('div', { class: 'eyebrow' }, 'QUICK START'), title, demo, body, progress, el('div', { class: 'tutorial-actions' }, back, next), skip);
  }, { dismissable: false });
}

/** Show once, immediately after the player's first puzzle reaches the screen. */
export const openFirstGameTutorial = (): void => openTutorial(true);
