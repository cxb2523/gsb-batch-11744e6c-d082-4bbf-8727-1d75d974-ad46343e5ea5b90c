import type { UICopyKey } from './ui-copy';
import type { GameTextKey } from './game-copy';

/** Locale packs contain only text. Models, IDs, gameplay and saves stay canonical.
 * Chapter story text for these languages lives in src/chapter/script-locales.ts. */
export interface LocaleCopy {
  ui: Record<UICopyKey, string>;
  game: Record<GameTextKey, string>;
}
