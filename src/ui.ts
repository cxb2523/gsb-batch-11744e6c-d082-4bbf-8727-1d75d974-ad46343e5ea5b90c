import { CONNECTIONS, THREAD_COLORS } from './chapter/data';
import type { StoryKey } from './chapter/script';
import { storyText } from './chapter/text';
import { getLanguage, LANGUAGE_OPTIONS, languageTag, setLanguage, subscribeLanguage, type Language } from './i18n';
import { resolveCopy, uiCopy, type CopyResolver, type UICopyKey } from './ui-copy';
import { composePostcard, decodePhoto, savePostcard, type PostcardMeta } from './ui/postcard';
import { interfaceMarkup } from './ui/template';

export type { PostcardMeta } from './ui/postcard';
export { snapshotCanvas } from './ui/postcard';

export interface GameInput {
  x: number;
  y: number;
  sprint: boolean;
  /** One-frame pulse. The game loop consumes this and resets it to false. */
  jump: boolean;
}

export type JournalStatus = 'locked' | 'available' | 'done';
export interface JournalEntry { id: string; district: string; title: string; color: string; status: JournalStatus }
export interface PromptState { subject: string; action: string }
export interface SpoolState { color: string; remaining: number; taut: boolean }
export interface ChapterEndHandlers { onPostcard(): void; onContinue(): void; onRestart(): void }

type ModalName = 'help' | 'journal' | 'settings' | 'reset' | 'credits' | 'chapter' | 'postcard';
/** Topmost first; Escape and Tab trapping walk this list. */
const MODAL_ORDER: ModalName[] = ['credits', 'reset', 'postcard', 'chapter', 'settings', 'journal', 'help'];

const PREFERENCE_KEY = 'unspool:ui:v1';
const SHORT_LABELS: Record<Language, string> = { zh: '简体', 'zh-Hant': '繁體', en: 'EN', ja: '日本語', ko: '한국어' };
const THREAD_KINDS = Object.keys(THREAD_COLORS) as (keyof typeof THREAD_COLORS)[];

interface Preferences { sound: boolean; guides: boolean }
function loadPreferences(): Preferences {
  const defaults = { sound: true, guides: true };
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? 'null');
    if (value && typeof value === 'object') return { sound: value.sound !== false, guides: value.guides !== false };
  } catch { /* storage may be blocked; defaults still work */ }
  return defaults;
}
function savePreferences(preferences: Preferences): void {
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* session-only */ }
}

export class GameUI {
  readonly input: GameInput = { x: 0, y: 0, sprint: false, jump: false };
  onStart: () => void = () => {};
  onInteract: () => void = () => {};
  onRestart: () => void = () => {};
  onSound: (enabled: boolean) => void = () => {};
  /** R key and the touch reel button; fired only while input is not blocked. */
  onReel: () => void = () => {};
  onDialogueClose: (canceled: boolean) => void = () => {};
  onDialogueLine: (line: string, index: number) => void = () => {};

