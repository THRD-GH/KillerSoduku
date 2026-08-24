import type { Level, PuzzleId, Source } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** Puzzles per level in the imported packs, or null when none are installed. */
  packCounts: Record<number, number> | null;
  /** How many numbered New grids each belt offers — follows the setting. */
  readonly newPoolSize: number;
  /** Rebuild the menu if it is on screen, after something it shows changes. */
  refreshMenu(): void;
  applyTheme(): void;
  /** Re-apply the side the keypad sits on. */
  applyKeypadSide(): void;
  /** Put the chosen background behind the page, after the setting changes. */
  applyBackground(): void;
  /** Take or drop the screen wake lock, after the setting changes. */
  applyWakeLock(): void;
  /** Re-read storage and return to the menu, after an import replaces it. */
  reload(): void;
  /** Repaint the board in place, e.g. after a highlighting setting changes. */
  refreshBoard(): void;
  goMenu(): void;
  goStats(level: Level): void;
  /** The puzzle Stats was opened from, if it was opened from one. */
  statsReturn: PuzzleId | null;
  /** Leave Stats: back to that puzzle if there is one, otherwise the menu. */
  leaveStats(): void;
  openHelp(): void;
  openSettings(): void;
  playPuzzle(id: PuzzleId): void;
  playRandom(level: Level, source: Source): void;
}
