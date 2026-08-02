import { PEERS, bit, colOf, maskToDigits, rowOf } from '../core/grid.ts';
import type { Level } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import { Game } from '../game/state.ts';
import {
  clearSaveFor,
  puzzleLink,
  markFinished,
  markStarted,
  saveGame,
  saveHistory,
  saveSettings,
} from '../game/storage.ts';
import { keepScreenAwake } from '../game/wakelock.ts';
import { Board } from './board.ts';
import { clear, el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { cellName, describeTechnique, explainStep } from './explain.ts';
import { clockIcon, undoArrow } from './icons.ts';
import type { Step } from '../core/techniques.ts';
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
  private tallyBox = el('div', { class: 'tally' });
  private undoBtn = el('button', { class: 'btn icon', 'aria-label': 'Undo', title: 'Undo' });
  private redoBtn = el('button', { class: 'btn icon', 'aria-label': 'Redo', title: 'Redo' });
  private keys = new Map<number, HTMLButtonElement>();
  /** Undo and redo share a cell; built here so the controls can place them. */
  private undoPair = el('div', { class: 'undo-pair' });

  private ticker: number | undefined;
  private lastTick = 0;
  private paused = false;
  private pauseNode: HTMLElement | null = null;
  private saveTimer: number | undefined;

  private tallyTotal = 0;
  private tallyCages = new Set<number>();

  /**
   * Numpad taps kept briefly so a double-click can roll them back. The cell is
   * recorded too: the same digit tapped into a different cell moments earlier
   * is a separate move and must not be undone.
   */
  private recentTaps: { digit: number; cell: number; at: number }[] = [];

  constructor(ctx: AppContext, game: Game) {
    this.ctx = ctx;
    this.game = game;
    this.board = new Board(game, ctx.settings, this.tallyCages);
    // 'play' marks the one screen that re-lays-out side by side in landscape.
    this.root = el('div', { class: 'screen play' });
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
        // A hurried tap that lands half in the next cell still means "select",
        // and the cursor moves on touch-down so a cancelled pointer — the
        // browser guessing at a scroll — cannot swallow the move.
        forgiveDrift: true,
        tapOnDown: true,
      },
      (e) => this.board.indexOf(e),
    );
  }

  private buildControls(): HTMLElement {
    // A phone-keypad 3x3 block; everything else stacks beside it. Which side
    // each ends up on is the Keypad side setting, applied in CSS.
    const numpad = el('div', { class: 'numpad' });
    for (let d = 1; d <= 9; d++) {
      const key = el('button', { class: 'key', 'data-key': d }, String(d));
      // The remaining-count badge is decoration; on its own it would be read
      // out as part of the key's name ("5 4"). render() names the key instead.
      key.append(el('span', { class: 'count', 'aria-hidden': 'true' }));
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

    const pause = el('button', { class: 'pause-btn', 'aria-label': 'Pause', title: 'Pause' });
    pause.append(el('i'), el('i'));
    pause.addEventListener('click', () => this.pause());

    /*
     * Two columns, each with its own strip underneath (in source order — with
     * the keypad set to the right they are drawn the other way round):
     *   keypad          | Check  New
     *                   | Hint   Restart
     *                   | Sum    clock
     *   CLEAR undo/redo | tally  pause
     */
    const controls = el(
      'div',
      { class: 'controls' },
      el(
        'div',
        { class: 'controls-left' },
        numpad,
        el('div', { class: 'under-keys' }, clearKey, this.undoPair),
      ),
      el(
        'div',
        { class: 'controls-right' },
        this.buildActions(),
        el('div', { class: 'under-actions' }, this.tallyBox, pause),
      ),
    );

    bindTap(
      numpad,
      {
        onTap: (k) => this.tapDigit(k),
        onLong: (k) => this.forceDigit(k),
        onDouble: (k) => this.doubleDigit(k),
      },
      keyIndex,
    );

    // CLEAR now sits in the bottom row, so it carries its own gestures.
    bindTap(clearKey, {
      onTap: () => this.tapClear(),
      onLong: () => this.doClear(),
      onDouble: () => this.doClear(),
    });

    bindTap(this.tallyBox, {
      onTap: () => this.addCage(),
      onLong: () => this.resetTally(),
      // Counting two cages in quick succession is two taps here, and without
      // this the second would fall through to the long-press action and wipe
      // the running total. Holding is the only way to clear it.
      onDouble: () => undefined,
    });
    bindTap(this.timerBox, {
      onTap: () => {
        this.ctx.settings.showTimer = !this.ctx.settings.showTimer;
        saveSettings(this.ctx.settings);
        this.updateTimer();
      },
    });

    this.resetTally(true);
    return controls;
  }

  private buildActions(): HTMLElement {
    const check = el('button', { class: 'btn aid' }, 'Check');
    check.addEventListener('click', () => this.doCheck());

    const hint = el('button', { class: 'btn aid' }, 'Hint');
    // These can be set to long-click only, to stop stray taps spoiling a run.
    bindTap(hint, {
      onTap: () => (this.ctx.settings.hintNeedsLongClick ? this.nag('Hint') : this.doHint()),
      onLong: () => this.doHint(),
    });

    this.undoBtn.append(undoArrow());
    this.redoBtn.append(undoArrow(true));
    bindTap(this.undoBtn, {
      onTap: () => (this.ctx.settings.undoNeedsLongClick ? this.nag('Undo') : this.doUndo()),
      onLong: () => this.doUndo(),
    });
    bindTap(this.redoBtn, {
      onTap: () => (this.ctx.settings.undoNeedsLongClick ? this.nag('Redo') : this.doRedo()),
      onLong: () => this.doRedo(),
    });
    this.undoPair.append(this.undoBtn, this.redoBtn);

    const sum = el('button', { class: 'btn aid' }, 'Sum');
    sum.addEventListener('click', () => this.openCalculator());

    const restart = el('button', { class: 'btn session' }, 'Restart');
    restart.addEventListener('click', () =>
      confirmDialog('Clear every entry and start this puzzle again?', () => {
        this.game.restart();
        this.game.elapsedMs = 0;
        this.resetTally();
        if (this.ctx.settings.lazyMode) this.game.fillSingleCombinationCages();
        this.render();
      }, 'Restart'),
    );

    const next = el('button', { class: 'btn session' }, 'New');
    next.addEventListener('click', () =>
      confirmDialog('Leave this puzzle and start a new one?', () => {
        this.stop();
        this.ctx.playRandom(this.game.puzzle.difficulty as Level, this.game.id.source);
      }, 'New puzzle'),
    );

    // Filled column by column: Check/Hint/Sum, then New/Restart/clock.
    return el('div', { class: 'actions' }, check, hint, sum, next, restart, this.timerBox);
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
    this.recentTaps.push({ digit, cell: this.game.selected, at: performance.now() });
    // Only the last couple matter, and a game runs to hundreds of taps.
    if (this.recentTaps.length > 4) this.recentTaps.shift();
    this.game.tapDigit(this.game.selected, digit, this.ctx.settings);
    this.afterMove();
  }

  /**
   * A double-click has already delivered its taps, so roll those back before
   * forcing the entry — otherwise the toggling would fight the force.
   */
  private doubleDigit(digit: number): void {
    const now = performance.now();
    const cell = this.game.selected;
    let rollback = 0;
    for (let i = this.recentTaps.length - 1; i >= 0; i--) {
      const tap = this.recentTaps[i];
      if (tap.digit !== digit || tap.cell !== cell || now - tap.at > 600) break;
      rollback++;
    }

    /*
     * Both taps have to have gone into this cell. Typing the same digit into
     * two cells in quick succession is two taps on one key, which is a
     * double-click as far as the key is concerned — but it is plainly not one
     * gesture, and forcing the second entry would strip candidates across the
     * grid on the strength of a misread. Leave it as the tap it was.
     */
    if (rollback < 2) return;

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
    this.render();
    this.scheduleSave();
    if (wrong === 0) {
      toast('No mistakes so far');
      return;
    }
    // Knowing a digit is wrong is only half of it — everything built on top of
    // it is suspect too, and undoing by hand means guessing how far back to go.
    this.offerRewind(`${wrong} wrong ${wrong === 1 ? 'entry' : 'entries'}`);
  }

  /** Offer to wind the board back to before the first wrong entry. */
  private offerRewind(title: string): void {
    if (!this.game.canUndo()) {
      toast(`${title} — no history to wind back`);
      return;
    }
    openOverlay((close) => {
      const rewind = el('button', { class: 'btn primary' }, 'Rewind');
      rewind.addEventListener('click', () => {
        close();
        this.doRewind();
      });
      const stay = el('button', { class: 'btn' }, 'Leave it');
      stay.addEventListener('click', close);
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, title),
        el(
          'p',
          {},
          'Rewind takes the board back to the last position where everything was still right, ' +
            'undoing whatever was built on the mistake. Redo puts it all back if you change your mind.',
        ),
        el('div', { class: 'panel-footer two' }, stay, rewind),
      );
    });
  }

  private doRewind(): void {
    const steps = this.game.rewindToLastCorrect();
    this.recentTaps.length = 0;
    this.render();
    this.scheduleSave();
    toast(
      steps === 0
        ? 'Nothing wrong to wind back'
        : `Wound back ${steps} move${steps === 1 ? '' : 's'}`,
    );
  }

  /**
   * Explains the next step rather than silently filling a digit: which
   * technique applies, where, and what it gives you. Filling is offered
   * second, so a hint can teach instead of just advancing the grid.
   */
  private doHint(): void {
    const step = this.game.nextLogicalStep();
    if (step === null) {
      // No logical step means either finished, or the grid contradicts itself.
      const wrong = this.game.wrongCount();
      toast(
        this.game.isSolved()
          ? 'Solved'
          : wrong > 0
            ? `No step follows — ${wrong} entr${wrong === 1 ? 'y is' : 'ies are'} wrong. Try Check.`
            : 'No further step from plain logic here',
      );
      return;
    }

    // Point at what the step is about: the answered cell, or the cells it
    // narrows — capped, because a broad elimination can touch half the grid.
    const focus = step.solved ? [step.solved.cell] : step.cells.slice(0, 12);
    this.board.spotlight(focus);
    this.render();
    const extra = step.solved ? 0 : step.cells.length - focus.length;

    openOverlay((close) => {
      const fill = el('button', { class: 'btn primary' }, step.solved ? 'Fill it in' : 'Apply');
      fill.addEventListener('click', () => {
        close();
        this.board.spotlight([]);
        this.applyStep(step);
      });
      const dismiss = el('button', { class: 'btn' }, 'Just show me');
      dismiss.addEventListener('click', () => {
        close();
        if (step.solved) this.game.selected = step.solved.cell;
        this.render();
      });
      return el(
        'div',
        { class: 'panel hint' },
        el('h2', {}, describeTechnique(step.technique)),
        el('p', {}, explainStep(step, this.game)),
        el(
          'p',
          { class: 'summary' },
          `Highlighted: ${focus.map(cellName).join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`,
        ),
        el('div', { class: 'panel-footer two' }, dismiss, fill),
      );
    });
  }

  /** Carry out the hinted step: fill the answer, or pencil the eliminations. */
  private applyStep(step: Step): void {
    if (step.solved) {
      this.game.hints++;
      this.game.forceDigit(step.solved.cell, step.solved.digit, this.ctx.settings);
      this.game.selected = step.solved.cell;
      this.afterMove();
      return;
    }
    // No single answer, so the value is in the narrowed candidates.
    const filled = this.game.fillAllCandidates();
    this.game.hints++;
    toast(filled > 0 ? `Candidates updated in ${filled} cells` : 'Candidates already up to date');
    this.render();
    this.scheduleSave();
  }

  /**
   * A link to this exact puzzle. Nothing of the grid travels — level and
   * number reproduce it, so the link stays short and works on any device.
   */
  private shareLink(): void {
    const link = puzzleLink(this.game.id);
    const share = navigator.share?.bind(navigator);
    if (share) {
      void share({ title: `Killer Sudoku ${formatPuzzleId(this.game.id)}`, url: link }).catch(
        () => undefined,
      );
      return;
    }
    void navigator.clipboard
      ?.writeText(link)
      .then(() => toast('Link copied'))
      .catch(() => this.showLink(link));
  }

  /** Fallback when neither sharing nor the clipboard is available. */
  private showLink(link: string): void {
    openOverlay((close) => {
      const field = el('input', { type: 'text', value: link, readonly: true, class: 'link-box' });
      const done = el('button', { class: 'btn wide' }, 'Close');
      done.addEventListener('click', close);
      queueMicrotask(() => field.select());
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, `Puzzle ${formatPuzzleId(this.game.id)}`),
        field,
        el('div', { class: 'panel-footer' }, done),
      );
    });
  }

  private doFillCandidates(): void {
    const filled = this.game.fillAllCandidates();
    if (filled === -1) {
      toast('The grid contradicts itself — an entry must be wrong. Try Check.');
      return;
    }
    toast(filled > 0 ? `Pencilled ${filled} cells` : 'Candidates already up to date');
    this.render();
    this.scheduleSave();
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

  private doRedo(): void {
    if (!this.game.redo()) {
      toast('Nothing to redo');
      return;
    }
    this.recentTaps.length = 0;
    this.render();
    this.scheduleSave();
    if (!this.game.completed && this.game.isSolved()) this.win();
  }

  private openCalculator(): void {
    const sel = this.game.selected;
    const cage = sel >= 0 ? this.game.cageAt(sel) : null;
    // Digits already entered in this cage, so they stand out in each combination.
    let placed = 0;
    for (const c of cage?.cells ?? []) {
      if (this.game.values[c] !== 0) placed |= bit(this.game.values[c]);
    }
    /*
     * Digits the cage cannot use at all. This has to be judged across the whole
     * cage, not just the selected cell: a cage spans several rows, columns and
     * boxes, so a digit blocked where the cursor happens to sit is still fine
     * if any other empty cell of the cage can take it. Only when no empty cell
     * can is the digit genuinely out.
     */
    let blocked = 0;
    const empties = (cage?.cells ?? []).filter((c) => this.game.values[c] === 0);
    if (empties.length > 0) {
      for (let digit = 1; digit <= 9; digit++) {
        if (placed & bit(digit)) continue;
        const fits = empties.some((c) => !PEERS[c].some((p) => this.game.values[p] === digit));
        if (!fits) blocked |= bit(digit);
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
              const filled = this.game.fillCombination(
                this.game.cageIndexAt(sel),
                mask,
                this.ctx.settings,
              );
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
    /*
     * Counting a cage toggles it. Innie/outie sums are built up a cage at a
     * time and it is easy to add one you did not mean to; without this the only
     * way back was to clear the whole tally and start the arithmetic again.
     */
    const idx = this.game.cageIndexAt(sel);
    const cage = this.game.cageAt(sel);
    if (this.tallyCages.has(idx)) {
      this.tallyCages.delete(idx);
      this.tallyTotal -= cage.sum;
      toast(`Took ${cage.sum} back off the tally`);
    } else {
      this.tallyCages.add(idx);
      this.tallyTotal += cage.sum;
    }
    this.renderTally();
    this.board.render();
  }

  private resetTally(quiet = false): void {
    this.tallyTotal = 0;
    this.tallyCages.clear();
    this.renderTally();
    if (!quiet) {
      this.board.render();
      toast('Tally cleared');
    }
  }

  private renderTally(): void {
    clear(this.tallyBox);
    this.tallyBox.append(
      document.createTextNode(String(this.tallyTotal)),
      el('small', {}, this.tallyCages.size === 0 ? 'Tally' : `${this.tallyCages.size} cages`),
    );
  }

  // --------------------------------------------------------------- lifecycle

  private afterMove(): void {
    // Flagged as you go, for a relaxed game — Check stays the deliberate,
    // counted version for anyone who would rather find their own mistakes.
    if (this.ctx.settings.instantCheck) this.game.flagMistakes();
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
    clearSaveFor(this.game.id);
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
        this.techniqueReport(),
        el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr' }, menu, again),
      );
      // Low on the screen: the grid you have just finished is worth a look.
    }, { overlayClass: 'bottom-sheet' });
  }

  /**
   * What the puzzle actually asked of you. The solver already knows which
   * techniques the grid needs — it is worked out for every hint — and until
   * now that was thrown away the moment the puzzle ended. Naming the hardest
   * one is how a level stops being a number and starts meaning something.
   */
  private techniqueReport(): HTMLElement | null {
    const trace = this.game.solveTrace();
    if (trace.length === 0) return null;

    const hardest = trace[0];
    // Everything at the top difficulty, not just the first: two techniques of
    // equal standing both deserve the credit.
    const peers = trace.filter((t) => t.difficulty === hardest.difficulty);
    const names = peers.map((t) => describeTechnique(t.technique).toLowerCase());
    const steps = peers.reduce((n, t) => n + t.count, 0);

    return el(
      'p',
      { class: 'summary techniques' },
      `Hardest step: ${names.join(' and ')} — needed ${steps} time${steps === 1 ? '' : 's'}, ` +
        `out of ${trace.reduce((n, t) => n + t.count, 0)} deductions in all.`,
    );
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
        // Undo and redo travel with the save; only finishing throws them away.
        ...this.game.exportHistory(),
      });
    }, 400);
  }

  start(): void {
    this.lastTick = performance.now();
    if (this.ticker === undefined) {
      this.ticker = window.setInterval(() => this.tick(), 250);
    }
    // Studying a grid looks like idling to a phone, which then dims and locks.
    keepScreenAwake(this.ctx.settings.keepAwake);
  }

  stop(): void {
    if (this.ticker !== undefined) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
    keepScreenAwake(false);
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
    // Put down mid-puzzle: let the screen behave normally again.
    keepScreenAwake(false);

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
    keepScreenAwake(this.ctx.settings.keepAwake);
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
    if (this.ctx.settings.showTimer) {
      this.timerBox.textContent = formatTime(this.game.elapsedMs);
      return;
    }
    // A clock face rather than blanked-out digits, so the box still says what
    // it is. Only built once, not on every tick.
    if (!this.timerBox.querySelector('svg')) {
      clear(this.timerBox);
      this.timerBox.append(clockIcon(21));
    }
  }

  render(): void {
    this.board.render();
    this.updateTimer();
    this.undoBtn.disabled = !this.game.canUndo();
    this.redoBtn.disabled = !this.game.canRedo();

    for (let d = 1; d <= 9; d++) {
      const key = this.keys.get(d);
      if (!key) continue;
      const used = this.game.countOf(d);
      const left = 9 - used;
      key.classList.toggle('done', used >= 9);
      const badge = key.querySelector('.count');
      if (badge) badge.textContent = used >= 9 ? '' : String(left);
      key.setAttribute('aria-label', left > 0 ? `Digit ${d}, ${left} left` : `Digit ${d}, all placed`);
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
        // Bracketed, so they cannot be read as part of the cage's "N in M".
        this.candidateLine.append(el('span', { class: 'cands' }, `(${marks.join(' ')})`));
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
          item('Fill all candidates', () => this.doFillCandidates()),
          item('Rewind to before a mistake', () => {
            if (this.game.wrongCount() === 0) toast('Nothing wrong on the board');
            else this.offerRewind('Rewind');
          }),
          item('Share this puzzle', () => this.shareLink()),
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
        if (e.shiftKey) this.doRedo();
        else this.doUndo();
        break;
      case 'y':
        this.doRedo();
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

