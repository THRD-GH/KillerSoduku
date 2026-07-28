import './style.css';
import type { Level, PuzzleId, Source } from './core/types.ts';
import { formatPuzzleId } from './core/types.ts';
import { getPuzzle, prefetch } from './game/generate.ts';
import { packCounts } from './game/packs.ts';
import { registerServiceWorker, setThemeColour } from './game/pwa.ts';
import { Game } from './game/state.ts';
import {
  RANDOM_POOL_SIZE,
  clearSave,
  loadHistory,
  loadSave,
  loadSettings,
  unplayedNumbers,
} from './game/storage.ts';
import type { History, Settings } from './game/storage.ts';
import { clear, el } from './ui/dom.ts';
import { buildMenu } from './ui/menu.ts';
import { openHelp } from './ui/help.ts';
import { openOverlay, toast } from './ui/overlay.ts';
import { PlayScreen } from './ui/play.ts';
import { openSettings } from './ui/settings.ts';
import { buildStats } from './ui/stats.ts';
import type { AppContext } from './ui/app-context.ts';

class App implements AppContext {
  settings: Settings = loadSettings();
  history: History = loadHistory();
  packCounts: Record<number, number> | null = null;
  readonly randomPoolSize = RANDOM_POOL_SIZE;

  private root: HTMLElement;
  private play: PlayScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.applyTheme();

    document.addEventListener('keydown', (e) => this.play?.handleKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.play?.pause();
    });

    // Packs are optional; the menu renders either way and redraws once known.
    void packCounts().then((counts) => {
      this.packCounts = counts;
      if (!this.play) this.goMenu();
    });
    this.goMenu();
  }

  applyTheme(): void {
    const night = this.settings.nightColors;
    document.documentElement.dataset.theme = night ? 'night' : 'day';
    setThemeColour(night ? '#0a0d10' : '#dfe4e9');
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

  goMenu(): void {
    const saved = loadSave();
    const resume =
      saved === null
        ? undefined
        : {
            label: `Resume ${formatPuzzleId(saved.id)}`,
            run: () => {
              const game = new Game(saved.id, saved.puzzle, {
                values: saved.values,
                pencils: saved.pencils,
              });
              game.elapsedMs = saved.elapsedMs;
              game.hints = saved.hints;
              game.checks = saved.checks;
              this.startGame(game);
            },
          };
    this.mount(buildMenu(this, resume));
  }

  goStats(level: Level): void {
    this.mount(buildStats(this, level));
  }

  openHelp(): void {
    openHelp();
  }

  openSettings(): void {
    openSettings(this);
  }

  private poolSize(level: Level, source: Source): number {
    return source === 'fixed' ? (this.packCounts?.[level] ?? 0) : this.randomPoolSize;
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
            id.source === 'fixed' ? 'One moment.' : 'Generating and proving it has one solution.',
          ),
        ),
      { dismissable: false },
    );

    void getPuzzle(id)
      .then((puzzle) => {
        close();
        clearSave();
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

  private startGame(game: Game): void {
    this.play?.destroy();
    clear(this.root);
    const screen = new PlayScreen(this, game);
    this.play = screen;
    this.root.append(screen.root);
  }
}

const host = document.querySelector<HTMLElement>('#app');
if (host) new App(host);

registerServiceWorker();
