import './style.css';
import { Scene, Color, WebGLRenderer, PerspectiveCamera, HemisphereLight, DirectionalLight, Vector3 } from 'three';
import { createWorld } from './world';
import { Player } from './player';
import { FollowCamera } from './camera';
import { createResidents, updateResidents } from './residents';
import { createThreadSystem } from './thread';
import { createEnvironmentFx } from './fx';
import { GameUI, snapshotCanvas } from './ui';
import { GameSound } from './audio';
import { createInkRenderer } from './render';
import { AdaptiveQuality } from './performance';
import { parallelTransport, sphereTangent, turnHeading } from './sphere';
import { createPlanetLighting } from './lighting';
import { JourneyPersistence } from './journey';
import { createPlanetSky } from './sky';
import { createPlanetShadows } from './shadows';
import { CinematicCamera } from './cinematic';
import { getLanguage, languageTag, subscribeLanguage } from './i18n';
import { gameText } from './game-copy';
import { ChapterDirector } from './chapter/director';
import { ChapterProgress } from './chapter/progress';
import { storyText } from './chapter/text';
import { CONNECTIONS, THREAD_CAPACITY, THREAD_COLORS, connectionById, dir, type ConnectionId, type NpcId } from './chapter/data';
import type { StoryKey } from './chapter/script';
import type { Resident, ThreadPrompt } from './contracts';
import { revival } from './art/revival';
import { toonShared } from './art/toon';
import { createWoven, loadSample, type Woven } from './woven';
import { PROGRESS_SAVE_KEY } from './chapter/progress';
import { revivalUniforms } from './art/revival';
import { Online, apiOrigin, fetchThreads } from './net/online';
import { Peers, SocialUI, greetingText } from './net/social';
import { WalkRecorder, threadColor, uploadWalk } from './net/walk';
import type { Vec3 } from './net/protocol';

// Film/promo only: ?woven shows SIMULATED routes (scripts/woven-sample.ts) on a finished
// planet without touching the save. Never present that view as real players.
const wovenParams = new URLSearchParams(location.search);
const wovenMode = wovenParams.has('woven') ? (wovenParams.get('woven') || 'color') : null;

function localizePage() {
  document.documentElement.lang = languageTag(getLanguage());
  document.title = gameText('pageTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', gameText('description'));
  document.querySelector('#world canvas')?.setAttribute('aria-label', gameText('canvas'));
}
localizePage(); subscribeLanguage(localizePage);

const ui = new GameUI(document.querySelector<HTMLElement>('#ui')!);
const sound = new GameSound();
ui.onSound = enabled => sound.setEnabled(enabled);
document.querySelector('#ui')!.addEventListener('click', event => {
  if ((event.target as Element).closest('button')) sound.ui('click');
});
addEventListener('visibilitychange', () => sound.setPaused(document.hidden));

