import { Vector3, type Camera, type Scene } from 'three';
import { createCharacter } from '../character';
import { sphereOrientation, sphereTangent } from '../sphere';
import { getLanguage, subscribeLanguage, type Language } from '../i18n';
import type { Character, Gesture } from '../contracts';
import { GREETING_COUNT, type PeerState, type Vec3 } from './protocol';
import './social.css';

/** Other players on the planet and the preset greetings. Everything here is
 * presentation: positions come from Online, greetings are ids localized by
 * the viewer, so nobody can put text on anyone else's screen. */

const JACKETS = ['#4d62cb', '#e0734f', '#3f9b78', '#9a5bc4', '#d9a72e', '#4aa3c7'];
const darker = (hex: string) => `#${hex.slice(1).match(/../g)!.map(c => Math.round(parseInt(c, 16) * 0.72).toString(16).padStart(2, '0')).join('')}`;

const GREETINGS: Record<Language, readonly string[]> = {
  zh: ['👋 你好呀！', '🧶 一起牵线吧', '✨ 好美呀', '🌙 回头见'],
  'zh-Hant': ['👋 你好呀！', '🧶 一起牽線吧', '✨ 好美呀', '🌙 回頭見'],
  en: ['👋 Hello!', '🧶 Let’s lay some thread!', '✨ So pretty!', '🌙 See you!'],
  ja: ['👋 こんにちは！', '🧶 いっしょに糸をつなごう', '✨ きれいだね', '🌙 またね'],
  ko: ['👋 안녕!', '🧶 같이 실을 잇자', '✨ 정말 예쁘다', '🌙 또 봐요'],
};
const COPY: Record<Language, { greet: string; online: (n: number) => string; travelers: (n: number) => string }> = {
  zh: { greet: '打招呼', online: n => `星球上还有 ${n} 位旅人`, travelers: n => `已有 ${n} 位旅人在这里留下了线` },
  'zh-Hant': { greet: '打招呼', online: n => `星球上還有 ${n} 位旅人`, travelers: n => `已有 ${n} 位旅人在這裡留下了線` },
  en: { greet: 'Say hi', online: n => `${n} other traveler${n === 1 ? '' : 's'} here`, travelers: n => `${n} traveler${n === 1 ? ' has' : 's have'} left a thread here` },
  ja: { greet: 'あいさつ', online: n => `ほかに ${n} 人の旅人がいます`, travelers: n => `${n} 人の旅人がここに糸を残しました` },
  ko: { greet: '인사하기', online: n => `지금 ${n}명의 여행자가 함께 있어요`, travelers: n => `${n}명의 여행자가 이곳에 실을 남겼어요` },
};
export const greetingText = (id: number) => GREETINGS[getLanguage()][id] ?? '';

interface Peer {
  character: Character;
  position: Vector3;
  forward: Vector3;
  target: Vector3;
  targetForward: Vector3;
  moving: number;
  targetMoving: number;
  gesture: Gesture;
  gestureUntil: number;
  seen: boolean;
}

export class Peers {
  private readonly peers = new Map<string, Peer>();
  private readonly normal = new Vector3();
  private elapsed = 0;

  constructor(private readonly scene: Scene) {}

  get count(): number { let n = 0; for (const peer of this.peers.values()) if (peer.seen) n++; return n; }

  set(id: string, variant: number, p?: Vec3, f?: Vec3, m = 0): void {
    let peer = this.peers.get(id);
    if (!peer) {
      const jacket = JACKETS[variant % JACKETS.length];
      const character = createCharacter('player', { shirt: jacket, sleeve: jacket, pants: darker(darker(jacket)) });
      character.group.name = `Peer:${id}`;
      character.group.visible = false;
      this.scene.add(character.group);
      peer = { character, position: new Vector3(), forward: new Vector3(0, 0, 1), target: new Vector3(), targetForward: new Vector3(0, 0, 1), moving: 0, targetMoving: 0, gesture: 'none', gestureUntil: 0, seen: false };
      this.peers.set(id, peer);
    }
    if (p && f) this.move(id, p, f, m);
  }

  move(id: string, p: Vec3, f: Vec3, m: number): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.target.set(...p);
    peer.targetForward.set(...f);
    peer.targetMoving = m;
    if (!peer.seen || peer.position.distanceTo(peer.target) > 6) { peer.position.copy(peer.target); peer.forward.copy(peer.targetForward); }
    peer.seen = true;
    peer.character.group.visible = true;
  }

  greet(id: string): Vector3 | null {
    const peer = this.peers.get(id);
    if (!peer?.seen) return null;
    peer.gesture = 'wave'; peer.gestureUntil = this.elapsed + 2.2;
    return peer.position;
  }

  head(id: string): Vector3 | null {
    const peer = this.peers.get(id);
    return peer?.seen ? peer.position.clone().addScaledVector(peer.position.clone().normalize(), peer.character.height + 0.35) : null;
  }

  remove(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.scene.remove(peer.character.group);
    this.peers.delete(id);
  }

  clear(): void { for (const id of [...this.peers.keys()]) this.remove(id); }

  /** Call before the player's own update (the shared spool-thread uniform ends with the player's color). */
  update(dt: number): void {
    this.elapsed += dt;
    const k = 1 - Math.exp(-dt * 5);
    for (const peer of this.peers.values()) {
      if (!peer.seen) continue;
      // Positions arrive a few times a second: glide toward the latest one.
      peer.position.lerp(peer.target, k);
      const radius = peer.position.length() + (peer.target.length() - peer.position.length()) * k;
      peer.position.setLength(radius);
      this.normal.copy(peer.position).normalize();
      peer.forward.lerp(peer.targetForward, k);
      const forward = sphereTangent(this.normal, peer.forward);
      const remaining = peer.position.distanceTo(peer.target);
      peer.moving += ((remaining > 0.08 ? Math.max(peer.targetMoving, 0.5) : 0) - peer.moving) * k;
      const group = peer.character.group;
      group.position.copy(peer.position);
      group.quaternion.copy(sphereOrientation(this.normal, forward));
      if (peer.gesture !== 'none' && this.elapsed > peer.gestureUntil) peer.gesture = 'none';
      peer.character.update({ elapsed: this.elapsed, dt, moving: peer.moving, airborne: false, verticalSpeed: 0, gesture: peer.gesture });
    }
  }
}