  private readonly layer: HTMLDivElement;
  private readonly modals: Record<ModalName, HTMLElement>;
  private readonly intro: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly loadText: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly startLabel: HTMLElement;
  private readonly objectiveText: HTMLElement;
  private readonly objectiveDetail: HTMLElement;
  private readonly objectiveIcon: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly compassDial: HTMLElement;
  private readonly compassLabel: HTMLElement;
  private readonly interaction: HTMLElement;
  private readonly promptSubject: HTMLElement;
  private readonly promptAction: HTMLElement;
  private readonly spoolMeter: HTMLElement;
  private readonly ringFill: SVGElement;
  private readonly spoolText: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly dialogueName: HTMLElement;
  private readonly dialogueText: HTMLElement;
  private readonly dialogueStep: HTMLElement;
  private readonly dialogueAction: HTMLButtonElement;
  private readonly joystick: HTMLElement;
  private readonly joystickKnob: HTMLElement;
  private readonly touchInteract: HTMLButtonElement;
  private readonly touchReel: HTMLButtonElement;
  private readonly postcardButton: HTMLButtonElement;
  private readonly error: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly loadingProgress: HTMLElement;
  private readonly threadFill: HTMLElement;
  private readonly threadBead: HTMLElement;
  private readonly savedProgress: HTMLElement;
  private readonly newJourneyButton: HTMLButtonElement;
  private readonly journalList: HTMLElement;
  private readonly journalCount: HTMLElement;
  private readonly journalNote: HTMLElement;
  private readonly soundSwitch: HTMLButtonElement;
  private readonly guidesSwitch: HTMLButtonElement;
  private readonly postcardPreview: HTMLElement;
  private readonly postcardSave: HTMLButtonElement;
  private readonly keys = new Set<string>();
  private preferences = loadPreferences();
  private started = false;
  private ready = false;
  private currentDialogue: { lines: string[]; index: number; action: string; onFinish: () => void; onCancel: () => void; characters: string[]; lineStarted: number; revealed: boolean } | null = null;
  private transitioning = false;
  private hasSavedProgress = false;
  private savedCompletedCount = 0;
  private noticeUntil = 0;
  private captionUntil = 0;
  private fatalError = false;
  private persistenceAvailable = true;
  private loadingCopy: CopyResolver = () => uiCopy('waking');
  private noticeCopy: CopyResolver = '';
  private captionCopy: CopyResolver = '';
  private errorCopy: CopyResolver = '';
  private journalEntries: JournalEntry[] = [];
  private prompt: PromptState | null = null;
  private promptKey = '';
  private spoolKey = '';
  private spoolState: SpoolState | null = null;
  private destinationKey = '';
  private chapterHandlers: ChapterEndHandlers | null = null;
  private resetFromChapter = false;
  private returnFocus: HTMLElement | null = null;
  private postcardCanvas: HTMLCanvasElement | null = null;
  private postcardToken = 0;
  private postcardFromChapter = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private joystickPointer: number | null = null;
  private joystickInput = { x: 0, y: 0 };

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'game-ui';
    for (const kind of THREAD_KINDS) this.layer.style.setProperty(`--${kind}`, THREAD_COLORS[kind]);
    this.layer.innerHTML = interfaceMarkup();
    root.append(this.layer);
    const element = <T extends HTMLElement | SVGElement>(selector: string): T => this.layer.querySelector<T>(selector)!;
    this.modals = {
      help: element('.help-overlay'), journal: element('.journal-overlay'), settings: element('.settings-overlay'), reset: element('.reset-overlay'),
      credits: element('.credits-overlay'), chapter: element('.chapter-overlay'), postcard: element('.postcard-overlay'),
    };
    this.intro = element('.intro-screen');
    this.hud = element('.hud');
    this.loadText = element('.loading-copy');
    this.startButton = element('.begin-button');
    this.startLabel = element('.begin-label');
    this.objectiveText = element('.objective-title');
    this.objectiveDetail = element('.objective-detail');
    this.objectiveIcon = element('.objective-icon');
    this.compass = element('.compass');
    this.compassDial = element('.compass-dial');
    this.compassLabel = element('.compass-label');
    this.interaction = element('.interaction-prompt');
    this.promptSubject = element('.prompt-subject');
    this.promptAction = element('.prompt-action');
    this.spoolMeter = element('.spool-meter');
    this.ringFill = element('.ring-fill');
    this.spoolText = element('.spool-text');
    this.dialogue = element('.dialogue-overlay');
    this.dialogueName = element('.dialogue-name');
    this.dialogueText = element('.dialogue-text');
    this.dialogueStep = element('.dialogue-step');
    this.dialogueAction = element('.dialogue-action');
    this.joystick = element('.joystick');
    this.joystickKnob = element('.joystick-knob');
    this.touchInteract = element('.touch-interact');
    this.touchReel = element('.touch-reel');
    this.postcardButton = element('.postcard-button');
    this.error = element('.error-paper');
    this.notice = element('.notice-paper');
    this.caption = element('.caption');
    this.loadingProgress = element('.thread-progress');
    this.threadFill = element('.thread-fill');
    this.threadBead = element('.thread-bead');
    this.savedProgress = element('.saved-progress');
    this.newJourneyButton = element('.new-journey-button');
    this.journalList = element('.journal-list');
    this.journalCount = element('.journal-count');
    this.journalNote = element('.journal-note');
    this.soundSwitch = element('.sound-switch');
    this.guidesSwitch = element('.guides-switch');
    this.postcardPreview = element('.postcard-preview');
    this.postcardSave = element('.postcard-save');

