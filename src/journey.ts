export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export const JOURNEY_SAVE_KEY = 'unspool:pose:v1';
export interface JourneyPose { position: [number, number, number]; forward: [number, number, number] }
export interface JourneySave { version: 2; introCompleted: boolean; pose: JourneyPose | null }

const vector = (value: unknown): value is [number, number, number] => Array.isArray(value)
  && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n));

export function parseJourneySave(raw: string | null): JourneySave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const pose = value.version === 1 ? value : value.pose;
    if (value.version !== 1 && (value.version !== 2 || typeof value.introCompleted !== 'boolean')) return null;
    if (pose !== null && (!pose || !vector(pose.position) || !vector(pose.forward)
      || !Number.isFinite(Math.hypot(...pose.position))
      || Math.hypot(...pose.forward) < .1 || Math.hypot(...pose.forward) > 10)) return null;
    return { version: 2, introCompleted: value.version === 1 || value.introCompleted,
      pose: pose ? { position: [pose.position[0],pose.position[1],pose.position[2]],
        forward: [pose.forward[0],pose.forward[1],pose.forward[2]] } : null };
  } catch { return null; }
}

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Exploration and onboarding are independent of confirmed delivery steps.
 * Scene collision validation remains the caller's responsibility on restore. */
export class JourneyPersistence {
  private state: JourneySave = { version: 2, introCompleted: false, pose: null };
  persistenceAvailable: boolean;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.persistenceAvailable = storage !== null;
    try { this.state = parseJourneySave(storage?.getItem(JOURNEY_SAVE_KEY) ?? null) ?? this.state; }
    catch { this.persistenceAvailable = false; }
  }
  get introCompleted(): boolean { return this.state.introCompleted; }
  get hasProgress(): boolean { return this.introCompleted || this.state.pose !== null; }
  get pose(): JourneyPose | null {
    const pose = this.state.pose;
    return pose ? { position: [...pose.position], forward: [...pose.forward] } : null;
  }
  completeIntro(): void { this.state.introCompleted = true;this.persist(); }
  savePose(position: JourneyPose['position'], forward: JourneyPose['forward']): void {
    this.state.pose = { position: [...position], forward: [...forward] };this.persist();
  }
  restart(): void {
    this.state = { version: 2, introCompleted: false, pose: null };
    try { this.storage?.removeItem(JOURNEY_SAVE_KEY);this.persistenceAvailable = this.storage !== null; }
    catch { this.persistenceAvailable = false; }
  }
  private persist(): void {
    if (!this.storage) return;
    try { this.storage.setItem(JOURNEY_SAVE_KEY, JSON.stringify(this.state));this.persistenceAvailable = true; }
    catch { this.persistenceAvailable = false; }
  }
}