interface Bubble { element: HTMLElement; anchor: () => Vector3 | null; until: number }

/** Greeting button + wheel (G, then 1–4), speech bubbles, online and traveler counts. */
export class SocialUI {
  onGreet: (id: number) => void = () => {};
  private readonly root: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly online: HTMLElement;
  private readonly bubbles: Bubble[] = [];
  private readonly travelers: HTMLElement | null;
  private onlineCount = 0;
  private travelerCount = 0;
  private time = 0;
  private enabled = false;
  private readonly projected = new Vector3();

  constructor(host: HTMLElement, private readonly blocked: () => boolean) {
    this.root = document.createElement('div');
    this.root.className = 'social';
    this.root.innerHTML = `
      <p class="social-online" hidden></p>
      <div class="social-wheel" hidden role="menu"></div>
      <button class="social-button" type="button" hidden><span aria-hidden="true">👋</span><kbd>G</kbd></button>`;
    host.append(this.root);
    this.wheel = this.root.querySelector('.social-wheel')!;
    this.button = this.root.querySelector('.social-button')!;
    this.online = this.root.querySelector('.social-online')!;
    this.travelers = document.querySelector('.intro-copy') ? document.createElement('p') : null;
    if (this.travelers) { this.travelers.className = 'social-travelers'; this.travelers.hidden = true; document.querySelector('.intro-copy')!.append(this.travelers); }
    this.button.addEventListener('click', () => this.toggle());
    addEventListener('keydown', event => {
      if (!this.enabled || event.repeat || this.blocked() || (event.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (event.code === 'KeyG') { this.toggle(); return; }
      if (this.wheel.hidden) return;
      const digit = Number(event.key);
      if (digit >= 1 && digit <= GREETING_COUNT) { event.preventDefault(); this.send(digit - 1); }
      if (event.code === 'Escape') this.wheel.hidden = true;
    });
    subscribeLanguage(() => this.render());
    this.render();
  }

  /** Visible once the game has started (and only when online). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.button.hidden = !enabled;
    if (!enabled) this.wheel.hidden = true;
    this.render();
  }

  setOnline(count: number): void { if (count !== this.onlineCount) { this.onlineCount = count; this.render(); } }
  setTravelers(count: number): void { this.travelerCount = count; this.render(); }

  private toggle(): void { this.wheel.hidden = !this.wheel.hidden; }

  private send(id: number): void {
    this.wheel.hidden = true;
    this.onGreet(id);
  }

  private render(): void {
    const copy = COPY[getLanguage()];
    this.button.title = copy.greet;
    this.button.setAttribute('aria-label', copy.greet);
    this.wheel.replaceChildren(...GREETINGS[getLanguage()].map((text, i) => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'social-greeting';
      item.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      item.querySelector('span')!.textContent = text;
      item.addEventListener('click', () => this.send(i));
      return item;
    }));
    this.online.hidden = !this.enabled || this.onlineCount < 1;
    this.online.textContent = copy.online(this.onlineCount);
    if (this.travelers) {
      this.travelers.hidden = this.travelerCount < 1;
      this.travelers.textContent = copy.travelers(this.travelerCount);
    }
  }

  /** A speech bubble that follows `anchor` (world space) for a few seconds. */
  bubble(text: string, anchor: () => Vector3 | null, seconds = 3.2): void {
    const element = document.createElement('div');
    element.className = 'social-bubble';
    element.textContent = text;
    this.root.append(element);
    this.bubbles.push({ element, anchor, until: this.time + seconds });
  }

  update(dt: number, camera: Camera, width: number, height: number): void {
    this.time += dt;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      const anchor = bubble.anchor();
      if (!anchor || this.time > bubble.until) { bubble.element.remove(); this.bubbles.splice(i, 1); continue; }
      // Hidden behind the planet or the camera.
      const facing = anchor.clone().normalize().dot(camera.position.clone().sub(anchor).normalize());
      this.projected.copy(anchor).project(camera);
      const visible = facing > -0.1 && this.projected.z < 1 && Math.abs(this.projected.x) < 1.1 && Math.abs(this.projected.y) < 1.1;
      bubble.element.style.opacity = visible ? String(Math.min(1, (bubble.until - this.time) * 2)) : '0';
      bubble.element.style.transform = `translate(${((this.projected.x + 1) / 2 * width).toFixed(1)}px, ${((1 - this.projected.y) / 2 * height).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
