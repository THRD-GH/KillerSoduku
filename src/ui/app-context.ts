import type { Level, PuzzleId, Source } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  /** Puzzles per level in the imported packs, or null when none are installed. */
  packCounts: Record<number, number> | null;
  randomPoolSize: number;
  applyTheme(): void;
  /** Repaint the board in place, e.g. after a highlighting setting changes. */
  refreshBoard(): void;
  goMenu(): void;
  goStats(level: Level): void;
  openHelp(): void;
  openSettings(): void;
  playPuzzle(id: PuzzleId): void;
  playRandom(level: Level, source: Source): void;
}
