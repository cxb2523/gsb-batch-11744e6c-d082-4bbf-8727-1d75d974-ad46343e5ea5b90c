// Metres east and south of Charing Cross, as src/lib/network.ts has it
const ORIGIN = { lat: 51.5074, lon: -0.1278 };
const KX = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const KY = 110_574;

export const project = ([lon, lat]) => ({ x: (lon - ORIGIN.lon) * KX, y: (ORIGIN.lat - lat) * KY });

export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export const round = (n, places = 5) => Math.round(n * 10 ** places) / 10 ** places;

/** Douglas-Peucker on projected points, keeping both ends */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  const length = distance(a, b) || 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const off = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
    if (off > worst) [worst, index] = [off, i];
  }
  if (worst <= tolerance) return [a, b];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance)
  ];
}
