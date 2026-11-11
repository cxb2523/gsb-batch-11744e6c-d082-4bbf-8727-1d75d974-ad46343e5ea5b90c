import { Group, Vector3 } from 'three';
import {
  CONNECTIONS, SEA_RADIUS, SOCKET_HINTS, THREAD_CAPACITY, THREAD_COLORS,
  type ConnectionId, type SocketId, type ThreadKind,
} from '../chapter/data';
import type { ThreadFrame, ThreadPrompt, ThreadSave, ThreadSystem, World } from '../contracts';
import { Cord } from './cord';
import {
  PathRecorder, STEP_DISTANCE, THREAD_LIFT, easeOutBack, easeOutCubic, liveSag,
  pulseDuration, quantize, reelDuration, simplifyPath, tetherScale, type Drape,
} from './path';
import { ThreadProps, GROWN } from './props';
import { SocketHighlights, SocketMode } from './sockets';
import { threadClock } from './shaders';

/** The thread mechanic: lay a cord along the walked route, hold it taut when
 * the spool runs out, reel it back, snap it into a socket and send a light
 * pulse down it. Rendering is one draw call per thread plus three instanced
 * prop meshes and three for the socket highlights. */

const REACH = 1.35;
const POP_TIME = 0.3;
const SNAP_TIME = 0.22;
/** Past this the live span is the sole cord; also a teleport guard. */
const MAX_TIP_SPAN = 60;

type Status = 'idle' | 'carrying' | 'snapping' | 'reeling' | 'pulsing' | 'done';

interface Line {
  id: ConnectionId;
  index: number;
  kind: ThreadKind;
  from: SocketId;
  to: SocketId;
  cord: Cord;
  status: Status;
  /** Quantized, simplified control points of a finished thread (flat xyz). */
  final: number[];
  /** Raw recorded points while snapping (the recorder may be reused at once). */
  raw: Float32Array;
  rawCount: number;
  startedAt: number;
  duration: number;
  length: number;
  flash: number;
}

