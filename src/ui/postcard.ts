import { THREAD_COLORS } from '../chapter/data';

/** Postcard capture and composition. `snapshotCanvas` must run in the same task
 * as the WebGL render (the drawing buffer is not preserved), after which the
 * copy is a plain 2D canvas that can be composed and saved at any time. */

export interface PostcardMeta { title: string; date: string; colors: string[] }
export type PostcardPhoto = HTMLCanvasElement | ImageBitmap;

export const POSTCARD_WIDTH = 1800;
export const POSTCARD_HEIGHT = 1240;

const INK = '#2a2c3a';
const CARD = '#f6f1e4';
const SEAL = '#e8505b';
const SERIF = `'Songti SC', 'Hiragino Mincho ProN', 'Noto Serif CJK SC', 'Apple SD Gothic Neo', Georgia, serif`;
const HAND = `'Kaiti SC', 'STKaiti', 'Hiragino Mincho ProN', 'Apple SD Gothic Neo', 'Bradley Hand', Georgia, serif`;

/** Copy the live game canvas into a 2D canvas. Call right after rendering. */
export function snapshotCanvas(source: HTMLCanvasElement, maxEdge = 1800): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(1, source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function decodePhoto(image: HTMLCanvasElement | Blob): Promise<PostcardPhoto> {
  return image instanceof Blob ? createImageBitmap(image) : image;
}

/** Small deterministic generator so the paper grain is stable between renders. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawStamp(colors: string[]): HTMLCanvasElement {
  const width = 270, height = 320, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fbf7ec';
  context.fillRect(0, 0, width, height);
  // Perforated edge: punch half-circles out along every side.
  context.globalCompositeOperation = 'destination-out';
  const step = 27;
  for (let x = step / 2; x < width; x += step) { for (const y of [0, height]) { context.beginPath(); context.arc(x, y, 8.5, 0, Math.PI * 2); context.fill(); } }
  for (let y = step / 2; y < height; y += step) { for (const x of [0, width]) { context.beginPath(); context.arc(x, y, 8.5, 0, Math.PI * 2); context.fill(); } }
  context.globalCompositeOperation = 'source-over';
  context.strokeStyle = INK; context.lineWidth = 3; context.strokeRect(24, 24, width - 48, height - 48);
  // A little planet wrapped in the thread colors.
  const cx = width / 2, cy = 142;
  context.fillStyle = '#ece6d8'; context.strokeStyle = INK; context.lineWidth = 5;
  context.beginPath(); context.arc(cx, cy, 68, 0, Math.PI * 2); context.fill(); context.stroke();
  context.lineCap = 'round';
  const palette = colors.length ? colors : Object.values(THREAD_COLORS);
  palette.slice(0, 5).forEach((color, index, list) => {
    const start = (index / list.length) * Math.PI * 2 - Math.PI / 2, end = start + (Math.PI * 2) / list.length - .16;
    context.strokeStyle = INK; context.lineWidth = 15;
    context.beginPath(); context.ellipse(cx, cy, 98, 28, -.42, start, end); context.stroke();
    context.strokeStyle = color; context.lineWidth = 9;
    context.beginPath(); context.ellipse(cx, cy, 98, 28, -.42, start, end); context.stroke();
  });
  context.fillStyle = INK; context.textAlign = 'center';
  context.font = `800 30px ${SERIF}`; context.fillText('YARN PLANET', cx, 258);
  context.fillStyle = SEAL; context.font = `900 26px ${SERIF}`; context.fillText('毛线', cx, 292);
  return canvas;
}

/** Compose the finished postcard: photo with taped corners, title, date, a
 * thread flourish in the colors the player connected, a stamp and a postmark. */
export function composePostcard(photo: PostcardPhoto, meta: PostcardMeta): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD_WIDTH; canvas.height = POSTCARD_HEIGHT;
  const context = canvas.getContext('2d')!;
  const W = POSTCARD_WIDTH, H = POSTCARD_HEIGHT;
  const palette = meta.colors.length ? meta.colors : Object.values(THREAD_COLORS);

  // Card paper with faint grain and an ink hairline.
  roundRect(context, 6, 6, W - 12, H - 12, 30);
  context.fillStyle = CARD; context.fill();
  context.save(); context.clip();
  const next = random(7);
  for (let i = 0; i < 1400; i++) { context.fillStyle = `rgba(90, 80, 60, ${.02 + next() * .04})`; context.fillRect(next() * W, next() * H, 2 + next() * 3, 2 + next() * 3); }
  context.restore();
  roundRect(context, 6, 6, W - 12, H - 12, 30);
  context.strokeStyle = 'rgba(42, 44, 58, .55)'; context.lineWidth = 3; context.stroke();

  // Photo, center-cropped to fill its frame.
  const frame = { x: 84, y: 84, width: W - 168, height: 900 };
  const sourceWidth = photo.width || 1, sourceHeight = photo.height || 1;
  const scale = Math.max(frame.width / sourceWidth, frame.height / sourceHeight);
  const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
  context.save();
  context.beginPath(); context.rect(frame.x, frame.y, frame.width, frame.height); context.clip();
  context.drawImage(photo, frame.x + (frame.width - drawWidth) / 2, frame.y + (frame.height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
  context.strokeStyle = INK; context.lineWidth = 6; context.strokeRect(frame.x, frame.y, frame.width, frame.height);

  // Masking tape on the top corners.
  for (const [x, y, angle] of [[frame.x + 30, frame.y + 6, -.62], [frame.x + frame.width - 30, frame.y + 6, .62]] as const) {
    context.save(); context.translate(x, y); context.rotate(angle);
    context.fillStyle = 'rgba(240, 204, 98, .78)'; context.fillRect(-85, -26, 170, 52);
    context.strokeStyle = 'rgba(42, 44, 58, .25)'; context.lineWidth = 2; context.strokeRect(-85, -26, 170, 52);
    context.restore();
  }

  // Title, date and a woven thread flourish across the bottom strip.
  context.textBaseline = 'alphabetic'; context.textAlign = 'left';
  context.fillStyle = INK; context.font = `700 104px ${HAND}`;
  context.fillText(meta.title, 112, 1118, 760);
  context.fillStyle = 'rgba(42, 44, 58, .72)'; context.font = `500 42px ${SERIF}`;
  context.fillText(meta.date, 116, 1180, 760);

  const flourish = new Path2D();
  const x0 = 900, x1 = 1380;
  for (let x = x0; x <= x1; x += 6) { const y = 1100 + Math.sin((x - x0) / 34) * 20; if (x === x0) flourish.moveTo(x, y); else flourish.lineTo(x, y); }
  context.save(); context.lineCap = 'round'; context.lineJoin = 'round';
  context.strokeStyle = INK; context.lineWidth = 16; context.stroke(flourish);
  const grad = context.createLinearGradient(x0, 0, x1, 0);
  palette.forEach((color, index) => {
    const t = palette.length === 1 ? 0 : index / (palette.length - 1);
    grad.addColorStop(Math.max(0, t - .02), color); grad.addColorStop(Math.min(1, t + .02), color);
  });
  context.strokeStyle = grad; context.lineWidth = 9; context.stroke(flourish);
  context.restore();
  context.fillStyle = 'rgba(42, 44, 58, .6)'; context.textAlign = 'center'; context.font = `700 30px ${SERIF}`;
  context.fillText('Yarn Planet · 毛线星球', (x0 + x1) / 2, 1186);

  // Stamp over the photo's lower-right corner, with a postmark across it.
  context.save();
  context.translate(W - 250, 940); context.rotate(.07);
  context.shadowColor = 'rgba(42, 44, 58, .35)'; context.shadowBlur = 18; context.shadowOffsetY = 8;
  context.drawImage(drawStamp(palette), -135, -160);
  context.restore();
  context.save();
  context.translate(W - 300, 960); context.rotate(-.12);
  context.strokeStyle = 'rgba(42, 44, 58, .5)'; context.lineWidth = 5;
  context.beginPath(); context.arc(0, 0, 84, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.arc(0, 0, 66, 0, Math.PI * 2); context.stroke();
  for (let i = 0; i < 4; i++) {
    context.beginPath();
    for (let x = 92; x < 236; x += 8) { const y = -34 + i * 24 + Math.sin(x / 11) * 5; if (x === 92) context.moveTo(x, y); else context.lineTo(x, y); }
    context.stroke();
  }
  context.restore();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('postcard encode failed')), 'image/png'));
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Share the PNG on touch devices that support file sharing, otherwise download it. */
export async function savePostcard(canvas: HTMLCanvasElement, filename: string, title: string): Promise<SaveResult> {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return 'shared'; }
    catch (error) { if ((error as DOMException)?.name === 'AbortError') return 'cancelled'; /* fall through to a download */ }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
