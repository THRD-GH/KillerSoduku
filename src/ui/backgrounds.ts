import type { Settings } from '../game/storage.ts';

/**
 * What sits behind the board: a set of patterns the game draws for itself, or
 * a photo of the player's own. Ported from Sudoku Variants so the same six
 * patterns are on offer in every DanDoku game, drawn from the same paths.
 *
 * The patterns are SVG built at load and handed to CSS as data URIs — nothing
 * is downloaded, and they are a few hundred bytes each. A photo is shrunk to
 * fit on a canvas, re-encoded as a JPEG and kept in localStorage on the device
 * it was chosen on; it never leaves.
 */

const svg = (w: number, h: number, body: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`;

/** Deterministic, so a "random" texture is the same texture on every device. */
const seeded = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t = (t + 1831565813) >>> 0;
    let e = Math.imul(t ^ (t >>> 15), 1 | t);
    e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e;
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
  };
};

/** Overlapping fans of waves, the traditional wave-crest pattern. */
function seigaiha(): string {
  const fan = (cx: number, cy: number): string =>
    [18, 14, 10, 6, 2]
      .map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#dbe8ee" stroke-width="1.6"/>`)
      .join('');
  return svg(
    800,
    600,
    `<defs><pattern id="p" width="40" height="20" patternUnits="userSpaceOnUse">
      <rect width="40" height="20" fill="#3979a8"/>
      <circle cx="20" cy="20" r="20" fill="#3979a8"/>${fan(20, 20)}
      <circle cx="0" cy="10" r="20" fill="#3979a8"/>${fan(0, 10)}
      <circle cx="40" cy="10" r="20" fill="#3979a8"/>${fan(40, 10)}
    </pattern></defs><rect width="800" height="600" fill="url(#p)"/>`,
  );
}

/** Interlocking rings — the "seven treasures" lattice. */
function shippo(): string {
  const ring = (cx: number, cy: number): string =>
    `<circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="#17273d" stroke-width="1.4" opacity="0.55"/>`;
  return svg(
    800,
    600,
    `<defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#f4efe5"/>
      ${ring(20, 20)}${ring(0, 0)}${ring(40, 0)}${ring(0, 40)}${ring(40, 40)}
    </pattern></defs><rect width="800" height="600" fill="url(#p)"/>`,
  );
}

/** Woven rush mats with dark cloth borders. */
function tatami(): string {
  return svg(
    800,
    600,
    `<defs>
      <pattern id="w" width="6" height="4" patternUnits="userSpaceOnUse">
        <rect width="6" height="4" fill="#cbb982"/>
        <rect width="6" height="1" y="0" fill="#bda96f"/>
        <rect width="3" height="1" y="2" fill="#d8c893"/>
      </pattern>
      <pattern id="s" width="200" height="300" patternUnits="userSpaceOnUse">
        <rect width="200" height="300" fill="url(#w)"/>
        <rect x="0" y="0" width="4" height="300" fill="#2b3a2f"/>
        <rect x="0" y="0" width="200" height="4" fill="#2b3a2f"/>
      </pattern>
    </defs><rect width="800" height="600" fill="url(#s)"/>`,
  );
}

/** Handmade paper: fibres laid at random across a cream sheet. */
function washi(): string {
  const rnd = seeded(7);
  let fibres = '';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 800;
    const y = rnd() * 600;
    const len = 12 + rnd() * 60;
    const angle = rnd() * Math.PI;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    const opacity = 0.08 + rnd() * 0.18;
    fibres +=
      `<path d="M${x.toFixed(1)} ${y.toFixed(1)} ` +
      `Q${((x + x2) / 2 + (rnd() - 0.5) * 12).toFixed(1)} ${((y + y2) / 2 + (rnd() - 0.5) * 12).toFixed(1)} ` +
      `${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#8a7d62" ` +
      `stroke-width="${(0.6 + rnd() * 1.2).toFixed(1)}" opacity="${opacity.toFixed(2)}"/>`;
  }
  return svg(800, 600, `<rect width="800" height="600" fill="#f1ead9"/>${fibres}`);
}

/** Ink: a few broad brush strokes across a dark wash. */
function sumi(): string {
  const rnd = seeded(3);
  let strokes = '';
  for (let i = 0; i < 7; i++) {
    const y = 40 + rnd() * 520;
    const x1 = -60 + rnd() * 200;
    const x2 = 600 + rnd() * 260;
    const bend = (rnd() - 0.5) * 180;
    strokes +=
      `<path d="M${x1.toFixed(0)} ${y.toFixed(0)} Q400 ${(y + bend).toFixed(0)} ` +
      `${x2.toFixed(0)} ${(y + (rnd() - 0.5) * 60).toFixed(0)}" fill="none" stroke="#f4efe5" ` +
      `stroke-width="${(18 + rnd() * 34).toFixed(0)}" stroke-linecap="round" ` +
      `opacity="${(0.05 + rnd() * 0.08).toFixed(2)}"/>`;
  }
  return svg(
    800,
    600,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2d44"/><stop offset="1" stop-color="#0e1826"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/>${strokes}`,
  );
}

/** The six belts, laid diagonally. */
function obi(): string {
  const bands = ['#fffdfa', '#efc44f', '#6c9a72', '#3979a8', '#8a563b', '#17273d']
    .map((colour, i) => `<rect x="${-300 + i * 220}" y="-400" width="220" height="1400" fill="${colour}"/>`)
    .join('');
  return svg(
    800,
    600,
    `<rect width="800" height="600" fill="#17273d"/><g transform="rotate(-28 400 300)">${bands}</g>`,
  );
}

export interface BackgroundChoice {
  id: string;
  name: string;
  image: string;
}

export const BACKGROUNDS: BackgroundChoice[] = [
  { id: 'seigaiha', name: 'Seigaiha', image: seigaiha() },
  { id: 'shippo', name: 'Shippō', image: shippo() },
  { id: 'tatami', name: 'Tatami', image: tatami() },
  { id: 'washi', name: 'Washi', image: washi() },
  { id: 'sumi', name: 'Sumi', image: sumi() },
  { id: 'belts', name: 'Obi', image: obi() },
];

const PHOTO_KEY = 'ks:v1:background';

/** The player's own photo, if one has been kept. */
export function customPhoto(): string | null {
  try {
    return localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

export function forgetPhoto(): void {
  try {
    localStorage.removeItem(PHOTO_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** Longest side a photo is kept at. Plenty behind a board; small enough to store. */
const PHOTO_MAX_PX = 1600;

/**
 * Shrink a chosen image to fit and keep it. False when it could not be kept —
 * storage full, or a browser that refuses in private mode.
 */
export async function keepPhoto(file: File): Promise<boolean> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL('image/jpeg', 0.82);
  try {
    localStorage.setItem(PHOTO_KEY, data);
    return true;
  } catch {
    return false;
  }
}

function imageFor(settings: Settings): string | null {
  if (settings.background === 'none') return null;
  if (settings.background === 'custom') return customPhoto();
  return BACKGROUNDS.find((b) => b.id === settings.background)?.image ?? null;
}

/** Put the chosen background behind the page, or take it away. */
export function applyBackground(settings: Settings): void {
  const image = imageFor(settings);
  if (image === null) {
    document.body.classList.remove('has-bg');
    document.body.style.removeProperty('--bg-image');
    document.body.style.removeProperty('--bg-dim');
    return;
  }
  document.body.style.setProperty('--bg-image', `url("${image}")`);
  document.body.style.setProperty('--bg-dim', String(settings.backgroundDim));
  document.body.classList.add('has-bg');
}
