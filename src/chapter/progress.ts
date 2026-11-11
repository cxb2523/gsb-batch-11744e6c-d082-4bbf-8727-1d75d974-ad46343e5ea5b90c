import { CONNECTION_IDS, type ConnectionId } from './data';
import type { ThreadSave } from '../contracts';
import type { StorageLike } from '../journey';

export const PROGRESS_SAVE_KEY = 'unspool:chapter1:v1';

export interface ChapterSave {
  version: 1;
  completed: ConnectionId[];
  /** One-shot story beats already seen (dialogue keys, finale...). */
  flags: string[];
  threads: ThreadSave | null;
}

const isConnection = (value: unknown): value is ConnectionId => CONNECTION_IDS.includes(value as ConnectionId);

export function parseChapterSave(raw: string | null): ChapterSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Array.isArray(value.completed) || !Array.isArray(value.flags)) return null;
    const completed = [...new Set(value.completed.filter(isConnection))] as ConnectionId[];
    const flags = value.flags.filter((flag: unknown) => typeof flag === 'string');
    let threads: ThreadSave | null = null;
    if (value.threads?.version === 1 && Array.isArray(value.threads.threads)) {
      threads = {
        version: 1,
        threads: value.threads.threads.filter((thread: { id: unknown; points: unknown }) => isConnection(thread?.id) && completed.includes(thread.id as ConnectionId)
          && Array.isArray(thread.points) && thread.points.length % 3 === 0 && thread.points.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))),
      };
    }
    return { version: 1, completed, flags, threads };
  } catch { return null; }
}

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class ChapterProgress {
  private state: ChapterSave = { version: 1, completed: [], flags: [], threads: null };
  persistenceAvailable: boolean;
  invalidSave = false;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.persistenceAvailable = storage !== null;
    try {
      const raw = storage?.getItem(PROGRESS_SAVE_KEY) ?? null;
      const parsed = parseChapterSave(raw);
      if (raw && !parsed) this.invalidSave = true;
      if (parsed) this.state = parsed;
    } catch { this.persistenceAvailable = false; }
  }
  get completed(): ReadonlySet<ConnectionId> { return new Set(this.state.completed); }
  get threads(): ThreadSave | null { return this.state.threads; }
  get hasProgress(): boolean { return this.state.completed.length > 0; }
  has(flag: string): boolean { return this.state.flags.includes(flag); }
  flag(flag: string): void { if (!this.has(flag)) { this.state.flags.push(flag); this.persist(); } }
  complete(id: ConnectionId, threads: ThreadSave): void {
    if (!this.state.completed.includes(id)) this.state.completed.push(id);
    this.state.threads = threads;
    this.persist();
  }
  restart(): void {
    this.state = { version: 1, completed: [], flags: [], threads: null };
    try { this.storage?.removeItem(PROGRESS_SAVE_KEY); } catch { this.persistenceAvailable = false; }
  }
  private persist(): void {
    if (!this.storage) return;
    try { this.storage.setItem(PROGRESS_SAVE_KEY, JSON.stringify(this.state)); this.persistenceAvailable = true; }
    catch { this.persistenceAvailable = false; }
  }
}