    this.buildLanguagePickers();
    this.refreshLanguage();
    subscribeLanguage(() => this.refreshLanguage());
    this.wireControls();
    this.wireKeyboard();
    this.wireJoystick();
  }

  get dialogueOpen(): boolean { return this.currentDialogue !== null; }
  get dialogueSpeaking(): boolean { return this.currentDialogue !== null && !this.currentDialogue.revealed; }
  get guideEnabled(): boolean { return this.preferences.guides; }
  get soundEnabled(): boolean { return this.preferences.sound; }
  private get modalOpen(): boolean { return MODAL_ORDER.some(name => !this.modals[name].hidden); }

  get blocked(): boolean {
    return this.fatalError || !this.started || this.transitioning || this.dialogueOpen || this.modalOpen;
  }

  /* ---------------------------------------------------------------- title */

  setLoading(message: CopyResolver, ready = false): void {
    this.loadingCopy = message;
    this.ready = ready;
    this.loadText.textContent = resolveCopy(message);
    this.startButton.disabled = !ready;
    this.refreshStartLabel();
    this.newJourneyButton.disabled = !ready;
    this.intro.classList.toggle('ready', ready);
  }

  setLoadingProgress(percent: number | null, detail?: CopyResolver): void {
    if (detail !== undefined) {
      this.loadingCopy = detail;
      this.loadText.textContent = resolveCopy(detail);
    }
    this.loadingProgress.classList.toggle('indeterminate', percent === null);
    if (percent === null) { this.loadingProgress.removeAttribute('aria-valuenow'); return; }
    const value = Math.min(100, Math.max(0, Math.round(percent)));
    this.loadingProgress.setAttribute('aria-valuenow', String(value));
    this.loadingProgress.style.setProperty('--progress', `${value}%`);
  }

  setSavedProgress(hasProgress: boolean, completedCount = 0): void {
    this.hasSavedProgress = hasProgress;
    this.savedCompletedCount = completedCount;
    this.savedProgress.hidden = !hasProgress;
    this.savedProgress.textContent = hasProgress
      ? `${uiCopy(this.persistenceAvailable ? 'saved' : 'pageProgress')} · ${uiCopy('threadsConnected', { count: completedCount, total: CONNECTIONS.length })}` : '';
    this.newJourneyButton.hidden = !hasProgress;
    this.refreshStartLabel();
  }

  setPersistenceStatus(available: boolean): void {
    this.persistenceAvailable = available;
    this.journalNote.textContent = uiCopy(available ? 'journalNote' : 'journalUnavailable');
    this.setSavedProgress(this.hasSavedProgress, this.savedCompletedCount);
  }

  setStarted(): void {
    this.started = true;
    this.intro.hidden = true;
    this.hud.hidden = false;
    for (const name of MODAL_ORDER) this.modals[name].hidden = true;
    this.layer.classList.add('is-started');
    this.clearInput();
    this.startButton.blur();
    // Re-announce the remembered preference once the game owns a GameSound.
    this.onSound(this.preferences.sound);
  }

  setTransition(active: boolean): void {
    this.transitioning = active;
    this.layer.classList.toggle('is-transition', active);
    if (active) this.clearInput();
    this.syncPrompt();
  }

  /* ------------------------------------------------------------------ HUD */

  setObjective(text: string, detail = ''): void {
    if (this.objectiveText.textContent !== text) this.objectiveText.textContent = text;
    if (this.objectiveDetail.textContent !== detail) this.objectiveDetail.textContent = detail;
    this.objectiveDetail.hidden = !detail;
  }

  setDestination(name: string | null, distance?: number, bearing = 0): void {
    const show = !!name && this.preferences.guides;
    this.compass.hidden = !show;
    if (!show) { this.destinationKey = ''; return; }
    const label = `${name}${distance === undefined ? '' : ` · ${Math.max(0, Math.round(distance))} m`}`;
    if (label !== this.destinationKey) { this.destinationKey = label; this.compassLabel.textContent = label; }
    this.compassDial.style.transform = `rotate(${bearing}rad)`;
  }

  /** Interaction prompt: the thing you are near, and what the key will do. */
  setPrompt(prompt: PromptState | null): void {
    const key = prompt ? `${prompt.subject}\u0000${prompt.action}` : '';
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt = prompt;
      this.promptSubject.textContent = prompt?.subject ?? '';
      this.promptAction.textContent = prompt?.action ?? '';
      this.promptAction.hidden = !prompt?.action;
      this.touchInteract.setAttribute('aria-label', prompt ? `${prompt.action} ${prompt.subject}`.trim() : uiCopy('touchInteract'));
    }
    this.syncPrompt();
  }

  /** Compatibility wrapper for the earlier single-label API. */
  setInteraction(name: string | null): void {
    if (!name) { this.setPrompt(null); return; }
    const [subject, ...rest] = name.split(' · ');
    this.setPrompt({ subject, action: rest.join(' · ') });
  }

  /** Spool meter while carrying a thread; pass null when nothing is held. */
  setSpool(state: SpoolState | null): void {
    this.spoolState = state;
    this.layer.classList.toggle('is-carrying', !!state);
    this.spoolMeter.hidden = !state;
    this.touchReel.hidden = !state;
    if (!state) { this.spoolKey = ''; return; }
    const remaining = Math.min(1, Math.max(0, state.remaining));
    const key = `${state.color}|${Math.round(remaining * 200)}|${state.taut}`;
    if (key === this.spoolKey) return;
    this.spoolKey = key;
    this.spoolMeter.style.setProperty('--thread', state.color);
    this.layer.style.setProperty('--carry', state.color);
    this.ringFill.style.strokeDashoffset = String(100 - remaining * 100);
    this.spoolMeter.classList.toggle('taut', state.taut);
    this.spoolMeter.classList.toggle('low', remaining < .2 && !state.taut);
    this.spoolText.textContent = uiCopy(state.taut ? 'reelTaut' : 'reelHint');
    this.spoolMeter.setAttribute('aria-label', uiCopy('spoolLeft', { percent: Math.round(remaining * 100) }));
    this.objectiveIcon.style.setProperty('--thread', state.color);
  }

  showNotice(message: CopyResolver, duration = 4): void {
    this.noticeCopy = message;
    this.notice.textContent = resolveCopy(message);
    this.notice.hidden = false;
    this.notice.classList.remove('shown'); void this.notice.offsetWidth; this.notice.classList.add('shown');
    this.noticeUntil = performance.now() + duration * 1000;
  }

  /** Large cinematic line over a dimmed view; HUD cards step back while it shows. */
  showCaption(text: CopyResolver, seconds: number): void {
    this.captionCopy = text;
    this.caption.textContent = resolveCopy(text);
    this.caption.hidden = false;
    this.caption.classList.remove('shown'); void this.caption.offsetWidth; this.caption.classList.add('shown');
    this.captionUntil = performance.now() + seconds * 1000;
    this.layer.classList.add('is-captioning');
  }

  showError(message: CopyResolver, onRetry?: () => void): void {
    this.errorCopy = message;
    this.fatalError = true;
    this.closeDialogue();
    this.clearInput();
    for (const name of MODAL_ORDER) this.modals[name].hidden = true;
    this.interaction.hidden = true;
    this.touchInteract.disabled = true;
    this.ready = false;
    this.startButton.disabled = true;
    this.newJourneyButton.disabled = true;
    this.error.replaceChildren();
    const text = document.createElement('p');
    text.textContent = resolveCopy(message);
    this.error.append(text);
    if (onRetry) {
      const retry = document.createElement('button');
      retry.className = 'paper-button primary retry-button';
      retry.type = 'button';
      retry.textContent = uiCopy('retry');
      retry.addEventListener('click', () => { retry.disabled = true; onRetry(); });
      this.error.append(retry);
    }
    this.error.hidden = false;
    this.error.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    this.loadingCopy = () => uiCopy('notReady');
    this.loadText.textContent = resolveCopy(this.loadingCopy);
  }

  /* ------------------------------------------------------------- dialogue */

  showDialogue(name: string, lines: string[], actionLabel: string, onFinish: () => void, onCancel: () => void = () => {}): void {
    if (this.currentDialogue) this.closeDialogue();
    this.currentDialogue = { lines: lines.length ? [...lines] : ['…'], index: 0, action: actionLabel, onFinish, onCancel, characters: [], lineStarted: 0, revealed: false };
    this.dialogueName.textContent = name;
    this.dialogue.hidden = false;
    this.layer.classList.add('has-dialogue');
    this.syncPrompt();
    this.clearInput();
    this.renderDialogue();
    this.dialogueAction.focus({ preventScroll: true });
  }

  /** Change only the visible translation, retaining the conversation and handoff callbacks. */
  refreshDialogue(name: string, lines: string[], actionLabel: string): void {
    const dialogue = this.currentDialogue;
    if (!dialogue) return;
    dialogue.lines = lines.length ? [...lines] : ['…'];
    dialogue.index = Math.min(dialogue.index, dialogue.lines.length - 1);
    dialogue.action = actionLabel;
    dialogue.characters = Array.from(dialogue.lines[dialogue.index]);
    dialogue.revealed = true;
    this.dialogueName.textContent = name;
    this.dialogueText.textContent = dialogue.lines[dialogue.index];
    this.dialogueStep.textContent = `${dialogue.index + 1} / ${dialogue.lines.length}`;
    this.dialogueAction.textContent = dialogue.index === dialogue.lines.length - 1 ? actionLabel : uiCopy('continue');
  }

  closeDialogue(canceled = true): void {
    const current = this.currentDialogue;
    this.currentDialogue = null;
    this.dialogue.hidden = true;
    this.layer.classList.remove('has-dialogue');
    this.clearInput();
    this.dialogueAction.blur();
    if (current) {
      if (canceled) current.onCancel();
      this.onDialogueClose(canceled);
    }
  }

  /* ------------------------------------------------- journal and finale */

  /** Connections grouped by district, in the order given. */
  setJournal(entries: JournalEntry[]): void {
    this.journalEntries = entries;
    this.renderJournal();
  }

  showChapterEnd(handlers: ChapterEndHandlers): void {
    this.allowPostcards(handlers);
    this.openModal('chapter');
  }

  /** Enable the corner camera button (a finished chapter restored from a save, or after the card closes). */
  allowPostcards(handlers: ChapterEndHandlers): void {
    this.chapterHandlers = handlers;
    this.postcardButton.hidden = false;
  }

  /** Show a postcard made from a captured game frame (a canvas copy or a Blob). */
  async showPostcard(image: HTMLCanvasElement | Blob, meta: PostcardMeta): Promise<void> {
    const token = ++this.postcardToken;
    if (!this.modals.chapter.hidden) this.postcardFromChapter = true;
    this.modals.chapter.hidden = true;
    this.postcardCanvas = null;
    this.postcardSave.disabled = true;
    const wait = document.createElement('p');
    wait.className = 'postcard-wait';
    wait.textContent = uiCopy('postcardPreparing');
    this.postcardPreview.replaceChildren(wait);
    this.openModal('postcard');
    try {
      const photo = await decodePhoto(image);
      if (token !== this.postcardToken) return;
      const card = composePostcard(photo, meta);
      card.className = 'postcard-canvas';
      card.setAttribute('role', 'img');
      card.setAttribute('aria-label', `${meta.title} · ${meta.date}`);
      this.postcardCanvas = card;
      this.postcardPreview.replaceChildren(card);
      this.postcardSave.disabled = false;
      this.postcardSave.focus({ preventScroll: true });
    } catch (error) {
      console.error(error);
      if (token === this.postcardToken) { this.closeModal('postcard'); this.showNotice(() => uiCopy('postcardFailed'), 4); }
    }
  }

  update(_time?: number): void {
    this.updateDialogueText();
    const now = performance.now();
    if (!this.notice.hidden && now >= this.noticeUntil) this.notice.hidden = true;
    if (!this.caption.hidden && now >= this.captionUntil) {
      this.caption.hidden = true;
      this.layer.classList.remove('is-captioning');
    }
    this.syncPrompt();
    if (this.blocked) {
      this.input.x = 0;
      this.input.y = 0;
      this.input.sprint = false;
      this.input.jump = false;
    }
  }

  /* ---------------------------------------------------------------- wiring */

  private wireControls(): void {
    const on = (selector: string, handler: () => void) => this.layer.querySelectorAll(selector).forEach(node => node.addEventListener('click', handler));
    this.startButton.addEventListener('click', () => { if (this.ready) this.onStart(); });
    this.dialogueAction.addEventListener('click', () => this.advanceDialogue());
    on('.dialogue-close', () => this.closeDialogue());
    on('.interact-chip', () => { if (!this.blocked) this.onInteract(); });
    this.touchInteract.addEventListener('click', () => { if (!this.blocked) this.onInteract(); });
    this.touchReel.addEventListener('click', () => { if (!this.blocked) this.onReel(); });
    this.layer.querySelector('.touch-jump')!.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (!this.blocked) this.input.jump = true;
    });
    on('.help-button', () => { if (!this.blocked) this.openModal('help'); });
    on('.journal-button', () => { if (!this.blocked) this.openModal('journal'); });
    on('.settings-button', () => { if (!this.blocked) this.openModal('settings'); });
    on('.help-sheet .close-button, .help-done', () => this.closeModal('help'));
    on('.journal-close', () => this.closeModal('journal'));
    on('.settings-close', () => this.closeModal('settings'));
    on('.credits-open', () => this.openModal('credits'));
    on('.credits-close', () => this.closeModal('credits'));
    on('.reset-open, .new-journey-button', () => { if (this.ready || this.started) this.openModal('reset'); });
    on('.reset-cancel', () => this.closeModal('reset'));
    on('.reset-confirm', () => {
      const fromChapter = this.resetFromChapter;
      this.closeModal('reset');
      for (const name of MODAL_ORDER) this.modals[name].hidden = true;
      this.closeDialogue();
      this.clearInput();
      this.setSavedProgress(false, 0);
      if (fromChapter && this.chapterHandlers) this.chapterHandlers.onRestart();
      else this.onRestart();
    });
    on('.chapter-postcard', () => this.requestPostcard());
    on('.chapter-continue', () => this.finishChapter());
    on('.chapter-restart', () => { this.resetFromChapter = true; this.openModal('reset'); });
    on('.postcard-button', () => { if (!this.blocked) this.requestPostcard(); });
    on('.postcard-x', () => this.closePostcard(false));
    on('.postcard-wander', () => this.closePostcard(true));
    this.postcardSave.addEventListener('click', () => { void this.savePostcardFile(); });
    this.soundSwitch.addEventListener('click', () => {
      this.preferences.sound = !this.preferences.sound;
      savePreferences(this.preferences);
      this.refreshSwitches();
      this.onSound(this.preferences.sound);
    });
    this.guidesSwitch.addEventListener('click', () => {
      this.preferences.guides = !this.preferences.guides;
      savePreferences(this.preferences);
      this.refreshSwitches();
      if (!this.preferences.guides) this.compass.hidden = true;
    });
  }

  private wireKeyboard(): void {
    window.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => { this.keys.delete(event.code); this.refreshInput(); });
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });
  }

  private wireJoystick(): void {
    this.joystick.addEventListener('pointerdown', event => {
      if (this.blocked || this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      try { this.joystick.setPointerCapture(event.pointerId); } catch { /* the pointer ended already */ }
      this.moveJoystick(event);
    });
    this.joystick.addEventListener('pointermove', event => { if (this.joystickPointer === event.pointerId) this.moveJoystick(event); });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.joystickInput = { x: 0, y: 0 };
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
      this.refreshInput();
    };
    this.joystick.addEventListener('pointerup', release);
    this.joystick.addEventListener('pointercancel', release);
    this.joystick.addEventListener('lostpointercapture', release);
  }

  private buildLanguagePickers(): void {
    this.layer.querySelectorAll<HTMLElement>('.language-picker').forEach(picker => {
      const compact = picker.classList.contains('title-language');
      for (const option of LANGUAGE_OPTIONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'language-pill';
        button.dataset.language = option.code;
        button.lang = option.tag;
        button.textContent = compact ? SHORT_LABELS[option.code] : option.label;
        button.title = option.label;
        button.addEventListener('click', () => setLanguage(option.code));
        picker.append(button);
      }
    });
  }

  /* ----------------------------------------------------------------- copy */

  private refreshStartLabel(): void {
    this.startLabel.textContent = uiCopy(this.ready ? this.hasSavedProgress ? 'resume' : 'start' : 'prepare');
  }

  private refreshSwitches(): void {
    const set = (button: HTMLButtonElement, value: boolean) => {
      button.setAttribute('aria-checked', String(value));
      button.classList.toggle('on', value);
      button.querySelector('.switch-label')!.textContent = uiCopy(value ? 'on' : 'off');
    };
    set(this.soundSwitch, this.preferences.sound);
    set(this.guidesSwitch, this.preferences.guides);
  }

  private refreshLanguage(): void {
    this.layer.querySelectorAll<HTMLElement>('[data-copy]').forEach(node => { node.textContent = uiCopy(node.dataset.copy as UICopyKey); });
    this.layer.querySelectorAll<HTMLElement>('[data-story]').forEach(node => { node.textContent = storyText(node.dataset.story as StoryKey); });
    this.layer.querySelectorAll<HTMLElement>('[data-copy-aria]').forEach(node => node.setAttribute('aria-label', uiCopy(node.dataset.copyAria as UICopyKey)));
    this.layer.querySelectorAll<HTMLElement>('[data-copy-title]').forEach(node => { node.title = uiCopy(node.dataset.copyTitle as UICopyKey); });
    this.layer.querySelectorAll<HTMLElement>('[data-copy-inspired]').forEach(node => this.fillInspired(node, node.dataset.copyInspired as UICopyKey));
    this.layer.querySelectorAll<HTMLElement>('.language-pill').forEach(pill => pill.setAttribute('aria-pressed', String(pill.dataset.language === getLanguage())));
    this.refreshStartLabel();
    this.refreshSwitches();
    this.loadText.textContent = resolveCopy(this.loadingCopy);
    this.setPersistenceStatus(this.persistenceAvailable);
    this.renderJournal();
    if (this.spoolState) { this.spoolKey = ''; this.setSpool(this.spoolState); }
    if (this.prompt === null) this.touchInteract.setAttribute('aria-label', uiCopy('touchInteract'));
    if (!this.notice.hidden) this.notice.textContent = resolveCopy(this.noticeCopy);
    if (!this.caption.hidden) this.caption.textContent = resolveCopy(this.captionCopy);
    if (!this.error.hidden) {
      this.error.querySelector('p')!.textContent = resolveCopy(this.errorCopy);
      const retry = this.error.querySelector<HTMLButtonElement>('.retry-button');
      if (retry) retry.textContent = uiCopy('retry');
    }
    if (this.currentDialogue && this.currentDialogue.index < this.currentDialogue.lines.length - 1) this.dialogueAction.textContent = uiCopy('continue');
    document.documentElement.dataset.lang = languageTag(getLanguage());
  }

  /** Credits line with "Messenger" linked to the studio's page. */
  private fillInspired(node: HTMLElement, key: UICopyKey): void {
    const text = uiCopy(key), name = 'Messenger', index = text.indexOf(name);
    if (index < 0) { node.textContent = text; return; }
    const link = document.createElement('a');
    link.href = 'https://messenger.abeto.co/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = name;
    node.replaceChildren(text.slice(0, index), link, text.slice(index + name.length));
  }

  private renderJournal(): void {
    const done = this.journalEntries.filter(entry => entry.status === 'done').length;
    this.journalCount.textContent = uiCopy('journalCount', { count: done, total: this.journalEntries.length || CONNECTIONS.length });
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of this.journalEntries) groups.set(entry.district, [...(groups.get(entry.district) ?? []), entry]);
    const fragment = document.createDocumentFragment();
    for (const [district, entries] of groups) {
      const section = document.createElement('section');
      section.className = 'journal-group';
      const heading = document.createElement('h3');
      heading.textContent = district;
      const list = document.createElement('ul');
      for (const entry of entries) {
        const item = document.createElement('li');
        item.className = `journal-entry ${entry.status}`;
        item.style.setProperty('--thread', entry.color);
        const dot = document.createElement('span');
        dot.className = 'thread-dot';
        dot.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.className = 'entry-title';
        title.textContent = entry.title;
        const status = document.createElement('span');
        status.className = 'entry-status';
        status.textContent = uiCopy(entry.status === 'done' ? 'statusDone' : entry.status === 'available' ? 'statusAvailable' : 'statusLocked');
        item.append(dot, title, status);
        list.append(item);
      }
      section.append(heading, list);
      fragment.append(section);
    }
    this.journalList.replaceChildren(fragment);
  }

  /* ---------------------------------------------------------------- modals */

  private openModal(name: ModalName): void {
    if (name === 'reset') this.resetFromChapter = !this.modals.chapter.hidden;
    if (!this.modalOpen) this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modals[name].hidden = false;
    this.layer.classList.add('has-modal');
    this.clearInput();
    this.syncPrompt();
    const focus = this.modals[name].querySelector<HTMLElement>('.primary:not(:disabled), .close-button, button:not(:disabled)');
    focus?.focus({ preventScroll: true });
  }

  private closeModal(name: ModalName): void {
    this.modals[name].hidden = true;
    this.layer.classList.toggle('has-modal', this.modalOpen);
    this.clearInput();
    if (!this.modalOpen) {
      // Playing: hand the keys back to the game. Title: return to the button that opened the window.
      if (this.started) (document.activeElement as HTMLElement | null)?.blur?.();
      else this.returnFocus?.focus({ preventScroll: true });
      this.returnFocus = null;
    } else {
      const top = MODAL_ORDER.find(item => !this.modals[item].hidden)!;
      this.modals[top].querySelector<HTMLElement>('.primary:not(:disabled), .close-button, button:not(:disabled)')?.focus({ preventScroll: true });
    }
  }

  private finishChapter(): void {
    this.closeModal('chapter');
    this.chapterHandlers?.onContinue();
  }

  private requestPostcard(): void {
    this.postcardFromChapter = !this.modals.chapter.hidden;
    this.modals.chapter.hidden = true;
    this.chapterHandlers?.onPostcard();
  }

  /** `keepWandering` closes the whole finale; the corner button returns to the card it came from. */
  private closePostcard(keepWandering: boolean): void {
    this.postcardToken++;
    this.closeModal('postcard');
    if (keepWandering) { this.chapterHandlers?.onContinue(); return; }
    if (this.postcardFromChapter) this.openModal('chapter');
  }

  private async savePostcardFile(): Promise<void> {
    if (!this.postcardCanvas) return;
    this.postcardSave.disabled = true;
    try {
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const result = await savePostcard(this.postcardCanvas, `unspool-postcard-${stamp}.png`, storyText('postcard.title'));
      if (result === 'downloaded') this.showNotice(() => uiCopy('postcardSaved'), 3);
      else if (result === 'shared') this.showNotice(() => uiCopy('postcardShared'), 3);
    } catch (error) {
      console.error(error);
      this.showNotice(() => uiCopy('postcardFailed'), 4);
    }
    this.postcardSave.disabled = false;
  }

  private syncPrompt(): void {
    const show = !!this.prompt && !this.blocked;
    if (this.interaction.hidden === show) this.interaction.hidden = !show;
    if (this.touchInteract.disabled === show) this.touchInteract.disabled = !show;
  }

  /* ---------------------------------------------------------------- input */

  private keyDown(event: KeyboardEvent): void {
    if (event.code === 'Tab') { this.trapFocus(event); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('a[href]') && event.code === 'Enter') return;
    if (!this.dialogueOpen && event.target instanceof HTMLButtonElement && (event.code === 'Enter' || (event.code === 'Space' && this.blocked))) return;
    const controlled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyR', 'KeyJ', 'KeyH', 'Enter', 'Escape', 'ShiftLeft', 'ShiftRight'];
    if (controlled.includes(event.code)) event.preventDefault();

    if (event.code === 'Escape') {
      const top = MODAL_ORDER.find(name => !this.modals[name].hidden);
      if (top === 'credits' || top === 'reset' || top === 'settings' || top === 'journal' || top === 'help') this.closeModal(top);
      else if (top === 'postcard') this.closePostcard(false);
      else if (top === 'chapter') this.finishChapter();
      else if (this.dialogueOpen) this.closeDialogue();
      else if (this.started && !this.fatalError && !this.transitioning) this.openModal('settings');
      return;
    }
    if (this.modals.credits.hidden === false || this.modals.reset.hidden === false) return;
    const freeModal = (allowed: ModalName) => this.started && !this.fatalError && !this.dialogueOpen && !this.transitioning && !event.repeat
      && MODAL_ORDER.every(name => name === allowed || this.modals[name].hidden);
    if (event.code === 'KeyJ' && freeModal('journal')) { this.modals.journal.hidden ? this.openModal('journal') : this.closeModal('journal'); return; }
    if (event.code === 'KeyH' && freeModal('help')) { this.modals.help.hidden ? this.openModal('help') : this.closeModal('help'); return; }
    if ((event.code === 'Enter' || event.code === 'KeyE') && !event.repeat) {
      if (this.dialogueOpen) this.advanceDialogue();
      else if (!this.started && this.ready && !this.modalOpen) this.onStart();
      else if (!this.blocked && event.code === 'KeyE') this.onInteract();
      return;
    }
    if (event.code === 'KeyR') { if (!event.repeat && !this.blocked) this.onReel(); return; }
    if (this.blocked) return;
    if (event.code === 'Space' && !event.repeat) this.input.jump = true;
    this.keys.add(event.code);
    this.refreshInput();
  }

  private refreshInput(): void {
    if (this.blocked) {
      this.input.x = this.input.y = 0;
      this.input.sprint = false;
      return;
    }
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    const keyboardX = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
    const keyboardY = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
    this.input.x = keyboardX || this.joystickInput.x;
    this.input.y = keyboardY || this.joystickInput.y;
    this.input.sprint = !!held('ShiftLeft', 'ShiftRight');
  }

  private clearInput(): void {
    this.keys.clear();
    this.joystickInput = { x: 0, y: 0 };
    this.joystickPointer = null;
    this.joystickKnob.style.transform = 'translate(0px, 0px)';
    this.input.x = this.input.y = 0;
    this.input.jump = false;
    this.input.sprint = false;
  }

  private moveJoystick(event: PointerEvent): void {
    event.preventDefault();
    const rect = this.joystick.getBoundingClientRect();
    const radius = rect.width * .3;
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) { x *= radius / length; y *= radius / length; }
    this.joystickInput.x = Math.abs(x) < radius * .12 ? 0 : x / radius;
    this.joystickInput.y = Math.abs(y) < radius * .12 ? 0 : -y / radius;
    this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    this.refreshInput();
  }

  private renderDialogue(): void {
    if (!this.currentDialogue) return;
    const { lines, index, action } = this.currentDialogue;
    this.currentDialogue.characters = Array.from(lines[index]);
    this.currentDialogue.lineStarted = performance.now();
    this.currentDialogue.revealed = this.reducedMotion;
    this.dialogueText.textContent = this.reducedMotion ? lines[index] : '';
    this.dialogueStep.textContent = `${index + 1} / ${lines.length}`;
    this.dialogueAction.textContent = index === lines.length - 1 ? action : uiCopy('continue');
    this.onDialogueLine(lines[index], index);
  }

  private updateDialogueText(): void {
    const dialogue = this.currentDialogue;
    if (!dialogue || dialogue.revealed) return;
    const count = Math.min(dialogue.characters.length, Math.floor((performance.now() - dialogue.lineStarted) / 28));
    this.dialogueText.textContent = dialogue.characters.slice(0, count).join('');
    if (count >= dialogue.characters.length) dialogue.revealed = true;
  }

  private advanceDialogue(): void {
    if (!this.currentDialogue) return;
    if (!this.currentDialogue.revealed) {
      this.currentDialogue.revealed = true;
      this.dialogueText.textContent = this.currentDialogue.lines[this.currentDialogue.index];
      return;
    }
    if (this.currentDialogue.index < this.currentDialogue.lines.length - 1) {
      this.currentDialogue.index++;
      this.renderDialogue();
      return;
    }
    const onFinish = this.currentDialogue.onFinish;
    this.closeDialogue(false);
    onFinish();
  }

  /** Keep Tab inside the topmost open window (or the dialogue) instead of the HUD behind it. */
  private trapFocus(event: KeyboardEvent): void {
    const top = MODAL_ORDER.find(name => !this.modals[name].hidden);
    const scope = top ? this.modals[top] : this.dialogueOpen ? this.dialogue : null;
    if (!scope) return;
    const focusable = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].filter(node => node.offsetParent !== null || node === document.activeElement);
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    event.preventDefault();
    focusable[next].focus();
  }
}
