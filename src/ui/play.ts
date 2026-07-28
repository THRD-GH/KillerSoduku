import { PEERS, bit, colOf, maskToDigits, rowOf } from '../core/grid.ts';
import type { Level } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import { Game } from '../game/state.ts';
import {
  clearSave,
  markFinished,
  markStarted,
  saveGame,
  saveHistory,
  saveSettings,
} from '../game/storage.ts';
import { Board } from './board.ts';
import { clear, el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { openSumCalculator } from './sumcalc.ts';
import type { AppContext } from './app-context.ts';

const CLEAR_KEY = 0;

export class PlayScreen {
  readonly root: HTMLDivElement;
  private ctx: AppContext;
  private game: Game;
  private board: Board;

  private idLabel = el('span', { class: 'id' });
  private candidateLine = el('span', { class: 'candidates' });
  private timerBox = el('div', { class: 'timer' }, '00:00');
  private adderBox = el('div', { class: 'adder' });
  private undoBtn = el('button', { class: 'btn' }, 'Undo');
  private keys = new Map<number, HTMLButtonElement>();

  private ticker: number | undefined;
  private lastTick = 0;
  private paused = false;
  private pauseNode: HTMLElement | null = null;
  private saveTimer: number | undefined;

  private adderTotal = 0;
  private adderCages = new Set<number>();

  /** Numpad taps kept briefly so a double-click can roll them back. */
  private recentTaps: { digit: number; at: number }[] = [];

  constructor(ctx: AppContext, game: Game) {
    this.ctx = ctx;
    this.game = game;
    this.board = new Board(game, ctx.settings);
    this.root = el('div', { class: 'screen' });
    this.build();

    if (ctx.settings.lazyMode && game.filledCount === 0) {
      const filled = game.fillSingleCombinationCages();
      if (filled > 0) toast(`Lazy mode filled ${filled} candidate cells`);
    }

    this.ctx.history = markStarted(this.ctx.history, game.id);
    saveHistory(this.ctx.history);

    this.render();
    this.start();
  }

  // ---------------------------------------------------------------- building

  private build(): void {
    const menuBtn = el('button', { class: 'iconbtn', 'aria-label': 'Menu' });
    menuBtn.append(el('i'), el('i'), el('i'));
    menuBtn.addEventListener('click', () => this.openMenu());

    this.idLabel.textContent = formatPuzzleId(this.game.id);

    this.root.append(
      el('div', { class: 'titlebar' }, menuBtn, this.idLabel, this.candidateLine),
      this.board.root,
      this.buildControls(),
      this.buildActions(),
    );

    bindTap(
      this.board.root,
      {
        onTap: (i) => {
          this.game.selected = i;
          this.render();
        },
        // Long-press any cell pauses, exactly as the reference app does.
        onLong: () => this.pause(),
        onDouble: () => undefined,
      },
      (e) => this.board.indexOf(e),
    );
  }

  private buildControls(): HTMLElement {
    // A phone-keypad 3x3 block on the left; everything else stacks beside it.
    const numpad = el('div', { class: 'numpad' });
    for (let d = 1; d <= 9; d++) {
      const key = el('button', { class: 'key', 'data-key': d }, String(d));
      key.append(el('span', { class: 'count' }));
      this.keys.set(d, key);
      numpad.append(key);
    }

    const clearKey = el('button', { class: 'key clear', 'data-key': 'clear' }, 'CLEAR');
    this.keys.set(CLEAR_KEY, clearKey);

    const keyIndex = (e: Event): number => {
      const node = (e.target as HTMLElement | null)?.closest('[data-key]') as HTMLElement | null;
      if (!node) return -1;
      const raw = node.dataset.key;
      return raw === 'clear' ? CLEAR_KEY : Number(raw);
    };

    const controls = el(
      'div',
      { class: 'controls' },
      numpad,
      el('div', { class: 'side' }, clearKey, this.adderBox, this.timerBox),
    );

    // Bound on the wrapper so CLEAR keeps the same gesture set as the digits.
    bindTap(
      controls,
      {
        onTap: (k) => (k === CLEAR_KEY ? this.tapClear() : this.tapDigit(k)),
        onLong: (k) => (k === CLEAR_KEY ? this.doClear() : this.forceDigit(k)),
        onDouble: (k) => (k === CLEAR_KEY ? this.doClear() : this.doubleDigit(k)),
      },
      keyIndex,
    );

    bindTap(this.adderBox, { onTap: () => this.addCage(), onLong: () => this.resetAdder() });
    bindTap(this.timerBox, {
      onTap: () => {
        this.ctx.settings.showTimer = !this.ctx.settings.showTimer;
        saveSettings(this.ctx.settings);
        this.updateTimer();
      },
    });

    this.resetAdder(true);
    return controls;
  }

  private buildActions(): HTMLElement {
    const check = el('button', { class: 'btn' }, 'Check');
    check.addEventListener('click', () => this.doCheck());

    const hint = el('button', { class: 'btn' }, 'Hint');
    const undo = this.undoBtn;
    // These two can be set to long-click only, to stop stray taps spoiling a run.
    bindTap(hint, {
      onTap: () => (this.ctx.settings.hintNeedsLongClick ? this.nag('Hint') : this.doHint()),
      onLong: () => this.doHint(),
    });
    bindTap(undo, {
      onTap: () => (this.ctx.settings.undoNeedsLongClick ? this.nag('Undo') : this.doUndo()),
      onLong: () => this.doUndo(),
    });

    const sum = el('button', { class: 'btn' }, 'Sum');
    sum.addEventListener('click', () => this.openCalculator());

    const restart = el('button', { class: 'btn' }, 'Restart');
    restart.addEventListener('click', () =>
      confirmDialog('Clear every entry and start this puzzle again?', () => {
        this.game.restart();
        this.game.elapsedMs = 0;
        this.resetAdder();
        if (this.ctx.settings.lazyMode) this.game.fillSingleCombinationCages();
        this.render();
      }, 'Restart'),
    );

    const next = el('button', { class: 'btn' }, 'New');
    next.addEventListener('click', () =>
      confirmDialog('Leave this puzzle and start a new one?', () => {
        this.stop();
        this.ctx.playRandom(this.game.puzzle.difficulty as Level, this.game.id.source);
      }, 'New puzzle'),
    );

    // Pausing by long-clicking a cell is too well hidden to be the only way in.
    const pause = el('button', { class: 'btn wide' }, 'Pause');
    pause.addEventListener('click', () => this.pause());

    return el('div', { class: 'actions' }, check, hint, sum, restart, next, undo, pause);
  }

  // ------------------------------------------------------------------ input

  private nag(what: string): void {
    toast(`${what} is set to long-click — hold the button`);
  }

  private tapDigit(digit: number): void {
    if (this.game.selected < 0) {
      toast('Choose a cell first');
      return;
    }
    this.recentTaps.push({ digit, at: performance.now() });
    this.game.tapDigit(this.game.selected, digit, this.ctx.settings);
    this.afterMove();
  }

  /**
   * A double-click has already delivered its taps, so roll those back before
   * forcing the entry — otherwise the toggling would fight the force.
   */
  private doubleDigit(digit: number): void {
    const now = performance.now();
    let rollback = 0;
    for (let i = this.recentTaps.length - 1; i >= 0; i--) {
      const tap = this.recentTaps[i];
      if (tap.digit !== digit || now - tap.at > 600) break;
      rollback++;
    }
    for (let i = 0; i < rollback; i++) this.game.undo();
    this.recentTaps.length = 0;
    this.forceDigit(digit);
  }

  private forceDigit(digit: number): void {
    if (this.game.selected < 0) {
      toast('Choose a cell first');
      return;
    }
    const tidied = this.game.forceDigit(this.game.selected, digit, this.ctx.settings);
    if (tidied > 0) toast(`Removed ${digit} from ${tidied} cell${tidied === 1 ? '' : 's'}`);
    this.afterMove();
  }

  private tapClear(): void {
    if (this.ctx.settings.clearNeedsLongClick) {
      toast('Hold (or double-click) CLEAR to empty a cell');
      return;
    }
    this.doClear();
  }

  private doClear(): void {
    if (this.game.selected < 0) return;
    this.game.clearCell(this.game.selected);
    this.afterMove();
  }

  private doCheck(): void {
    const wrong = this.game.check();
    toast(wrong === 0 ? 'No mistakes so far' : `${wrong} wrong ${wrong === 1 ? 'entry' : 'entries'}`);
    this.render();
    this.scheduleSave();
  }

  private doHint(): void {
    const target = this.game.hint(this.ctx.settings);
    if (target === null) {
      toast('Nothing left to fill');
      return;
    }
    this.game.selected = target;
    this.afterMove();
  }

  private doUndo(): void {
    if (!this.game.undo()) {
      toast('Nothing to undo');
      return;
    }
    this.recentTaps.length = 0;
    this.render();
    this.scheduleSave();
  }

  private openCalculator(): void {
    const sel = this.game.selected;
    const cage = sel >= 0 ? this.game.cageAt(sel) : null;
    // Digits already entered in this cage, so they stand out in each combination.
    let placed = 0;
    for (const c of cage?.cells ?? []) {
      if (this.game.values[c] !== 0) placed |= bit(this.game.values[c]);
    }
    // And digits ruled out for the selected cell by its row, column or box.
    let blocked = 0;
    if (sel >= 0) {
      for (const p of PEERS[sel]) {
        if (this.game.values[p] !== 0) blocked |= bit(this.game.values[p]);
      }
    }
    openSumCalculator({
      size: cage?.cells.length ?? 2,
      sum: cage?.sum ?? 3,
      placed,
      blocked,
      onAuto:
        sel >= 0
          ? (mask) => {
              const filled = this.game.fillCombination(this.game.cageIndexAt(sel), mask);
              toast(filled > 0 ? `Filled ${filled} cells` : 'That cage is already complete');
              this.afterMove();
            }
          : undefined,
    });
  }

  private addCage(): void {
    const sel = this.game.selected;
    if (sel < 0) {
      toast('Choose a cell first');
      return;
    }
    const idx = this.game.cageIndexAt(sel);
    if (this.adderCages.has(idx)) {
      toast('That cage is already in the total');
      return;
    }
    this.adderCages.add(idx);
    this.adderTotal += this.game.cageAt(sel).sum;
    this.renderAdder();
  }

  private resetAdder(quiet = false): void {
    this.adderTotal = 0;
    this.adderCages.clear();
    this.renderAdder();
    if (!quiet) toast('Adder cleared');
  }

  private renderAdder(): void {
    clear(this.adderBox);
    this.adderBox.append(
      document.createTextNode(String(this.adderTotal)),
      el('small', {}, this.adderCages.size === 0 ? 'adder' : `${this.adderCages.size} cages`),
    );
  }

  // --------------------------------------------------------------- lifecycle

  private afterMove(): void {
    this.render();
    this.scheduleSave();
    if (!this.game.completed && this.game.isSolved()) this.win();
  }

  private win(): void {
    this.game.completed = true;
    this.stop();
    const ms = this.game.elapsedMs;
    this.ctx.history = markFinished(
      this.ctx.history,
      this.game.id,
      ms,
      this.game.hints,
      this.game.checks,
      Date.now(),
    );
    saveHistory(this.ctx.history);
    clearSave();
    this.render();

    openOverlay((close) => {
      const again = el('button', { class: 'btn primary' }, 'Next puzzle');
      again.addEventListener('click', () => {
        close();
        this.ctx.playRandom(this.game.puzzle.difficulty as Level, this.game.id.source);
      });
      const menu = el('button', { class: 'btn' }, 'Main menu');
      menu.addEventListener('click', () => {
        close();
        this.ctx.goMenu();
      });
      return el(
        'div',
        { class: 'panel won' },
        el('h2', {}, `Puzzle ${formatPuzzleId(this.game.id)} solved`),
        el('div', { class: 'time' }, formatTime(ms)),
        el(
          'p',
          { class: 'summary' },
          `${this.game.hints} hint${this.game.hints === 1 ? '' : 's'}, ` +
            `${this.game.checks} check${this.game.checks === 1 ? '' : 's'}`,
        ),
        el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr' }, menu, again),
      );
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      if (this.game.completed) return;
      saveGame({
        id: this.game.id,
        puzzle: this.game.puzzle,
        values: this.game.values,
        pencils: this.game.pencils,
        elapsedMs: this.game.elapsedMs,
        hints: this.game.hints,
        checks: this.game.checks,
      });
    }, 400);
  }

  start(): void {
    this.lastTick = performance.now();
    if (this.ticker === undefined) {
      this.ticker = window.setInterval(() => this.tick(), 250);
    }
  }

  stop(): void {
    if (this.ticker !== undefined) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private tick(): void {
    const now = performance.now();
    if (!this.paused && !this.game.completed) {
      this.game.elapsedMs += now - this.lastTick;
      this.updateTimer();
    }
    this.lastTick = now;
  }

  /** Pause on demand, and whenever the tab goes to the background. */
  pause(): void {
    if (this.paused || this.game.completed) return;
    this.paused = true;
    this.scheduleSave();

    const node = el(
      'div',
      { class: 'paused' },
      el(
        'div',
        {},
        el('h2', {}, 'PAUSED'),
        el('p', {}, 'Long-click (or press Escape) to continue'),
      ),
    );
    this.pauseNode = node;
    bindTap(node, { onTap: () => toast('Hold to continue'), onLong: () => this.resume() });
    document.body.append(node);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastTick = performance.now();
    this.pauseNode?.remove();
    this.pauseNode = null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  destroy(): void {
    this.stop();
    this.pauseNode?.remove();
  }

  // ---------------------------------------------------------------- rendering

  private updateTimer(): void {
    this.timerBox.textContent = this.ctx.settings.showTimer
      ? formatTime(this.game.elapsedMs)
      : '--:--';
  }

  render(): void {
    this.board.render();
    this.updateTimer();
    this.undoBtn.disabled = !this.game.canUndo();

    for (let d = 1; d <= 9; d++) {
      const key = this.keys.get(d);
      if (!key) continue;
      const used = this.game.countOf(d);
      key.classList.toggle('done', used >= 9);
      const badge = key.querySelector('.count');
      if (badge) badge.textContent = used >= 9 ? '' : String(9 - used);
    }

    clear(this.candidateLine);
    const sel = this.game.selected;
    if (sel >= 0) {
      const cage = this.game.cageAt(sel);
      this.candidateLine.append(
        el('span', {}, `${cage.sum} in ${cage.cells.length}`),
        document.createTextNode('  '),
      );
      const marks = maskToDigits(this.game.pencils[sel]);
      if (this.game.values[sel] !== 0) {
        this.candidateLine.append(el('b', {}, String(this.game.values[sel])));
      } else if (marks.length > 0) {
        for (const d of marks) this.candidateLine.append(el('span', {}, String(d)));
      }
    }
  }

  // ------------------------------------------------------------------- menus

  private openMenu(): void {
    openOverlay((close) => {
      const item = (label: string, run: () => void): HTMLButtonElement => {
        const b = el('button', { class: 'btn' }, label);
        b.addEventListener('click', () => {
          close();
          run();
        });
        return b;
      };
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'Menu'),
        el(
          'div',
          { class: 'menu-list' },
          item('Pause', () => this.pause()),
          item('Settings', () => this.ctx.openSettings()),
          item('Stats', () => this.ctx.goStats(this.game.puzzle.difficulty as Level)),
          item('Help', () => this.ctx.openHelp()),
          item('Main menu', () => {
            this.stop();
            this.ctx.goMenu();
          }),
        ),
      );
    });
  }

  // ---------------------------------------------------------------- keyboard

  handleKey(e: KeyboardEvent): void {
    if (document.querySelector('.overlay')) return;
    if (this.paused) {
      if (e.key === 'Escape') this.resume();
      return;
    }

    const sel = this.game.selected;
    if (e.key >= '1' && e.key <= '9') {
      const digit = Number(e.key);
      if (e.shiftKey || e.ctrlKey) this.forceDigit(digit);
      else this.tapDigit(digit);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'Backspace':
      case 'Delete':
      case '0':
        this.doClear();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const r = sel < 0 ? 0 : rowOf(sel);
        const c = sel < 0 ? 0 : colOf(sel);
        const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const nr = Math.min(8, Math.max(0, r + dr));
        const nc = Math.min(8, Math.max(0, c + dc));
        this.game.selected = sel < 0 ? 0 : nr * 9 + nc;
        this.render();
        e.preventDefault();
        break;
      }
      case 'z':
      case 'u':
        this.doUndo();
        break;
      case 'h':
        this.doHint();
        break;
      case 'c':
        this.doCheck();
        break;
      case 's':
        this.openCalculator();
        break;
      case 'Escape':
        this.pause();
        break;
      default:
        break;
    }
  }
}

