import { Vector3 } from 'three';

/** Canonical chapter-one ids and layout. World, thread, residents, story and
 * copy all key off these ids; never rename one without updating every user. */

export const PLANET_RADIUS = 14;
export const SEA_RADIUS = 13.72;
/** Maximum laid thread length in world units before the spool runs dry. */
export const THREAD_CAPACITY = 36;

/** Unit direction from latitude/longitude in degrees. */
export function dir(lat: number, lon: number): Vector3 {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return new Vector3(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
}

export type DistrictId = 'harbor' | 'workshop' | 'oldstreet' | 'grove' | 'far';
export type ThreadKind = 'power' | 'water' | 'lights' | 'voice' | 'root';

export const THREAD_COLORS: Record<ThreadKind, string> = {
  power: '#ffcf4a', water: '#4fb3e8', lights: '#ff8a5c', voice: '#e8505b', root: '#8fd16a',
};

export interface DistrictDef { id: DistrictId; lat: number; lon: number; /** angular radius in degrees */ extent: number }
export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'harbor', lat: 10, lon: 0, extent: 28 },
  { id: 'workshop', lat: 18, lon: 115, extent: 26 },
  { id: 'oldstreet', lat: 15, lon: -118, extent: 26 },
  { id: 'grove', lat: 72, lon: 0, extent: 16 },
  { id: 'far', lat: -58, lon: 180, extent: 12 },
];

/** Where an anchor should be authored. The world builder places the actual
 * object there and reports the exact world-space socket in `WorldAnchors`. */
export interface AnchorHint { lat: number; lon: number; note: string }

export type SocketId =
  | 'generator' | 'lighthouse' | 'lighthouse_box' | 'crane'
  | 'spring' | 'waterwheel' | 'sluice' | 'garden'
  | 'lamp_a' | 'lamp_b' | 'otto_window' | 'ike_window'
  | 'hub_harbor' | 'hub_workshop' | 'hub_oldstreet'
  | 'root_harbor' | 'root_workshop' | 'root_oldstreet';

export const SOCKET_HINTS: Record<SocketId, AnchorHint & { district: DistrictId }> = {
  generator: { lat: 7.2, lon: -1.4, district: 'harbor', note: 'small hand-crank generator at the root of the pier' },
  lighthouse: { lat: -10.9, lon: -26.2, district: 'harbor', note: 'door/base of the lighthouse on the little cape' },
  lighthouse_box: { lat: -7.8, lon: -28.5, district: 'harbor', note: 'electric box on the lighthouse wall, facing the dock' },
  crane: { lat: 0.6, lon: 13.4, district: 'harbor', note: 'base of the dock crane' },
  spring: { lat: 30.6, lon: 127.3, district: 'workshop', note: 'stone spring at the hill top' },
  waterwheel: { lat: 10.5, lon: 104.4, district: 'workshop', note: 'flume above the waterwheel beside the workshop' },
  sluice: { lat: 12.9, lon: 109, district: 'workshop', note: 'little sluice gate below the wheel' },
  garden: { lat: -2.3, lon: 130.1, district: 'workshop', note: 'dry irrigation trough at the flower terraces' },
  lamp_a: { lat: 4.8, lon: -100.5, district: 'oldstreet', note: 'first street lamp post at the east end of the old street' },
  lamp_b: { lat: 20.6, lon: -137.9, district: 'oldstreet', note: 'last street lamp post at the west end' },
  otto_window: { lat: 21, lon: -112.9, district: 'oldstreet', note: 'Otto’s ground-floor window, facing the alley' },
  ike_window: { lat: 30.3, lon: -116.7, district: 'oldstreet', note: 'Ike’s window across the narrow alley' },
  hub_harbor: { lat: 13.4, lon: -4, district: 'harbor', note: 'lantern hub post in the harbor square, north side' },
  hub_workshop: { lat: 21.8, lon: 112.9, district: 'workshop', note: 'hub post on the north side of the workshop' },
  hub_oldstreet: { lat: 14.2, lon: -103.8, district: 'oldstreet', note: 'hub post near the noodle stall, north side' },
  root_harbor: { lat: 49.1, lon: -0.2, district: 'grove', note: 'great tree root tip pointing to the harbor' },
  root_workshop: { lat: 72.6, lon: 81.4, district: 'grove', note: 'great tree root tip pointing to the workshop' },
  root_oldstreet: { lat: 72.6, lon: -81.5, district: 'grove', note: 'great tree root tip pointing to the old street' },
};

export type ConnectionId = 'h1' | 'h2' | 'w1' | 'w2' | 'o1' | 'o2' | 'fh' | 'fw' | 'fo';