async function boot() {
  const scene = new Scene();
  scene.background = new Color('#e9e4d8');
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  const lowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  // Recording only: ?dpr=2 renders the 1080p layout at native 4K.
  const recordingDPR = Number(new URLSearchParams(location.search).get('dpr')) || 0;
  const maximumDPR = recordingDPR || Math.min(devicePixelRatio, lowMemory && lowMemory <= 4 ? 1.15 : 1.5);
  renderer.setPixelRatio(maximumDPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = 'srgb';
  renderer.domElement.setAttribute('aria-label', gameText('canvas'));
  document.querySelector('#world')!.replaceChildren(renderer.domElement);
  const camera = new PerspectiveCamera(45, innerWidth / innerHeight, .1, 200);
  scene.add(new HemisphereLight('#fff5df', '#537d76', 2));
  const sunlight = new DirectionalLight('#fff0d5', 2.1);
  sunlight.position.copy(toonShared.uLightPosition.value);
  scene.add(sunlight);

  ui.setLoadingProgress(10);
  ui.setLoading(() => gameText('loadingExpand'));
  const world = await createWorld();
  ui.setLoadingProgress(45, () => gameText('loadingThread'));
  const sky = createPlanetSky();
  const fx = await createEnvironmentFx(world);
  scene.add(world.group, sky.mesh, fx.group);
  world.group.updateMatrixWorld(true);
  const player = new Player(world, world.spawnNormal.clone());
  scene.add(player.group);
  const follow = new FollowCamera(camera);
  const cinematic = new CinematicCamera();
  let cinematicHeld = false;
  let finaleNightTarget = 0;
  let chapterCardShown = false;
  /** Overview of the woven planet, then a slow move to the dark far house. */
  const playFinale = () => {
    uploadMine(false);
    const points = walk.points();
    if (points) { mine?.mesh.removeFromParent(); mine = createWoven([{ c: myColor, p: points }], { width: .05, lift: .02 }); mine.material.uniforms.uSpark.value = 2; scene.add(mine.mesh); }
    finaleNightTarget = 1;
    const radius = world.radius;
    const north = new Vector3(0, 1, 0);
    const overview = player.normal.clone().addScaledVector(north, .35).normalize();
    const around = overview.clone().applyAxisAngle(north, Math.PI * .8).addScaledVector(north, .25).normalize();
    const door = world.anchors.farHouseDoor;
    const approach = door.normal.clone().addScaledVector(door.forward, .24).normalize();
    cinematic.play(camera, [
      { direction: overview, radius: radius * 2.7, look: new Vector3(), up: sphereTangent(overview, north) },
      { direction: around, radius: radius * 3, look: new Vector3(), up: sphereTangent(around, north) },
      { direction: approach, radius: radius + 2.8, look: door.position.clone().addScaledVector(door.normal, 1.0), up: door.normal.clone() },
    ], [3.5, 6, 4.5], () => { cinematicHeld = true; });
  };
  /** The phone call happens through two windows across a narrow alley, too
   * wide apart for one shot: cut to whoever speaks, seen from the other window. */
  const frameSpeaker = (speakerId: NpcId | undefined) => {
    const speaker = residents.find(resident => resident.id === speakerId);
    const listener = residents.find(resident => resident.id === (speakerId === 'otto' ? 'ike' : 'otto'));
    if (!speaker || !listener || (speakerId !== 'otto' && speakerId !== 'ike')) return false;
    const a = speaker.focusPosition, b = listener.focusPosition;
    const up = a.clone().add(b).normalize();
    const across = sphereTangent(up, a.clone().sub(b));
    const along = across.clone().cross(up).normalize();
    // straight through both windows first: the open shutters hide oblique views
    for (const [t, lift, side] of [[.45, .22, 0], [.35, .18, 0], [.55, .3, 0], [.45, .25, .2], [.45, .25, -.2]]) {
      const eye = b.clone().lerp(a, t).addScaledVector(up, lift).addScaledVector(along, side);
      if (!player.physics.collision.hasLineOfSight(eye, a, .05)) continue;
      cinematic.play(camera, [{ direction: eye.clone().normalize(), radius: eye.length(), look: a.clone().addScaledVector(up, -.55), up }], [.01]);
      return true;
    }
    return false;
  };
  const residents = createResidents(world);
  residents.forEach(resident => scene.add(resident.group));
  const thread = createThreadSystem(world);
  scene.add(thread.group);
  // Everyone's walks: shown on the night title and at the chapter finale.
  const origin = apiOrigin();
  let woven: Woven | null = null;
  const social = new SocialUI(document.querySelector<HTMLElement>('#ui')!, () => ui.blocked);
  const showWoven = (next: Woven) => { if (woven) { scene.remove(woven.mesh); woven.mesh.geometry.dispose(); } woven = next; scene.add(next.mesh); };
  if (wovenMode) showWoven(createWoven((await loadSample('/woven/sample.json')).slice(0, Number(wovenParams.get('n') ?? Infinity))));
  else if (origin) void fetchThreads(origin).then(everyone => {
    if (!everyone) return;
    social.setTravelers(everyone.total);
    // Point budget for the title ribbons: phones draw fewer of the newest walks.
    const budget = matchMedia('(pointer: coarse)').matches || (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4 ? 40000 : 120000;
    const shown: typeof everyone.threads = [];
    let points = 0;
    for (const thread of everyone.threads) { points += thread.p.length / 3; if (points > budget) break; shown.push(thread); }
    if (shown.length) showWoven(createWoven(shown));
  });
  // A finished, colored planet for the prototype title, without touching the real save.
  const wovenSave = wovenMode === 'color' ? JSON.stringify({ version: 1, completed: CONNECTIONS.map(c => c.id), flags: ['finale'], threads: null }) : null;
  const progress = wovenMode ? new ChapterProgress({ getItem: key => key === PROGRESS_SAVE_KEY ? wovenSave : null, setItem() {}, removeItem() {} }) : new ChapterProgress();
  const journey = new JourneyPersistence();
  ui.setLoadingProgress(70, () => gameText('loadingPaint'));
  const restartJourney = () => { progress.restart(); journey.restart(); location.reload(); };
  // Postcard capture: the WebGL buffer is not preserved, so the frame loop copies it
  // into a 2D canvas right after the ink pass renders, in the same task.
  let captureRequest: ((frame: HTMLCanvasElement) => void) | null = null;
  let postcardPending = false;
  const capturePostcard = () => {
    const deliver = (frame: HTMLCanvasElement) => {
      postcardPending = false;
      sound.ui('shutter');
      void ui.showPostcard(frame, {
        title: storyText('postcard.title'),
        date: new Date().toLocaleDateString(languageTag(getLanguage()), { year: 'numeric', month: 'long', day: 'numeric' }),
        colors: [...new Set([...director.completed].map(id => THREAD_COLORS[connectionById(id).kind]))],
      });
    };
    // From the chapter card, frame the whole woven planet instead of the dark house.
    if (cinematic.active) {
      postcardPending = true;
      const north = new Vector3(0, 1, 0);
      const overview = player.normal.clone().addScaledVector(north, .45).normalize();
      cinematic.play(camera, [{ direction: overview, radius: world.radius * 2.55, look: new Vector3(), up: sphereTangent(overview, north) }], [1.6],
        () => { cinematicHeld = true; captureRequest = deliver; });
    } else captureRequest = deliver;
  };
  const chapterEnd = { onPostcard: capturePostcard, onContinue: () => {}, onRestart: restartJourney };

  const director = new ChapterDirector(world, residents, thread, fx, sky, sound, progress, {
    showNotice: (text, seconds) => ui.showNotice(text, seconds),
    showSequence: (beats, onDone) => {
      let framed = false;
      const next = (index: number) => {
        const beat = beats[index];
        if (!beat) {
          conversation = undefined; sound.stopDialogue();
          if (framed && !chapterCardShown) { cinematic.release(); follow.reset(player); }
          onDone(); return;
        }
        dialogueVoice = beat.voice;
        if (frameSpeaker(beat.speaker)) framed = true;
        ui.showDialogue(beat.name(), beat.lines(), gameText('farewell'), () => next(index + 1), () => next(index + 1));
        dialogueCopy = () => ({ name: beat.name(), lines: beat.lines(), action: gameText('farewell') });
      };
      next(0);
    },
    showChapterEnd: () => { chapterCardShown = true; ui.showChapterEnd(chapterEnd); },
    showCaption: (text, seconds) => ui.showCaption(text, seconds),
    playFinale: () => playFinale(),
  });
  director.restore();
  /** Title look: a colored night planet wrapped in everyone's threads (visual
   * only: the save is untouched). Starting the game fades to the player's own
   * planet; the finale returns to night with the player's thread among the rest. */
  const look = { title: 1, finaleNight: 0, glow: Number(wovenParams.get('glow') ?? .7), titleDusk: Number(wovenParams.get('dusk') ?? .85) };
  const applyLook = () => {
    const night = Math.max(look.title, look.finaleNight);
    toonShared.uNight.value = night * Number(wovenParams.get('night') ?? 1);
    revivalUniforms.uForceAlive.value = director.finished ? 0 : look.title;
    if (look.title > 0.0005) {
      world.setFinale(director.finished ? 1 : look.title);
      const dusk = Math.max(look.title * look.titleDusk, director.finished ? .65 : 0);
      sky.setDusk(dusk); fx.setDusk(dusk);
    }
    const shown = woven as Woven | null;
    if (shown) {
      shown.material.uniforms.uIntensity.value = look.glow * night;
      shown.mesh.visible = night > 0.01;
    }
    const own = mine as Woven | null;
    if (own) { own.material.uniforms.uIntensity.value = look.finaleNight; own.mesh.visible = look.finaleNight > 0.01; }
  };
  let mine: Woven | null = null;
  applyLook();

  // Other players and greetings.
  const peers = new Peers(scene);
  const walk = new WalkRecorder();
  const myColor = threadColor();
  let walkUploaded = false;
  const uploadMine = (beacon: boolean) => {
    if (walkUploaded || !origin || wovenMode) return;
    const points = walk.points();
    if (!points) return;
    walkUploaded = true;
    void uploadWalk(origin, { c: myColor, p: points }, beacon).then(total => { if (total) social.setTravelers(total); });
  };
  const online = origin && !wovenMode ? new Online(origin, {
    welcome: (_id, _variant, list) => { peers.clear(); for (const [id, variant, p, f, m] of list) peers.set(id, variant, p, f, m); },
    join: (id, variant) => peers.set(id, variant),
    move: (id, p, f, m) => { peers.set(id, 0); peers.move(id, p, f, m); },
    greet: (id, greeting) => { if (peers.greet(id)) { social.bubble(greetingText(greeting), () => peers.head(id)); sound.ui('open'); } },
    leave: id => peers.remove(id),
    reset: () => peers.clear(),
  }) : null;
  social.onGreet = greeting => {
    if (!started || phase !== 'playing') return;
    online?.greet(greeting);
    cheerUntil = time + 1.6;
    social.bubble(greetingText(greeting), () => player.renderPosition.clone().addScaledVector(player.renderNormal, player.height + .35));
    sound.ui('open');
  };
  if (director.finished) ui.allowPostcards(chapterEnd);
  ui.setSavedProgress(progress.hasProgress || journey.hasProgress, director.completed.size);
  // Toon materials share this vector; lighting.ts moves it with the player.
  const lighting = createPlanetLighting(scene, sunlight);
  const shadows = createPlanetShadows(renderer, scene, sunlight);
  const inkRenderer = await createInkRenderer(renderer, scene, camera);
  const initialSunForward = player.forward.clone();
  lighting.reset(player.renderPosition, player.renderNormal, initialSunForward);
  const quality = new AdaptiveQuality(maximumDPR, maximumDPR, recordingDPR || Math.min(.75, maximumDPR));

  let started = false;
  let phase: 'title' | 'arrival' | 'playing' = 'title';
  let activeResident: Resident | undefined;
  let activePrompt: ThreadPrompt | null = null;
  let nearFarDoor = false;
  let conversation: Resident | undefined;
  let dialogueVoice: ReturnType<typeof director.dialogue>['voice'] | undefined;
  let dialogueCopy: (() => { name: string; lines: string[]; action: string }) | undefined;
  let saveElapsed = 0;
  let time = 0;
  let tautNoticeCooldown = 0;
  let frames = 0, frameSeconds = 0, fps = 0, lastEvidence = 0;

  const canTalkTo = (resident: Resident) => resident.present && resident.talkEnabled && player.physics.collision.hasLineOfSight(
    player.position.clone().addScaledVector(player.normal, player.height * .65), resident.focusPosition,
  );
  const canPersist = () => progress.persistenceAvailable && journey.persistenceAvailable;

  const refreshObjective = () => {
    const objective = director.objective(player.position);
    ui.setObjective(objective.title, objective.detail);
    ui.setJournal(CONNECTIONS.map(connection => ({
      id: connection.id, district: storyText(`district.${connection.district}` as StoryKey), title: storyText(`conn.${connection.id}` as StoryKey),
      color: THREAD_COLORS[connection.kind],
      status: director.completed.has(connection.id) ? 'done' as const : connection.requires.every(id => director.completed.has(id)) ? 'available' as const : 'locked' as const,
    })));
    residents.forEach(resident => { resident.marker.visible = resident.present && director.hasNews(resident.id); });
    return objective;
  };
  subscribeLanguage(() => {
    refreshObjective();
    const copy = dialogueCopy?.();
    if (copy && ui.dialogueOpen) ui.refreshDialogue(copy.name, copy.lines, copy.action);
  });

  let cheerUntil = 0;
  director.onChange = () => { refreshObjective(); savePose(); cheerUntil = time + 1.6; };
  player.movementLimiter = direction => thread.movementScale(player.position, direction);
  thread.onSnap = () => sound.threadPickup();

  function savePose() {
    if (!started || !player.grounded) return;
    journey.savePose(player.position.toArray(), player.forward.toArray());
  }
  function resetPlayer(restore: boolean) {
    player.reset(world.spawnNormal);
    // The spawn may be on a deck (the pier): stand on the topmost floor there,
    // not on the terrain shell that sampleRadius() reports.
    const spawnNormal = world.spawnNormal;
    const deck = player.physics.collision.supportAt(spawnNormal.clone().multiplyScalar(world.radius + 6), spawnNormal, 10);
    if (deck && deck.normal.dot(spawnNormal) > .7) player.restorePose(deck.point.clone().addScaledVector(spawnNormal, .02), world.anchors.spawn.forward);
    player.forward.copy(world.anchors.spawn.forward);
    if (restore) {
      const saved = journey.pose;
      if (saved) {
        const position = new Vector3().fromArray(saved.position), heading = new Vector3().fromArray(saved.forward);
        if (position.length() > 8 && position.length() < 36 && heading.lengthSq() > .01) {
          const normal = position.clone().normalize();
          const support = player.physics.collision.supportAt(position.clone().addScaledVector(normal, .15), normal, .35);
          if (support && player.physics.collision.penetration(position, normal, player.height, player.physics.radius) < .03) player.restorePose(position, heading);
        }
      }
    }
    follow.reset(player);
    sky.reset(player.renderNormal, player.renderForward);
    lighting.reset(player.renderPosition, player.renderNormal, parallelTransport(initialSunForward, world.spawnNormal, player.renderNormal));
  }
  function endConversation() {
    conversation = undefined; dialogueVoice = undefined; follow.endConversation(); sound.stopDialogue();
  }
  ui.onDialogueClose = canceled => { dialogueCopy = undefined; if (canceled) endConversation(); };
  ui.onDialogueLine = () => sound.ui('paper');

  function talk(resident: Resident, onDone?: () => void) {
    const dialogue = director.dialogue(resident.id as NpcId);
    conversation = resident; dialogueVoice = dialogue.voice;
    follow.converse(resident.position, resident.normal, resident.height);
    sound.ui('open');
    const finish = () => { director.markSeen(dialogue.key); endConversation(); refreshObjective(); onDone?.(); };
    ui.showDialogue(dialogue.name(), dialogue.lines(), gameText('farewell'), finish, finish);
    dialogueCopy = () => ({ name: dialogue.name(), lines: dialogue.lines(), action: gameText('farewell') });
  }

  function start(restore = true) {
    started = true; phase = 'arrival';
    resetPlayer(restore); ui.setStarted(); ui.setTransition(true);
    follow.arrive(); world.setView(player.renderPosition); sound.start(); sound.ui('start');
    social.setEnabled(!!online); online?.start();
    if (!canPersist()) ui.showNotice(() => gameText('saveUnavailable'), 6);
    else if (progress.invalidSave) ui.showNotice(() => gameText('invalidSave'), 6);
    refreshObjective();
  }
  ui.onStart = () => start();
  ui.onRestart = restartJourney;
  ui.onInteract = () => {
    if (!started || phase !== 'playing' || ui.blocked) return;
    if (activePrompt && (activePrompt.kind === 'pickup' || activePrompt.kind === 'connect')) {
      const kind = activePrompt.kind;
      if (thread.interact(activePrompt)) {
        if (kind === 'pickup') sound.threadPickup();
        refreshObjective();
      }
      return;
    }
    if (activePrompt?.kind === 'mismatch' || activePrompt?.kind === 'inactive') {
      ui.showNotice(() => storyText(activePrompt?.kind === 'mismatch' ? 'prompt.mismatch' : 'prompt.inactive'), 2.5);
      return;
    }
    if (activeResident && canTalkTo(activeResident)) { talk(activeResident); return; }
    if (nearFarDoor) ui.showNotice(() => storyText('far.locked'), 4);
  };
  ui.onReel = () => {
    if (!started || phase !== 'playing' || ui.blocked || !thread.carrying) return;
    thread.reel(); sound.threadReel(); ui.showNotice(() => storyText('notice.reeled'), 2); refreshObjective();
  };

  let dragging = false, pointerX = 0, pointerY = 0;
  renderer.domElement.addEventListener('pointerdown', event => {
    if (!started || ui.blocked || cinematic.active) return;
    dragging = true; pointerX = event.clientX; pointerY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!dragging || ui.blocked) return;
    follow.orbit(event.clientX - pointerX, event.clientY - pointerY); pointerX = event.clientX; pointerY = event.clientY;
  });
  const release = () => { dragging = false; };
  renderer.domElement.addEventListener('pointerup', release);
  renderer.domElement.addEventListener('pointercancel', release);
  addEventListener('blur', release);
  renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); if (started && !ui.blocked) follow.zoom(event.deltaY); }, { passive: false });
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  const worldHost = document.querySelector<HTMLElement>('#world')!;
  const resize = () => {
    const width = Math.max(1, worldHost.clientWidth), height = Math.max(1, worldHost.clientHeight);
    camera.aspect = width / height;
    // Portrait phones: widen the vertical field so the horizontal view stays usable.
    camera.fov = camera.aspect >= 1 ? 50 : Math.min(76, 50 / Math.pow(camera.aspect, .55));
    camera.updateProjectionMatrix(); renderer.setSize(width, height); inkRenderer.resize(width, height);
  };
  new ResizeObserver(resize).observe(worldHost); addEventListener('resize', resize); resize();

  const tangent = sphereTangent(world.spawnNormal, new Vector3(1, 0, 0));
  const titleDirection = world.spawnNormal.clone().addScaledVector(tangent, -.3).normalize();
  const titleCamera = () => {
    const direction = titleDirection.clone().applyAxisAngle(world.spawnNormal, Math.sin(time * .08) * .12);
    camera.position.copy(direction).multiplyScalar(world.radius * (camera.aspect < .8 ? 4.4 : 3.5));
    camera.up.copy(new Vector3(0, 1, 0).projectOnPlane(direction).normalize()); camera.lookAt(0, 0, 0);
  };
  const wovenSpin = Number(wovenParams.get('spin') ?? .06), wovenRadius = Number(wovenParams.get('radius') ?? 3.5);
  const wovenAxis = new Vector3(.2, 1, .1).normalize();
  const wovenCamera = () => {
    const direction = titleDirection.clone().addScaledVector(wovenAxis, .25).normalize().applyAxisAngle(wovenAxis, time * wovenSpin);
    camera.position.copy(direction).multiplyScalar(world.radius * wovenRadius * (camera.aspect < .8 ? 1.4 : 1));
    camera.up.copy(wovenAxis.clone().projectOnPlane(direction).normalize()); camera.lookAt(0, 0, 0);
  };
  // Film: wide orbit → down over the harbor square → glide → pull back out.
  let filming = false;
  const film = () => {
    const north = wovenAxis;
    const wide = camera.position.clone().normalize().applyAxisAngle(north, .45);
    const square = world.anchors.sockets.hub_harbor;
    const toward = sphereTangent(square.normal, world.anchors.sockets[(wovenParams.get('toward') ?? 'lamp_a') as 'hub_workshop'].position.clone().sub(square.position));
    const low = square.normal.clone().addScaledVector(toward, -.26).normalize();
    const glide = square.normal.clone().addScaledVector(toward, -.05).applyAxisAngle(square.normal, .35).normalize();
    const lookA = square.position.clone().addScaledVector(toward, 1.5), lookB = square.position.clone().addScaledVector(toward, 5).addScaledVector(square.normal, -.6);
    const out = wide.clone().applyAxisAngle(north, .9);
    filming = true;
    const far = camera.aspect < .8 ? 1.25 : 1;
    cinematic.play(camera, [
      { direction: wide, radius: world.radius * 2.9 * far, look: new Vector3(), up: sphereTangent(wide, north) },
      { direction: low, radius: world.radius + 8.5, look: lookA, up: square.normal.clone() },
      { direction: glide, radius: world.radius + 7.5, look: lookB, up: square.normal.clone() },
      { direction: out, radius: world.radius * 3.8 * far, look: sphereTangent(out, north).multiplyScalar(far > 1 ? 5 : -6.5), up: sphereTangent(out, north) },
    ], [4, 4.5, 3.5, 4]);
  };
  // Manual frames for the film: the RAF loop stops and the recorder advances fixed steps.
  let manualFrames = false;
  const advance = (seconds: number, steps = 2) => {
    manualFrames = true;
    for (let i = 0; i < steps; i++) frame(lastTime + seconds * 1000 / steps);
  };
  if (wovenMode) (window as unknown as { __woven: unknown }).__woven = { woven, sky, fx, world, film, advance };
  titleCamera(); world.update(0, 1);
  scene.updateMatrixWorld(true);
  shadows.refresh();
  inkRenderer.refresh();
  await renderer.compileAsync(scene, camera);
  inkRenderer.render(0);
  renderer.getContext().finish();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  ui.setLoadingProgress(100); ui.setLoading(() => gameText('ready'), true);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); savePose(); endConversation(); sound.setPaused(true);
    ui.showError(() => gameText(canPersist() ? 'contextLost' : 'contextLostNoSave'), () => location.reload());
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  addEventListener('pagehide', () => { savePose(); if (walk.length > 120) uploadMine(true); });

  if (import.meta.env.DEV) {
    // Debug-only helpers for screenshots. Never count them as gameplay evidence.
    (window as unknown as { __unspoolDebug: unknown }).__unspoolDebug = {
      teleport(lat: number, lon: number, faceLat?: number, faceLon?: number) {
        const normal = dir(lat, lon);
        player.reset(normal);
        if (faceLat !== undefined && faceLon !== undefined) player.forward.copy(sphereTangent(player.normal, dir(faceLat, faceLon).sub(normal)));
        follow.reset(player); sky.reset(player.renderNormal, player.renderForward);
      },
      complete(id: ConnectionId) { thread.onConnected(id, world.anchors.sockets[connectionById(id).to].position.clone()); },
      orbit(dx: number, dy: number) { follow.orbit(dx, dy); },
      zoom(delta: number) { follow.zoom(delta); },
      ui, sound, capturePostcard, chapterEnd, follow, camera, player, world,
    };
  }

  let lastTime = performance.now();
  const towardTarget = new Vector3();
  const spoolTipPosition = new Vector3();
  function frame(now: number) {
    if (renderer.getContext().isContextLost()) { lastTime = now; requestAnimationFrame(frame); return; }
    const rawDt = Math.max(0, (now - lastTime) / 1000), dt = Math.min(rawDt, .075); lastTime = now;
    if (document.hidden) { requestAnimationFrame(frame); return; }
    time += dt;
    if (started) {
      player.group.userData.dialogueOpen = ui.dialogueOpen || !!conversation;
      player.presentation.spoolTurns = thread.laidDistance;
      player.presentation.spoolFill = thread.remaining;
      player.presentation.heldThread = thread.carryingKind ? THREAD_COLORS[thread.carryingKind] : null;
      player.presentation.gesture = time < cheerUntil ? 'cheer' : 'none';
      player.presentation.lookAt = conversation?.focusPosition ?? null;
      peers.update(dt);
      player.update(dt, ui.blocked || cinematic.active ? { x: 0, y: 0, sprint: false, jump: false } : ui.input, follow.forward); ui.input.jump = false;
      if (conversation) {
        const heading = conversation.position.clone().sub(player.position).projectOnPlane(player.normal);
        if (heading.lengthSq() > .01) player.forward.copy(turnHeading(player.forward, heading.normalize(), player.normal, 1 - Math.exp(-dt * 4)));
      }
      const spoolTip = player.character.attachments?.spoolTip?.getWorldPosition(spoolTipPosition);
      thread.update({ time, dt, playerPosition: player.position, playerNormal: player.normal, grounded: player.grounded, spoolTip });
      if (phase === 'playing') walk.record(player.position);
      online?.pose(time, player.position.toArray() as Vec3, player.forward.toArray() as Vec3, player.moving);
      social.setOnline(peers.count);
      tautNoticeCooldown = Math.max(0, tautNoticeCooldown - dt);
      if (thread.taut && tautNoticeCooldown <= 0) { tautNoticeCooldown = 6; sound.threadTaut(); ui.showNotice(() => storyText('notice.taut'), 3.5); }
      if (cinematic.active) {
        cinematic.update(dt, camera);
        // Hold the last shot until the chapter card is dismissed.
        if (cinematicHeld && chapterCardShown && !postcardPending && !ui.blocked) {
          cinematic.release(); cinematicHeld = false; chapterCardShown = false; finaleNightTarget = 0;
          follow.reset(player); follow.arrive(2.2); phase = 'arrival';
        }
      } else follow.update(dt, player, world);
      lighting.update(player.renderPosition, player.renderNormal, follow.forward, dt);
      if (phase === 'arrival' && !follow.presenting && !cinematic.active) {
        ui.setTransition(false); phase = 'playing';
        const wick = residents.find(resident => resident.id === 'wick');
        if (director.introPending && wick) talk(wick);
      }
      director.update(dt);
      updateResidents(residents, { time, dt, playerPosition: player.position, talkingId: conversation?.id as NpcId | undefined, speaking: ui.dialogueSpeaking, completed: director.completed });

      // Interaction target: nearest thread socket or resident.
      activePrompt = ui.blocked ? null : thread.prompt(player.position);
      let closest = Infinity; activeResident = undefined;
      for (const resident of residents) {
        const distance = resident.position.distanceTo(player.position);
        if (distance < resident.talkDistance && distance < closest && canTalkTo(resident)) { closest = distance; activeResident = resident; }
      }
      // Picking up or connecting a thread wins over small talk; feedback-only
      // socket prompts (mismatch/inactive) yield to a nearby resident.
      if (activePrompt && activeResident && activePrompt.kind !== 'pickup' && activePrompt.kind !== 'connect') activePrompt = null;
      nearFarDoor = world.anchors.farHouseDoor.position.distanceTo(player.position) < 1.6;
      let prompt: { subject: string; action: string } | null = null;
      if (activePrompt) {
        const action = { pickup: 'prompt.pickup', connect: 'prompt.connect', mismatch: 'prompt.mismatch', inactive: 'prompt.inactive' }[activePrompt.kind] as StoryKey;
        prompt = { subject: storyText(`socket.${activePrompt.socket}` as StoryKey), action: storyText(action) };
      } else if (activeResident) prompt = { subject: storyText(`name.${activeResident.id}` as StoryKey), action: storyText('prompt.talk') };
      else if (nearFarDoor) prompt = { subject: storyText('district.far'), action: storyText('prompt.knock') };
      ui.setPrompt(ui.blocked || cinematic.active ? null : prompt);
      ui.setSpool(thread.carrying && thread.carryingKind ? { color: THREAD_COLORS[thread.carryingKind], remaining: thread.remaining, taut: thread.taut } : null);

      const objective = director.objective(player.position);
      if (objective.target) {
        towardTarget.copy(objective.target).sub(player.position).projectOnPlane(player.normal).normalize();
        const right = follow.forward.clone().cross(player.normal).normalize();
        const bearing = Math.atan2(towardTarget.dot(right), towardTarget.dot(follow.forward));
        const distance = Math.acos(Math.min(1, Math.max(-1, player.normal.dot(objective.target.clone().normalize())))) * world.radius;
        ui.setDestination(objective.targetName, distance, bearing);
      } else ui.setDestination(null);

      if (conversation && ui.dialogueSpeaking && dialogueVoice) sound.dialogue(dialogueVoice);
      else if (ui.dialogueOpen && ui.dialogueSpeaking && dialogueVoice) sound.dialogue(dialogueVoice);
      else sound.stopDialogue();
      sound.update({ dt, moving: player.moving, grounded: player.grounded, sprinting: ui.input.sprint,
        verticalSpeed: player.physics.velocity.dot(player.normal), water: world.isWater(player.position), active: phase === 'playing' && !ui.blocked, life: director.life });
      saveElapsed += dt; if (saveElapsed >= 5) { saveElapsed = 0; savePose(); }
      const ratio = quality.update(rawDt);
      if (ratio !== undefined) { renderer.setPixelRatio(ratio); resize(); }
    } else if (filming) cinematic.update(dt, camera); else wovenCamera();
    revival.update(dt, time);
    sky.update(time, started ? player.renderNormal : undefined, player.renderForward);
    fx.update({ time, dt, playerPosition: started ? player.renderPosition : undefined, playerNormal: started ? player.renderNormal : undefined, playerSpeed: started ? player.speed : 0, life: director.life });
    world.update(time, dt); ui.update(time);
    (woven as Woven | null)?.update(time, camera, renderer.domElement.height);
    mine?.update(time, camera, renderer.domElement.height);
    look.title += ((started ? 0 : 1) - look.title) * (1 - Math.exp(-dt * 1.3));
    if (look.title < 0.0005 && look.title > 0) { look.title = 0; world.setFinale(director.finished ? 1 : 0); }
    look.finaleNight += (finaleNightTarget - look.finaleNight) * (1 - Math.exp(-dt * .5));
    applyLook();
    social.update(dt, camera, worldHost.clientWidth, worldHost.clientHeight);
    shadows.refresh();
    inkRenderer.render(dt);
    if (captureRequest) { const deliver = captureRequest; captureRequest = null; deliver(snapshotCanvas(renderer.domElement)); }
    frames++; frameSeconds += rawDt;
    if (frameSeconds > 1) { fps = Math.round(frames / frameSeconds); frames = 0; frameSeconds = 0; }
    if (import.meta.env.DEV && now - lastEvidence > 150) {
      worldHost.dataset.gameState = JSON.stringify({
        ready: true, started, phase, completed: [...director.completed], carrying: thread.carrying, remaining: thread.remaining, taut: thread.taut,
        prompt: activePrompt ? { kind: activePrompt.kind, socket: activePrompt.socket } : null, activeResident: activeResident?.id ?? null,
        dialogueOpen: ui.dialogueOpen, blocked: ui.blocked, objective: director.objective(player.position).title,
        position: player.position.toArray(), normal: player.normal.toArray(), forward: follow.forward.toArray(),
        grounded: player.grounded, moving: player.moving, fps, life: director.life, threadCapacity: THREAD_CAPACITY,
        renderStats: inkRenderer.stats(), shadows: shadows.stats(), world: world.stats(), fx: fx.stats(), pixelRatio: renderer.getPixelRatio(),
        cameraPosition: camera.position.toArray(),
      }); lastEvidence = now;
    }
    if (!manualFrames) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch(error => {
  console.error(error);
  ui.showError(() => gameText('loadError'), () => location.reload());
});
