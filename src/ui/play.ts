import { PEERS, bit, colOf, maskToDigits, rowOf } from '../core/grid.ts';
import type { Level, PuzzleId } from '../core/types.ts';
import { displayPuzzleId, sourceLabel } from '../core/types.ts';
import { BELTS, LEVEL_NAMES } from '../core/generator.ts';
import { Game } from '../game/state.ts';
import {
  clearSaveFor,
  puzzleLink,
  markFinished,
  markStarted,
  saveGame,
  levelStats,
  saveHistory,
  saveSettings,
} from '../game/storage.ts';
import { keepScreenAwake } from '../game/wakelock.ts';
import { Board } from './board.ts';
import { clear, el, formatTime, shortTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { cellName, describeTechnique, explainStep } from './explain.ts';
import { clockIcon, thumbIcon, undoArrow } from './icons.ts';
import type { Step } from '../core/techniques.ts';
import { bindTap } from './pointer.ts';
import { openSumCalculator } from './sumcalc.ts';
import type { AppContext } from './app-context.ts';
import { openActionMenu } from './action-menu.ts';

const CLEAR_KEY = 0;

export class PlayScreen {
  readonly root: HTMLDivElement;
  private ctx: AppContext;
  private game: Game;
  private board: Board;

  private idLabel = el('span', { class: 'id' });
  private candidateLine = el('span', { class: 'candidates' });
  /** The time to beat, beside the puzzle number. Off unless asked for. */
  private targetBox = el('span', { class: 'target' });
  /*
   * The digits live in their own span. The clock is rewritten four times a
   * second, and writing it straight onto the box would take everything else
   * in there with it — which in the landscape bar is the target sitting
   * underneath.
   */
  private timerText = el('span', { class: 'digits' }, '00:00');
  private timerBox = el('div', { class: 'timer' }, this.timerText);
  private tallyBox = el('div', { class: 'tally' });
  private undoBtn = el('button', { class: 'btn icon', 'aria-label': 'Undo', title: 'Undo' });
  private redoBtn = el('button', { class: 'btn icon', 'aria-label': 'Redo', title: 'Redo' });
  private keys = new Map<number, HTMLButtonElement>();
  /** Undo and redo share a cell; built here so the controls can place them. */
  private undoPair = el('div', { class: 'undo-pair' });
  private titlebar = el('div', { class: 'titlebar' });
  private pauseBtn = el('button', { class: 'pause-btn', 'aria-label': 'Pause', title: 'Pause' });
  /** Where the clock and the pause button live when the bar is not holding them. */
  private actionsBox: HTMLElement | null = null;
  private underActions: HTMLElement | null = null;

  /**
   * Landscape on a phone: the one layout where the title bar sits beside the
   * board rather than over it, and where a row of screen is worth more than
   * tidiness.
   */
  private compact = window.matchMedia('(orientation: landscape) and (max-height: 560px)');
  private onCompactChange = (): void => this.placeClockAndPause();

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

    this.idLabel.textContent = displayPuzzleId(this.game.id);

    // Between the puzzle it belongs to and the line about the cell under the
    // cursor: it is a fact about this game, not about this move.
    this.titlebar.append(menuBtn, this.idLabel, this.targetBox, this.candidateLine);
    this.root.append(this.titlebar, this.board.root, this.buildControls());

    this.placeClockAndPause();
    this.compact.addEventListener('change', this.onCompactChange);

    bindTap(
      this.board.root,
      {
        onTap: (i) => {
          this.game.selected = i;
          this.render();
        },
        // Long-press any cell pauses, matching the original control scheme.
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

    this.pauseBtn.append(el('i'), el('i'));
    this.pauseBtn.addEventListener('click', () => this.pause());

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
        (this.actionsBox = this.buildActions()),
        (this.underActions = el('div', { class: 'under-actions' }, this.tallyBox, this.pauseBtn)),
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

  /**
   * The clock and the pause button move into the title bar when the board is
   * beside it rather than under it. Held landscape a phone has height to spare
   * nowhere and width to spare everywhere, and those two are the only controls
   * that read as well in a bar as they do in a grid — so the buttons that are
   * actually pressed get the room they leave behind.
   */
  private placeClockAndPause(): void {
    if (this.compact.matches) {
      /*
       * The target rides under the clock here rather than beside the puzzle
       * number. This bar is 264px holding six things, and a chip wide enough to
       * spell out a target squeezed the puzzle number down to a stub — while
       * the clock it belongs to is moving into this same bar anyway, where a
       * smaller number beneath a running one reads as the mark to beat.
       */
      this.timerBox.append(this.targetBox);
      this.titlebar.append(this.timerBox, this.pauseBtn);
      this.titlebar.classList.add('with-clock');
      /*
       * With those two gone the strip under the buttons holds only the tally,
       * and a whole row of a short screen to hold one control is a poor trade.
       * The tally takes the cell the clock has just left, the strip goes away,
       * and every button grows by the height it was using.
       */
      this.actionsBox?.append(this.tallyBox);
    } else {
      this.idLabel.after(this.targetBox);
      this.actionsBox?.append(this.timerBox);
      this.underActions?.append(this.tallyBox, this.pauseBtn);
      this.titlebar.classList.remove('with-clock');
    }
  }

  private buildActions(): HTMLElement {
    const check = el('button', { class: 'btn aid' }, 'Check');
    // These can be set to long-click only, to stop stray taps spoiling a run.
    bindTap(check, {
      onTap: () =>
        this.ctx.settings.checkNeedsLongClick
          ? this.nag('Check', 'check the grid')
          : this.doCheck(),
      onLong: () => this.doCheck(),
    });

    const hint = el('button', { class: 'btn aid' }, 'Hint');
    bindTap(hint, {
      onTap: () =>
        this.ctx.settings.hintNeedsLongClick
          ? this.nag('Hint', 'take a hint')
          : this.doHint(),
      onLong: () => this.doHint(),
    });

    this.undoBtn.append(undoArrow());
    this.redoBtn.append(undoArrow(true));
    bindTap(this.undoBtn, {
      onTap: () =>
        this.ctx.settings.undoNeedsLongClick
          ? this.nag('Undo', 'undo that move')
          : this.doUndo(),
      onLong: () => this.doUndo(),
    });
    bindTap(this.redoBtn, {
      onTap: () =>
        this.ctx.settings.undoNeedsLongClick
          ? this.nag('Redo', 'redo that move')
          : this.doRedo(),
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

  /**
   * One shape for every guarded button, so they read as one rule rather than
   * four. Naming the button matters when the message appears at the bottom of
   * the screen and the finger is somewhere else, and the double-click is worth
   * saying: bindTap sends a double-click to the long-press action, so it works
   * on all of them, not just CLEAR where it was the only one being mentioned.
   */
  private nag(button: string, action: string): void {
    toast(`Hold ${button} (or double-click) to ${action}`);
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
      this.nag('CLEAR', 'empty a cell');
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
      void share({ title: `Killer Sudoku ${displayPuzzleId(this.game.id)}`, url: link }).catch(
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
        el('h2', {}, `Puzzle ${displayPuzzleId(this.game.id)}`),
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
      // No message: the total changes and the cage loses its tint, which says
      // it better than words do.
      this.tallyCages.delete(idx);
      this.tallyTotal -= cage.sum;
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
    /*
     * The clock stops; the screen must not. Letting the lock go here starts the
     * phone's idle timeout at the exact moment a panel appears that is meant to
     * be read — and a phone that has dimmed does not simply come back on a
     * touch: the touch that wakes it is spent waking it, and never reaches the
     * button under the finger. Held until the panel goes.
     */
    this.stop({ awake: this.ctx.settings.keepAwake });
    const ms = this.game.elapsedMs;
    // Taken before the run is recorded: it is being judged against the form it
    // arrived with, not against a figure it has just moved.
    const average = this.poolAverageMs();
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
      // Opens over this panel rather than instead of it: the detail is a second
      // look, and closing it puts you back at the result.
      const insights = el('button', { class: 'btn' }, 'Insights');
      insights.addEventListener('click', () => this.openInsights(ms, average));
      return el(
        'div',
        { class: 'panel won' },
        el('h2', {}, `Puzzle ${displayPuzzleId(this.game.id)} solved`),
        el('div', { class: 'time' }, formatTime(ms)),
        this.verdict(ms, average),
        el(
          'p',
          { class: 'summary' },
          `${this.game.hints} hint${this.game.hints === 1 ? '' : 's'}, ` +
            `${this.game.checks} check${this.game.checks === 1 ? '' : 's'}`,
        ),
        el(
          'div',
          { class: 'actions', style: 'grid-template-columns: repeat(3, 1fr)' },
          menu,
          insights,
          again,
        ),
      );
      // Low on the screen and over a clear backdrop: the grid you have just
      // finished is worth a look, and dimming it to announce that you finished
      // it hides the one thing you want to see.
    }, {
      overlayClass: 'bottom-sheet undimmed',
      // Whichever way it went — a button, the backdrop, the back gesture — the
      // reading is over. A puzzle started from here takes the lock back.
      onClosed: () => keepScreenAwake(false),
    });
  }

  /**
   * The time to beat: your average over this level and pool, which is the same
   * figure the win screen judges the run against. Chasing one number and being
   * scored on another would be a strange game.
   *
   * Nothing is shown until there is an average to show — a first run through a
   * pool has no target, and an invented one would be worse than none.
   */
  private renderTarget(): void {
    const target = this.ctx.settings.showTarget ? this.poolAverageMs() : null;
    if (target === null) {
      this.targetBox.textContent = '';
      this.targetBox.hidden = true;
      return;
    }
    this.targetBox.hidden = false;
    this.targetBox.textContent = `target ${formatTime(target)}`;
    this.targetBox.classList.toggle('past', this.game.elapsedMs > target);
  }

  /** Your average over this level and pool, or null with nothing to average. */
  private poolAverageMs(): number | null {
    const { level, source } = this.game.id;
    const size = source === 'classic' ? (this.ctx.packCounts?.[level] ?? 0) : this.ctx.newPoolSize;
    return levelStats(this.ctx.history, level, source, size).averageMs;
  }

  /**
   * How the run went, as a share rather than as a stopwatch reading: "10%
   * faster" is a verdict, "06:12 against 06:52" is arithmetic left for you to
   * do. The gap follows in brackets, because a percentage of an average you
   * cannot see means little on its own.
   */
  private verdict(ms: number, average: number | null): HTMLElement {
    const { level, source } = this.game.id;
    if (average === null) {
      return el(
        'p',
        { class: 'summary verdict' },
        `First one finished in ${LEVEL_NAMES[level]} · ${sourceLabel(source)}`,
      );
    }
    const gap = average - ms;
    const percent = Math.round((Math.abs(gap) / average) * 100);
    if (percent === 0) return el('p', { class: 'summary verdict' }, 'Level with your average');
    const faster = gap > 0;
    return el(
      'p',
      { class: `summary verdict ${faster ? 'up' : 'down'}` },
      thumbIcon(faster),
      `${percent}% ${faster ? 'faster' : 'slower'} than average (${shortTime(Math.abs(gap))})`,
    );
  }

  /**
   * The long version, for anyone who wants it: where the run sits against the
   * pool, and every technique the grid asked for rather than only the hardest.
   */
  private openInsights(ms: number, average: number | null): void {
    openOverlay((close) => {
      const { level, source } = this.game.id;
      const trace = this.game.solveTrace();
      const total = trace.reduce((n, t) => n + t.count, 0);
      const hardest = trace[0]?.difficulty;

      const tile = (value: string, label: string): HTMLElement =>
        el('div', { class: 'tile' }, el('b', {}, value), el('small', {}, label));
      const gap = average === null ? null : average - ms;

      const list = el('ul', { class: 'technique-list' });
      for (const step of trace) {
        list.append(
          el(
            'li',
            { class: step.difficulty === hardest ? 'hardest' : '' },
            `${describeTechnique(step.technique)} — ${step.count}`,
          ),
        );
      }

      const back = el('button', { class: 'btn' }, 'Back');
      back.addEventListener('click', close);

      return el(
        'div',
        { class: 'panel insights' },
        el('h2', {}, 'Game insights'),
        el(
          'p',
          { class: 'summary' },
          `${displayPuzzleId(this.game.id)} · ${BELTS[level].name} · ${sourceLabel(source)}`,
        ),
        el(
          'div',
          { class: 'totals' },
          tile(formatTime(ms), 'your time'),
          tile(average === null ? '—' : formatTime(average), 'pool average'),
          tile(
            // formatTime, not the compact form the verdict uses: three times
            // side by side in one row have to be read against each other.
            gap === null ? '—' : formatTime(Math.abs(gap)),
            gap === null ? 'no average yet' : gap > 0 ? 'faster' : 'slower',
          ),
        ),
        el('p', { class: 'section-label' }, `What it took — ${total} deductions`),
        list,
        el(
          'p',
          { class: 'summary' },
          `${this.game.hints} hints and ${this.game.checks} checks used`,
        ),
        el('div', { class: 'panel-footer' }, back),
      );
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      this.writeSave();
    }, 400);
  }

  /**
   * Write a waiting save now rather than in a moment.
   *
   * Leaving the screen must not leave the last move sitting in a timer: a trip
   * to Stats and straight back would rebuild the board from a save written
   * before that move, and the timer would then land on top of the new screen's
   * own saving. Called when the screen goes, and when the page does.
   */
  flushSave(): void {
    if (this.saveTimer === undefined) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.writeSave();
  }

  private writeSave(): void {
    // A finished puzzle keeps no save; the win cleared it deliberately.
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
  }

  start(): void {
    this.lastTick = performance.now();
    if (this.ticker === undefined) {
      this.ticker = window.setInterval(() => this.tick(), 250);
    }
    // Studying a grid looks like idling to a phone, which then dims and locks.
    keepScreenAwake(this.ctx.settings.keepAwake);
  }

  /**
   * Stops the clock, and lets the screen go with it — unless the caller still
   * has something on screen worth reading, which the win panel does.
   */
  stop({ awake = false } = {}): void {
    if (this.ticker !== undefined) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
    if (!awake) keepScreenAwake(false);
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

  /** Which puzzle this screen is showing, for anything that means to come back. */
  get puzzleId(): PuzzleId {
    return this.game.id;
  }

  destroy(): void {
    this.compact.removeEventListener('change', this.onCompactChange);
    this.stop();
    this.pauseNode?.remove();
    this.flushSave();
  }

  // ---------------------------------------------------------------- rendering

  private updateTimer(): void {
    // Rides with the clock: the setting can be turned on mid-game, and passing
    // the target is something that happens on a tick rather than on a move.
    this.renderTarget();
    if (this.ctx.settings.showTimer) {
      this.timerText.textContent = formatTime(this.game.elapsedMs);
      return;
    }
    // A clock face rather than blanked-out digits, so the box still says what
    // it is. Only built once, not on every tick.
    if (!this.timerText.querySelector('svg')) {
      clear(this.timerText);
      this.timerText.append(clockIcon(21));
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
    /*
     * Ordered by what the puzzle in front of you needs: the two aids the
     * buttons do not carry, then putting it down, then the incidental, then
     * the panels that hand the grid straight back — and last the two that
     * leave the board, together, where a slip is least likely.
     */
    openActionMenu('Menu', [
      { label: 'Fill all candidates', run: () => this.doFillCandidates() },
      { label: 'Rewind to before a mistake', run: () => {
        if (this.game.wrongCount() === 0) toast('Nothing wrong on the board');
        else this.offerRewind('Rewind');
      } },
      { label: 'Pause', run: () => this.pause() },
      { label: 'Share this puzzle', run: () => this.shareLink() },
      { label: 'Settings', run: () => this.ctx.openSettings() },
      { label: 'Help', run: () => this.ctx.openHelp() },
      { label: 'Stats', run: () => this.ctx.goStats(this.game.puzzle.difficulty as Level) },
      { label: 'Main menu', run: () => { this.stop(); this.ctx.goMenu(); } },
    ]);
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