export interface ConnectionDef {
  id: ConnectionId;
  district: DistrictId;
  kind: ThreadKind;
  from: SocketId;
  to: SocketId;
  requires: readonly ConnectionId[];
  /** Revival wave radius (world units along the surface) centered on `to`. */
  revive: number;
  /** Optional second wave at `from`, for threads that light a whole street. */
  reviveFrom?: number;
}

export const CONNECTIONS: readonly ConnectionDef[] = [
  { id: 'h1', district: 'harbor', kind: 'power', from: 'generator', to: 'lighthouse', requires: [], revive: 11 },
  { id: 'h2', district: 'harbor', kind: 'power', from: 'lighthouse_box', to: 'crane', requires: ['h1'], revive: 9 },
  { id: 'w1', district: 'workshop', kind: 'water', from: 'spring', to: 'waterwheel', requires: ['h1'], revive: 9 },
  { id: 'w2', district: 'workshop', kind: 'water', from: 'sluice', to: 'garden', requires: ['w1'], revive: 8 },
  { id: 'o1', district: 'oldstreet', kind: 'lights', from: 'lamp_a', to: 'lamp_b', requires: ['h1'], revive: 10, reviveFrom: 7 },
  { id: 'o2', district: 'oldstreet', kind: 'voice', from: 'otto_window', to: 'ike_window', requires: ['o1'], revive: 6 },
  { id: 'fh', district: 'grove', kind: 'root', from: 'hub_harbor', to: 'root_harbor', requires: ['h2'], revive: 7 },
  { id: 'fw', district: 'grove', kind: 'root', from: 'hub_workshop', to: 'root_workshop', requires: ['w2'], revive: 7 },
  { id: 'fo', district: 'grove', kind: 'root', from: 'hub_oldstreet', to: 'root_oldstreet', requires: ['o2'], revive: 7 },
];
export const CONNECTION_IDS = CONNECTIONS.map(connection => connection.id);
export const connectionById = (id: ConnectionId): ConnectionDef => CONNECTIONS.find(connection => connection.id === id)!;

export type NpcId = 'wick' | 'marlo' | 'pim' | 'bram' | 'sprout' | 'sol' | 'otto' | 'ike' | 'cat';

export interface NpcPlacement {
  id: NpcId;
  district: DistrictId;
  lat: number;
  lon: number;
  /** Facing hint: a lat/lon the character looks toward at rest. */
  faceLat: number;
  faceLon: number;
  /** The connection that makes this resident appear; absent = present from the start. */
  appearsAfter?: ConnectionId;
  note: string;
}

export const NPC_PLACEMENTS: readonly NpcPlacement[] = [
  { id: 'wick', district: 'harbor', lat: -0.9, lon: -6.9, faceLat: 5.2, faceLon: -7, note: 'stands on the pier near the generator, later walks to the lighthouse' },
  { id: 'marlo', district: 'harbor', lat: 0.7, lon: 10.4, faceLat: 6.8, faceLon: 9.7, appearsAfter: 'h1', note: 'steps off the boat onto the dock' },
  { id: 'pim', district: 'harbor', lat: 15, lon: 7, faceLat: 9.4, faceLon: 9.4, appearsAfter: 'h2', note: 'flies a kite on the harbor square' },
  { id: 'bram', district: 'workshop', lat: 20.8, lon: 105, faceLat: 21, faceLon: 111.5, note: 'at the workshop door, arms crossed' },
  { id: 'sprout', district: 'workshop', lat: 4.5, lon: 131.9, faceLat: 0.2, faceLon: 136, note: 'sits beside the dry flower terraces' },
  { id: 'sol', district: 'oldstreet', lat: 15.7, lon: -96.2, faceLat: 10.5, faceLon: -99.5, note: 'behind the noodle stall' },
  { id: 'otto', district: 'oldstreet', lat: 21.7, lon: -107.2, faceLat: 24.4, faceLon: -112.7, note: 'inside his window, leaning on the sill' },
  { id: 'ike', district: 'oldstreet', lat: 29.2, lon: -123, faceLat: 26.6, faceLon: -117.2, note: 'inside his window, across the alley' },
  { id: 'cat', district: 'harbor', lat: 11, lon: -2, faceLat: 13.7, faceLon: 3.6, note: 'wanders slowly between districts along paths' },
];

/** On the pier, facing the harbor square: the opening camera looks over open water. */
// Mid-pier, just south of Wick: the intro talk faces north (Wick, then the generator)
// with the camera behind over the open pier, not wedged among the generator parts.
export const SPAWN = { lat: -4.8, lon: -6.9, faceLat: 9, faceLon: -6.4 };
export const FAR_HOUSE = { lat: -58, lon: 180 };
export const GREAT_TREE = { lat: 72, lon: 0 };
