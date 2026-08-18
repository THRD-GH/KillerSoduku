import './style.css';
import './styles/responsive.css';
import type { Level, PuzzleId, Source } from './core/types.ts';
import { formatPuzzleId } from './core/types.ts';
import { getPuzzle, prefetch } from './game/generate.ts';
import { packCounts } from './game/packs.ts';
import { registerServiceWorker, setThemeColour } from './game/pwa.ts';
import { keepScreenAwake } from './game/wakelock.ts';
import { Game } from './game/state.ts';
import {
  NEW_POOL_SIZE,
  clearPuzzleLink,
  linkedPuzzle,
  loadHistory,
  loadSaveFor,
  loadSettings,
  unplayedNumbers,
} from './game/storage.ts';
import type { History, SavedGame, Settings, Theme } from './game/storage.ts';
import { clear, el } from './ui/dom.ts';
import { buildMenu } from './ui/menu.ts';
import { openHelp } from './ui/help.ts';
import {
  closeTopOverlay,
  onOverlayClose,
  onOverlayOpen,
  openOverlay,
  overlaysOpen,
  toast,
} from './ui/overlay.ts';
import { PlayScreen } from './ui/play.ts';
import { openSettings } from './ui/settings.ts';
import { buildStats } from './ui/stats.ts';
import type { AppContext } from './ui/app-context.ts';
import { openFirstGameTutorial } from './ui/tutorial.ts';

/** The browser chrome colour that matches each board, for the PWA title bar. */
const THEME_COLOUR: Record<Theme, string> = {
  night: '#0a0d10',
  day: '#dfe4e9',
  contrast: '#000000',
};

class App implements AppContext {
  settings: Settings = loadSettings();
  history: History = loadHistory();
  packCounts: Record<number, number> | null = null;
  readonly newPoolSize = NEW_POOL_SIZE;

  private root: HTMLElement;
  private play: PlayScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.applyTheme();
    this.applyKeypadSide();