export function createThreadSystem(world: World): ThreadSystem {
  const group = new Group();
  group.name = 'Threads';
  const anchors = world.anchors.sockets;
  const socketIds = Object.keys(SOCKET_HINTS) as SocketId[];

  const lines: Line[] = CONNECTIONS.map((connection, index) => {
    const cord = new Cord(connection.kind, index * 3.7 + 1);
    group.add(cord.mesh);
    return {
      id: connection.id, index, kind: connection.kind, from: connection.from, to: connection.to, cord,
      status: 'idle' as Status, final: [], raw: new Float32Array(0), rawCount: 0, startedAt: 0, duration: 1, length: 0, flash: 0,
    };
  });
  const lineById = new Map<ConnectionId, Line>(lines.map(line => [line.id, line]));
  const socketLine = socketIds.map(socket => lines.find(line => line.from === socket || line.to === socket)!);
  const socketIsSource = socketIds.map((socket, i) => socketLine[i].from === socket);
  const socketIndex = new Map<SocketId, number>(socketIds.map((socket, i) => [socket, i]));

  const highlights = new SocketHighlights(
    socketIds.map(socket => anchors[socket]),
    socketIds.map((_, i) => THREAD_COLORS[socketLine[i].kind]),
  );
  const props = new ThreadProps();
  group.add(highlights.group, props.group);

  const recorder = new PathRecorder(THREAD_CAPACITY);
  let available: ReadonlySet<ConnectionId> = new Set();
  let carrying: Line | null = null;
  let now = 0;
  let laid = 0;
  let stepIndex = 0;
  let popStartedAt = -10;

  const tip = new Vector3();
  const lastTip = new Vector3();
  const snapFrom = new Vector3();
  const scratch = new Vector3();
  const lifted = new Vector3();
  const promptCache = new Map<string, ThreadPrompt>();

  const drape: Drape = (t, gap, p) => {
    const length = Math.hypot(p[0], p[1], p[2]) || 1;
    scratch.set(p[0] / length, p[1] / length, p[2] / length);
    const hang = Math.min(0.2, gap * 0.1) * 4 * t * (1 - t);
    const radius = Math.max(length - hang, world.sampleRadius(scratch) + THREAD_LIFT);
    p[0] = scratch.x * radius; p[1] = scratch.y * radius; p[2] = scratch.z * radius;
  };

  const promptFor = (kind: ThreadPrompt['kind'], socket: SocketId, connection: ConnectionId): ThreadPrompt => {
    const key = `${kind}:${socket}`;
    const cached = promptCache.get(key);
    if (cached) return cached;
    const position = anchors[socket].position;
    const prompt: ThreadPrompt = kind === 'pickup' || kind === 'connect'
      ? { kind, socket, connection, position }
      : { kind, socket, position };
    promptCache.set(key, prompt);
    return prompt;
  };

  const startPulse = (line: Line, instant: boolean) => {
    props.removeOwner(line.index);
    line.length = line.cord.length;
    line.duration = pulseDuration(line.length);
    const speed = line.length / line.duration;
    const t0 = instant ? 0 : now;
    // Lanterns and leaves are scheduled to appear as the pulse head passes.
    const birthAt = (distance: number) => instant ? GROWN : t0 + distance / Math.max(speed, 1e-3) - 0.04;
    if (line.kind === 'lights') props.addLanterns(line.index, line.cord, birthAt);
    if (line.kind === 'root') props.addLeaves(line.index, line.cord, birthAt);
  };

  const finalizeControl = (line: Line, target: SocketId): void => {
    const count = line.rawCount;
    const points = new Float32Array((count + 1) * 3);
    points.set(line.raw.subarray(0, count * 3));
    const end = anchors[target].position;
    points[count * 3] = end.x; points[count * 3 + 1] = end.y; points[count * 3 + 2] = end.z;
    line.final = quantize(simplifyPath(points, count + 1));
  };

  const settle = (line: Line): void => {
    const points = Float32Array.from(line.final);
    line.cord.settle(points, points.length / 3);
  };

  const finish = (line: Line): void => {
    line.status = 'done';
    line.flash = 1;
    const uniforms = line.cord.material.uniforms;
    uniforms.uPulse.value = -1;
    const end = anchors[line.to].position;
    highlights.pop(socketIndex.get(line.to)!, now);
    system.onConnected(line.id, end.clone());
  };

  const trembleAmount = (remaining: number, taut: boolean): number => {
    if (taut) return 0.028 + 0.01 * Math.sin(now * 11);
    return remaining < 0.1 ? (1 - remaining / 0.1) * 0.012 : 0;
  };

  const updateCarrying = (frame: ThreadFrame): void => {
    const line = carrying!;
    if (frame.grounded && !recorder.full) {
      lifted.copy(frame.playerPosition).addScaledVector(frame.playerNormal, THREAD_LIFT);
      // Wading: the cord floats on the water instead of sinking out of sight.
      if (recorder.ready(lifted.x, lifted.y, lifted.z) && world.isWater(lifted)) {
        lifted.multiplyScalar(Math.max(1, (SEA_RADIUS + 0.035) / lifted.length()));
      }
      const before = recorder.length;
      const added = recorder.record(lifted.x, lifted.y, lifted.z, drape);
      if (added) {
        laid += recorder.length - before;
        line.cord.commit(recorder.points, recorder.count);
        const index = Math.floor(laid / STEP_DISTANCE);
        if (index > stepIndex) { stepIndex = index; system.onStep(index, line.kind); }
      }
    }
    const source = anchors[line.from].position;
    const popping = (now - popStartedAt) / POP_TIME;
    if (popping < 1) {
      // The thread end flicks from the socket to the spool, overshooting a hair.
      const k = easeOutBack(popping);
      tip.lerpVectors(source, tip, k);
    }
    lastTip.copy(tip);
    const span = Math.hypot(tip.x - recorder.lastX(), tip.y - recorder.lastY(), tip.z - recorder.lastZ());
    const taut = recorder.full;
    const sag = popping < 1 ? 0 : liveSag(Math.min(span, MAX_TIP_SPAN), recorder.remaining, taut);
    line.cord.setTail(recorder.points, recorder.count, tip.x, tip.y, tip.z, sag, trembleAmount(recorder.remaining, taut), now);
    // A pulse of light warns that the spool is nearly empty; it throbs when taut.
    const warning = taut ? 0.2 + 0.14 * Math.sin(now * 14) : recorder.remaining < 0.15 ? (1 - recorder.remaining / 0.15) * 0.14 * (0.5 + 0.5 * Math.sin(now * 7)) : 0;
    line.cord.material.uniforms.uFlash.value = warning;
  };

  const updateSnapping = (line: Line): void => {
    const u = (now - line.startedAt) / SNAP_TIME;
    const target = anchors[line.to].position;
    if (u >= 1) {
      finalizeControl(line, line.to);
      settle(line);
      line.status = 'pulsing';
      line.startedAt = now;
      startPulse(line, false);
      return;
    }
    const e = easeOutCubic(u);
    tip.lerpVectors(snapFrom, target, e);
    const span = Math.hypot(tip.x - line.raw[(line.rawCount - 1) * 3], tip.y - line.raw[(line.rawCount - 1) * 3 + 1], tip.z - line.raw[(line.rawCount - 1) * 3 + 2]);
    line.cord.setTail(line.raw, line.rawCount, tip.x, tip.y, tip.z, liveSag(span, 0.5, false) * (1 - e), 0, now);
  };

  const updatePulse = (line: Line): void => {
    const u = (now - line.startedAt) / line.duration;
    if (u >= 1) { finish(line); return; }
    line.cord.material.uniforms.uPulse.value = u * line.length;
  };

  const updateReel = (line: Line): void => {
    const u = (now - line.startedAt) / line.duration;
    const uniforms = line.cord.material.uniforms;
    if (u >= 1) {
      line.cord.clear();
      line.status = 'idle';
      return;
    }
    uniforms.uClip.value = line.length * (1 - u * u);
    uniforms.uReel.value = 1;
  };

  const refreshModes = (): void => {
    for (let i = 0; i < socketIds.length; i++) {
      const line = socketLine[i];
      let mode: number = SocketMode.dim;
      if (line.status === 'done' || line.status === 'pulsing' || line.status === 'snapping') mode = SocketMode.connected;
      else if (carrying) {
        if (line === carrying) mode = socketIsSource[i] ? SocketMode.held : SocketMode.target;
      } else if (socketIsSource[i] && line.status === 'idle' && available.has(line.id)) mode = SocketMode.source;
      highlights.modes[i] = mode;
    }
  };

  const clearAll = (): void => {
    carrying = null;
    recorder.clear();
    props.clear();
    for (const line of lines) {
      line.cord.clear();
      line.status = 'idle'; line.final = []; line.raw = new Float32Array(0); line.rawCount = 0; line.flash = 0; line.length = 0;
    }
  };

  const system: ThreadSystem = {
    group,
    get carrying() { return carrying ? carrying.id : null; },
    get carryingKind() { return carrying ? carrying.kind : null; },
    get remaining() { return carrying ? recorder.remaining : 1; },
    get taut() { return !!carrying && recorder.full; },
    get laidDistance() { return laid; },
    get connecting() {
      return lines.find(line => line.status === 'snapping' || line.status === 'pulsing')?.id ?? null;
    },
    setAvailable(ids) { available = ids; },
    prompt(playerPosition) {
      let best: ThreadPrompt | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < socketIds.length; i++) {
        const socket = socketIds[i];
        const position = anchors[socket].position;
        const distance = position.distanceTo(playerPosition);
        if (distance > REACH) continue;
        const line = socketLine[i];
        let prompt: ThreadPrompt;
        let priority: number;
        if (line.status === 'done' || line.status === 'pulsing' || line.status === 'snapping') continue;
        if (carrying) {
          if (line === carrying) {
            if (socketIsSource[i]) continue;
            prompt = promptFor('connect', socket, line.id); priority = 3;
          } else { prompt = promptFor('mismatch', socket, line.id); priority = 1; }
        } else if (socketIsSource[i] && line.status === 'idle' && available.has(line.id)) {
          prompt = promptFor('pickup', socket, line.id); priority = 2;
        } else { prompt = promptFor('inactive', socket, line.id); priority = 1; }
        // Higher priority wins even when farther; within a priority the nearest does.
        const score = priority * 10 - distance;
        if (score > bestScore) { best = prompt; bestScore = score; }
      }
      return best;
    },
    interact(prompt) {
      const index = socketIndex.get(prompt.socket);
      if (prompt.kind === 'pickup') {
        const line = lineById.get(prompt.connection);
        if (carrying || !line || line.status !== 'idle' || !available.has(line.id)) return false;
        carrying = line;
        line.status = 'carrying';
        line.cord.clear();
        const source = anchors[line.from].position;
        recorder.begin(source.x, source.y, source.z);
        popStartedAt = now;
        tip.copy(source); lastTip.copy(source);
        line.cord.commit(recorder.points, recorder.count);
        line.cord.setTail(recorder.points, recorder.count, source.x, source.y, source.z, 0, 0, now);
        if (index !== undefined) highlights.pop(index, now);
        return true;
      }
      if (prompt.kind === 'connect') {
        const line = carrying;
        if (!line || line.id !== prompt.connection) return false;
        carrying = null;
        line.cord.material.uniforms.uFlash.value = 0;
        line.status = 'snapping';
        line.startedAt = now;
        line.rawCount = recorder.count;
        line.raw = recorder.points.slice(0, recorder.count * 3);
        snapFrom.copy(lastTip);
        recorder.clear();
        if (index !== undefined) highlights.pop(index, now);
        system.onSnap?.(line.id, anchors[line.to].position.clone());
        return true;
      }
      if (index !== undefined) highlights.reject(index, now);
      return false;
    },
    reel() {
      const line = carrying;
      if (!line) return;
      carrying = null;
      line.cord.material.uniforms.uFlash.value = 0;
      line.status = 'reeling';
      line.startedAt = now;
      line.length = line.cord.length;
      line.duration = reelDuration(line.length);
      recorder.clear();
      const index = socketIndex.get(line.from);
      if (index !== undefined) highlights.pop(index, now);
    },
    movementScale(position, direction) {
      if (!carrying || !recorder.full) return 1;
      return tetherScale(
        position.x, position.y, position.z, recorder.lastX(), recorder.lastY(), recorder.lastZ(),
        direction.x, direction.y, direction.z,
      );
    },
    update(frame: ThreadFrame) {
      now = frame.time;
      threadClock.value = now;
      if (frame.spoolTip) tip.copy(frame.spoolTip);
      else tip.copy(frame.playerPosition).addScaledVector(frame.playerNormal, 0.6);
      if (carrying) updateCarrying(frame);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        switch (line.status) {
          case 'snapping': updateSnapping(line); break;
          case 'pulsing': updatePulse(line); break;
          case 'reeling': updateReel(line); break;
          default: break;
        }
        if (line.flash > 0) {
          line.flash = Math.max(0, line.flash - frame.dt * 1.4);
          line.cord.material.uniforms.uFlash.value = line.flash;
        }
      }
      refreshModes();
      highlights.update(now, frame.dt);
      props.update(now);
    },
    onConnected: () => {},
    onStep: () => {},
    restore(save: ThreadSave | null) {
      system.reset();
      for (const thread of save?.threads ?? []) {
        const line = lineById.get(thread.id);
        const values = thread.points;
        if (!line || !Array.isArray(values) || values.length < 6 || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) continue;
        const count = Math.floor(values.length / 3);
        line.final = values.slice(0, count * 3);
        settle(line);
        line.length = line.cord.length;
        line.status = 'done';
        startPulse(line, true);
      }
    },
    serialize(): ThreadSave {
      return {
        version: 1,
        threads: lines.filter(line => line.status === 'done').map(line => ({ id: line.id, points: line.final.slice() })),
      };
    },
    reset() { clearAll(); },
  };
  refreshModes();
  highlights.update(0, 1);
  // DEV-only inspection handle for playtests (screenshots / eval steps).
  if (import.meta.env?.DEV && typeof globalThis !== 'undefined') {
    (globalThis as unknown as { __unspoolThread: unknown }).__unspoolThread = {
      system,
      cord: (id: string) => { const c = lineById.get(id as ConnectionId)!.cord; const a = c.geometry.getAttribute('position'); const out: number[][] = []; for (let r = 0; r < c.rings; r += 4) out.push([r, +c.along[r].toFixed(2), +c.centers[r*3].toFixed(2), +c.centers[r*3+1].toFixed(2), +c.centers[r*3+2].toFixed(2), +a.getX(r*7).toFixed(2), +a.getY(r*7).toFixed(2), +a.getZ(r*7).toFixed(2)]); return { drawRange: c.geometry.drawRange, out }; },
      info: () => ({
        carrying: carrying?.id ?? null, recorder: { count: recorder.count, length: recorder.length, last: [recorder.lastX(), recorder.lastY(), recorder.lastZ()] },
        lines: lines.map(line => ({ id: line.id, status: line.status, rings: line.cord.rings, committed: line.cord.committed, length: line.cord.length, first: Array.from(line.cord.centers.slice(0, 3)), lastRing: Array.from(line.cord.centers.slice(Math.max(0, line.cord.rings - 1) * 3, Math.max(0, line.cord.rings - 1) * 3 + 3)) })),
        tip: tip.toArray(), props: { lanterns: props.lanternTotal, leaves: props.leafTotal },
      }),
    };
  }
  return system;
}
