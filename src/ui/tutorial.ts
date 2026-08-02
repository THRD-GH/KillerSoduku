import { clear, el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const TUTORIAL_KEY = 'ks:v1:tutorial-complete';

const STEPS = [
  { title: 'Choose a cell', body: 'Tap any square on the board. Its row, column, box and cage light up to keep your place.', demo: 'select' },
  { title: 'Write candidates', body: 'Tap number keys to toggle small candidate marks. Tap more than one number to keep your possibilities visible.', demo: 'candidates' },
  { title: 'Commit an answer', body: 'Hold or double-tap a number to enter it as the answer. Related candidates are removed for you.', demo: 'answer' },
  { title: 'Use the Sum calculator', body: 'Select a cage, then tap Sum to list every distinct-digit combination that fits its total and size. Tap digits to rule them out or require them.', demo: 'sum' },
  { title: 'Keep a cage tally', body: 'Select a cage and tap Tally to add its total. Tap an already-counted cage to subtract it, or hold Tally to clear everything. Counted cages are tinted on the board.', demo: 'tally' },
  { title: 'You are ready', body: 'CLEAR removes marks, Undo takes back a move, and Hint explains a solving step. The full guide is in Menu → Help.', demo: 'ready' },
] as const;

type Demo = typeof STEPS[number]['demo'];

function miniCell(content = '', className = ''): HTMLElement {
  return el('span', { class: `tutorial-cell ${className}`.trim() }, content);
}

function buildDemo(kind: Demo): HTMLElement {
  if (kind === 'select') {
    const grid = el('div', { class: 'tutorial-grid' });
    for (let i = 0; i < 9; i++) grid.append(miniCell(i === 4 ? '12' : '', i === 4 ? 'selected' : i === 1 || i === 3 || i === 5 || i === 7 ? 'peer' : ''));
    return el('div', { class: 'tutorial-picture' }, grid, el('span', { class: 'tutorial-caption' }, 'Selected cell and its peers'));
  }
  if (kind === 'candidates') {
    const marks = el('div', { class: 'tutorial-marks' });
    for (let d = 1; d <= 9; d++) marks.append(el('span', {}, [1, 3, 7].includes(d) ? String(d) : ''));
    return el('div', { class: 'tutorial-picture' }, el('div', { class: 'tutorial-large-cell' }, marks), el('div', { class: 'tutorial-key-row' }, ...['1', '3', '7'].map((d) => el('span', {}, d))));
  }
  if (kind === 'answer') {
    return el('div', { class: 'tutorial-picture tutorial-answer' }, el('span', { class: 'tutorial-key hold-key' }, '7', el('small', {}, 'HOLD')), el('span', { class: 'tutorial-arrow' }, '→'), el('div', { class: 'tutorial-large-cell answer-cell' }, '7'));
  }
  if (kind === 'sum') {
    return el('div', { class: 'tutorial-picture tutorial-sum' }, el('div', { class: 'tutorial-mini-keys' }, ...['1', '2', '3', '4', '5', '6'].map((d) => el('span', {}, d))), el('div', { class: 'tutorial-combos' }, el('b', {}, '16 in 3'), el('span', {}, '1 6 9'), el('span', {}, '2 5 9'), el('span', {}, '3 5 8')));
  }
  if (kind === 'tally') {
    return el('div', { class: 'tutorial-picture tutorial-tally-demo' }, el('span', { class: 'tutorial-cage counted' }, '12'), el('span', {}, '+'), el('span', { class: 'tutorial-cage counted' }, '8'), el('span', {}, '='), el('strong', {}, '20', el('small', {}, 'Tally')));
  }
  return el('div', { class: 'tutorial-picture tutorial-ready' }, ...['CLEAR', '↶ Undo', '? Hint'].map((label) => el('span', {}, label)));
}

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
      title.textContent = step.title;
      body.textContent = step.body;
      clear(demo);
      demo.append(buildDemo(step.demo));
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