    this.guardBackButton();
    /*
     * The page can go without warning — a phone reclaiming a backgrounded app,
     * or the reload offered when a new version lands — and the last move must
     * not be sitting in a save timer when it does.
     */
    window.addEventListener('pagehide', () => this.play?.flushSave());
    document.addEventListener('keydown', (e) => this.play?.handleKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.play?.pause();
    });

    // A shared link names a puzzle outright; honour it instead of the menu.
    const linked = linkedPuzzle();
    clearPuzzleLink();

    // Packs are optional; the menu renders either way and redraws once known.
    void packCounts().then((counts) => {
      this.packCounts = counts;
      if (!this.play && linked === null) this.goMenu();
    });

    if (linked === null) this.goMenu();
    else {
      this.goMenu();
      this.playPuzzle(linked);
    }
  }

  /**
   * Installed as a PWA there is no browser chrome, so the phone's back gesture
   * is the only back there is — and by default it leaves the app entirely,
   * mid-puzzle. One history entry is kept while anything other than the bare
   * menu is on screen, and going back spends it: the top panel closes, or the
   * menu comes back. Only from the bare menu does back leave.
   *
   * "While", not "since": the entry is let go the moment it stops being wanted,
   * however that happened. A panel closed by its own Back button used to leave
   * the entry standing, and the press that should have left the app was spent
   * redrawing the menu over itself — no visible answer to the press, so it read
   * as the app refusing to close until you pressed again.
   */
  private guarded = false;

  /**
   * A back() this app asked for itself, to spend the entry it was holding. The
   * popstate it causes is not somebody pressing back, and must not be read as
   * one.
   */
  private spending = false;

  /** The bare menu wants no entry; every other screen does. */
  private onMenu = false;

  /**
   * The puzzle Stats was opened from. Stats used to be a one-way trip: it
   * sat in the in-game menu looking like Settings and Help, which hand the
   * grid straight back, and instead put you out on the levels with the
   * puzzle to find again under the unfinished list.
   */
  statsReturn: PuzzleId | null = null;

  private guardBackButton(): void {
    onOverlayOpen(() => this.armBack());
    onOverlayClose(() => this.syncGuard());
    window.addEventListener('popstate', () => {
      // Our own doing, and already acted on before it was asked for.
      if (this.spending) {
        this.spending = false;
        return;
      }
      if (closeTopOverlay()) {
        // The panel took the press. Whether another entry is wanted for what is
        // underneath depends on what that is, and the close hook has just asked.
        this.guarded = false;
        return;
      }
      if (!this.guarded) return;
      // The press spent the entry; what it lands on wants none, so nothing to
      // settle. Back out of Stats goes wherever its own Back goes.
      this.guarded = false;
      if (this.statsReturn !== null) this.leaveStats();
      else this.goMenu();
    });
  }

  private armBack(): void {
    if (this.guarded) return;
    // Whatever became of the last back() we asked for, this is a fresh entry
    // and the next popstate belongs to whoever presses back — a browser that
    // quietly refused that back cannot leave the flag standing and swallow it.
    this.spending = false;
    history.pushState({ ks: 'back' }, '');
    this.guarded = true;
  }

  private guardWanted(): boolean {
    return !this.onMenu || overlaysOpen() > 0;
  }

  /**
   * Match the entry we hold to the screen, once the dust has settled.
   *
   * Deferred by a microtask because closing a panel is so often the first half
   * of going somewhere: the picker closes and then opens a puzzle, the win
   * panel closes and then deals the next one. Judged at the moment of the close
   * every one of those would spend the entry and immediately push another —
   * and since back() only takes effect on the next turn of the loop, the pop
   * would land on the entry we had just pushed and quietly take it away.
   */
  private syncQueued = false;
  private syncGuard(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      if (this.guardWanted()) this.armBack();
      else if (this.guarded) {
        this.guarded = false;
        this.spending = true;
        history.back();
      }
    });
  }

  applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    setThemeColour(THEME_COLOUR[this.settings.theme]);
  }

  /** Only worth holding while a puzzle is open and running. */
  applyWakeLock(): void {
    keepScreenAwake(this.settings.keepAwake && this.play !== null && !this.play.isPaused);
  }

  /** Landscape reads this off the root, so no screen has to be rebuilt. */
  applyKeypadSide(): void {
    document.documentElement.dataset.keypad = this.settings.keypadSide;
  }

  /** Storage was replaced underneath us (an import); start again from it. */
  reload(): void {
    this.settings = loadSettings();
    this.history = loadHistory();
    this.applyTheme();
    this.applyKeypadSide();
    this.goMenu();
  }

  refreshBoard(): void {
    this.play?.render();
  }

  private mount(node: HTMLElement): void {
    this.play?.destroy();
    this.play = null;
    clear(this.root);
    this.root.append(node);
  }

  /*
   * The menu is mounted here and now, whoever asked for it, and the entry is
   * settled afterwards. Waiting for a popstate to do the mounting made the
   * button only as reliable as the back() underneath it — and a browser that
   * declines to go back, as an installed PWA sitting on its first entry does,
   * leaves the button looking dead with nothing to show for the press.
   */
  goMenu(): void {
    this.onMenu = true;
    this.statsReturn = null;
    this.mount(buildMenu(this));
    this.syncGuard();
  }

  goStats(level: Level): void {
    // Read before mounting, which is what takes the play screen down. Set
    // before building, which is what reads it to label its way out.
    const from = this.play?.puzzleId ?? null;
    this.onMenu = false;
    this.armBack();
    this.statsReturn = from;
    this.mount(buildStats(this, level));
  }

  /**
   * Opened from a puzzle, Stats hands that puzzle back — rebuilt from its save,
   * which the screen wrote on its way out, so the board is where you left it
   * and the clock picks up where it stopped. Opened from the menu, back is the
   * menu.
   */
  leaveStats(): void {
    const id = this.statsReturn;
    this.statsReturn = null;
    if (id === null) {
      this.goMenu();
      return;
    }
    this.playPuzzle(id);
  }

  openHelp(): void {
    openHelp();
  }

  openSettings(): void {
    openSettings(this);
  }

  private poolSize(level: Level, source: Source): number {
    return source === 'classic' ? (this.packCounts?.[level] ?? 0) : this.newPoolSize;
  }

  playRandom(level: Level, source: Source): void {
    const pool = unplayedNumbers(this.history, level, source, this.poolSize(level, source));
    if (pool.length === 0) {
      toast('Every puzzle in this pool has been played — release some in Stats');
      return;
    }
    const number = pool[Math.floor(Math.random() * pool.length)];
    this.playPuzzle({ level, number, source });
  }

  playPuzzle(id: PuzzleId): void {
    // Every puzzle keeps its own save, so opening one you have played before
    // carries on from where you left it. Restart is there for starting over.
    const saved = loadSaveFor(id);
    if (saved) {
      this.resume(saved);
      return;
    }

    const close = openOverlay(
      () =>
        el(
          'div',
          { class: 'panel won' },
          el('div', { class: 'spinner' }),
          el('h2', {}, `Loading puzzle ${formatPuzzleId(id)}`),
          el(
            'p',
            { class: 'summary' },
            id.source === 'classic' ? 'One moment.' : 'Generating and proving it has one solution.',
          ),
        ),
      { dismissable: false },
    );

    void getPuzzle(id)
      .then((puzzle) => {
        close();
        this.startGame(new Game(id, puzzle));
        const pool = unplayedNumbers(
          this.history,
          id.level,
          id.source,
          this.poolSize(id.level, id.source),
        ).filter((n) => n !== id.number);
        if (pool.length > 0) prefetch({ level: id.level, number: pool[0], source: id.source });
      })
      .catch((err: unknown) => {
        close();
        toast(err instanceof Error ? err.message : 'Could not load that puzzle');
      });
  }

  private resume(saved: SavedGame): void {
    const game = new Game(saved.id, saved.puzzle, {
      values: saved.values,
      pencils: saved.pencils,
    });
    game.elapsedMs = saved.elapsedMs;
    game.hints = saved.hints;
    game.checks = saved.checks;
    game.importHistory({ past: saved.past, future: saved.future });
    this.startGame(game);
  }

  private startGame(game: Game): void {
    this.onMenu = false;
    this.statsReturn = null;
    this.armBack();
    this.play?.destroy();
    clear(this.root);
    const screen = new PlayScreen(this, game);
    this.play = screen;
    this.root.append(screen.root);
    openFirstGameTutorial();
  }
}

const host = document.querySelector<HTMLElement>('#app');
if (host) new App(host);

/*
 * Turned down for this sitting. A new version is not urgent — it is waiting in
 * the service worker either way and comes up on the next launch — and reloading
 * mid-puzzle to collect it is the app taking the grid off you over something
 * that could have waited.
 */
let updateTurnedDown = false;

registerServiceWorker(() => {
  if (updateTurnedDown || document.querySelector('.update-notice')) return;
  const later = el('button', { class: 'btn' }, 'Later');
  const reload = el('button', { class: 'btn primary' }, 'Reload');
  const notice = el(
    'div',
    { class: 'update-notice', role: 'status' },
    el('span', {}, 'A new version is ready.'),
    later,
    reload,
  );
  later.addEventListener('click', () => {
    updateTurnedDown = true;
    notice.remove();
  });
  reload.addEventListener('click', () => location.reload());
  document.body.append(notice);
});
