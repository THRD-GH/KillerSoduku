/**
 * Draws the app icons and writes them as PNGs.
 *
 *   node tools/make-icons.ts
 *
 * Everything here — rasteriser and PNG encoder — is written out rather than
 * pulled from a package, so building the icons needs nothing but Node.
 * Rendered at 3x and averaged down, which is enough antialiasing for flat
 * geometry like this.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SS = 3; // supersampling factor

type RGBA = [number, number, number, number];

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }

  blend(x: number, y: number, [r, g, b, a]: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const src = a / 255;
    const dst = (this.px[i + 3] / 255) * (1 - src);
    const out = src + dst;
    if (out <= 0) return;
    this.px[i] = (r * src + this.px[i] * dst) / out;
    this.px[i + 1] = (g * src + this.px[i + 1] * dst) / out;
    this.px[i + 2] = (b * src + this.px[i + 2] * dst) / out;
    this.px[i + 3] = out * 255;
  }

  rect(x: number, y: number, w: number, h: number, colour: RGBA): void {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) this.blend(xx, yy, colour);
    }
  }

  /** Rounded rectangle, filled. */
  roundedRect(x: number, y: number, w: number, h: number, r: number, colour: RGBA): void {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
        const dx = Math.max(x + r - xx - 0.5, 0, xx + 0.5 - (x + w - r));
        const dy = Math.max(y + r - yy - 0.5, 0, yy + 0.5 - (y + h - r));
        if (dx * dx + dy * dy <= r * r) this.blend(xx, yy, colour);
      }
    }
  }

  /**
   * A stroked line with round caps, rasterised by distance to the segment.
   * Supersampling does the antialiasing, so a hard in/out test is enough.
   */
  line(x1: number, y1: number, x2: number, y2: number, thickness: number, colour: RGBA): void {
    const r = thickness / 2;
    const minX = Math.floor(Math.min(x1, x2) - r);
    const maxX = Math.ceil(Math.max(x1, x2) + r);
    const minY = Math.floor(Math.min(y1, y2) - r);
    const maxY = Math.ceil(Math.max(y1, y2) + r);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x1;
        const py = y + 0.5 - y1;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
        const ox = px - t * dx;
        const oy = py - t * dy;
        if (ox * ox + oy * oy <= r * r) this.blend(x, y, colour);
      }
    }
  }

  /** A polyline in a unit box, scaled into place — how the figures are drawn. */
  path(
    points: [number, number][],
    x: number,
    y: number,
    w: number,
    h: number,
    thickness: number,
    colour: RGBA,
  ): void {
    for (let i = 1; i < points.length; i++) {
      this.line(
        x + points[i - 1][0] * w,
        y + points[i - 1][1] * h,
        x + points[i][0] * w,
        y + points[i][1] * h,
        thickness,
        colour,
      );
    }
  }

  /** Dashed rectangle outline — the visual signature of a killer cage. */
  dashedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    thickness: number,
    dash: number,
    gap: number,
    colour: RGBA,
  ): void {
    const run = (fromX: number, fromY: number, dirX: number, dirY: number, len: number): void => {
      let travelled = 0;
      while (travelled < len) {
        const step = Math.min(dash, len - travelled);
        const sx = fromX + dirX * travelled;
        const sy = fromY + dirY * travelled;
        this.rect(
          dirX ? sx : sx - thickness / 2,
          dirY ? sy : sy - thickness / 2,
          dirX ? step : thickness,
          dirY ? step : thickness,
          colour,
        );
        travelled += dash + gap;
      }
    };
    run(x, y, 1, 0, w);
    run(x, y + h, 1, 0, w);
    run(x, y, 0, 1, h);
    run(x + w, y, 0, 1, h);
  }

  /** Average the supersampled buffer down to the final size. */
  downsample(factor: number): Canvas {
    const out = new Canvas(this.w / factor, this.h / factor);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const i = ((y * factor + sy) * this.w + (x * factor + sx)) * 4;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
            a += this.px[i + 3];
          }
        }
        const n = factor * factor;
        const i = (y * out.w + x) * 4;
        out.px[i] = r / n;
        out.px[i + 1] = g / n;
        out.px[i + 2] = b / n;
        out.px[i + 3] = a / n;
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ PNG out

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(canvas: Canvas): Buffer {
  const stride = canvas.w * 4;
  // Each scanline is prefixed with its filter type; 0 means none.
  const raw = Buffer.alloc((stride + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(canvas.px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0);
  ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- the artwork

/* The board's own palette: cream stock, ink rules, one ochre wash. */
const STOCK: RGBA = [250, 246, 236, 255];
const INK: RGBA = [22, 18, 12, 255];
const RULE: RGBA = [168, 158, 141, 255];
const CAGE: RGBA = [110, 102, 90, 255];
const WASH: RGBA = [190, 150, 60, 90];

/**
 * Figures as polylines in a unit box. Only the ones the icon uses are here —
 * there is no font to fall back on, and a seven-segment stand-in would look
 * like a calculator rather than a printed puzzle.
 */
const FIGURES: Record<string, [number, number][][]> = {
  '1': [
    [
      [0.16, 0.24],
      [0.46, 0.04],
      [0.46, 0.96],
    ],
  ],
  '5': [
    [
      [0.82, 0.05],
      [0.26, 0.05],
      [0.2, 0.42],
      [0.46, 0.34],
      [0.74, 0.44],
      [0.8, 0.68],
      [0.62, 0.9],
      [0.3, 0.94],
      [0.14, 0.84],
    ],
  ],
  '7': [
    [
      [0.12, 0.06],
      [0.86, 0.06],
      [0.42, 0.96],
    ],
  ],
};

const figure = (
  c: Canvas,
  glyph: string,
  x: number,
  y: number,
  w: number,
  h: number,
  thickness: number,
  colour: RGBA,
): void => {
  for (const stroke of FIGURES[glyph] ?? []) c.path(stroke, x, y, w, h, thickness, colour);
};

interface Ink {
  stock: RGBA;
  ink: RGBA;
  rule: RGBA;
  cage: RGBA;
  wash: RGBA;
}

const DAY: Ink = { stock: STOCK, ink: INK, rule: RULE, cage: CAGE, wash: WASH };
const NIGHT: Ink = {
  stock: [20, 18, 15, 255],
  ink: [239, 231, 216, 255],
  rule: [74, 66, 56, 255],
  cage: [150, 140, 122, 255],
  wash: [214, 178, 94, 70],
};

/** The frame every design sits in: heavy ink around the cells. */
const frameRect = (c: Canvas, x: number, y: number, side: number, t: number, colour: RGBA): void => {
  c.rect(x - t / 2, y - t / 2, side + t, t, colour);
  c.rect(x - t / 2, y + side - t / 2, side + t, t, colour);
  c.rect(x - t / 2, y - t / 2, t, side + t, colour);
  c.rect(x + side - t / 2, y - t / 2, t, side + t, colour);
};

/**
 * A cage outline with the top-left corner cut out for its total — the detail
 * that says killer sudoku rather than sudoku, and the same one the board draws.
 */
const notchedCage = (
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  notch: number,
  t: number,
  colour: RGBA,
): void => {
  c.line(x + notch, y, x + w, y, t, colour);
  c.line(x + w, y, x + w, y + h, t, colour);
  c.line(x + w, y + h, x, y + h, t, colour);
  c.line(x, y + h, x, y + notch * 0.7, t, colour);
};

const total = (c: Canvas, x: number, y: number, h: number, t: number, colour: RGBA): void => {
  const w = h * 0.5;
  figure(c, '1', x, y, w, h, t, colour);
  figure(c, '5', x + w * 1.3, y, w, h, t, colour);
};

type Design = (c: Canvas, S: number, pad: number, ink: Ink) => void;

/**
 * Each design draws inside a square already filled with the stock colour.
 * `pad` is the share of the canvas left as margin: bigger for maskable icons,
 * whose corners get cropped to whatever shape the launcher wants.
 */
const DESIGNS: Record<string, Design> = {
  /* A: two cells, a cage over the top pair, one answer written in. */
  corner: (c, S, pad, ink) => {
    const margin = S * pad;
    const grid = S - margin * 2;
    const cell = grid / 2;
    const frame = Math.max(2, S * 0.03);
    const hair = Math.max(1, S * 0.012);

    c.rect(margin, margin + cell, cell, cell, ink.wash);
    c.rect(margin + cell - hair / 2, margin, hair, grid, ink.rule);
    c.rect(margin, margin + cell - hair / 2, grid, hair, ink.rule);
    frameRect(c, margin, margin, grid, frame, ink.ink);

    const inset = cell * 0.14;
    notchedCage(
      c,
      margin + inset,
      margin + inset,
      grid - inset * 2,
      cell - inset * 2,
      cell * 0.5,
      Math.max(2, S * 0.018),
      ink.cage,
    );
    total(c, margin + inset + cell * 0.02, margin + inset - cell * 0.02, cell * 0.3, Math.max(2, S * 0.02), ink.ink);

    const h = cell * 0.56;
    figure(c, '7', margin + (cell - h * 0.62) / 2, margin + cell + (cell - h) / 2, h * 0.62, h, Math.max(3, S * 0.042), ink.ink);
  },

  /* B: the cage total alone, big, in a cage that fills the tile. */
  total: (c, S, pad, ink) => {
    const margin = S * pad;
    const side = S - margin * 2;
    frameRect(c, margin, margin, side, Math.max(2, S * 0.03), ink.ink);
    const inset = side * 0.13;
    notchedCage(
      c,
      margin + inset,
      margin + inset,
      side - inset * 2,
      side - inset * 2,
      side * 0.34,
      Math.max(3, S * 0.028),
      ink.cage,
    );
    const h = side * 0.46;
    total(c, margin + side * 0.29, margin + side * 0.28, h, Math.max(4, S * 0.055), ink.ink);
  },

  /* C: nine cells, one cage, no figures at all. */
  grid: (c, S, pad, ink) => {
    const margin = S * pad;
    const grid = S - margin * 2;
    const cell = grid / 3;
    const hair = Math.max(1, S * 0.01);

    c.rect(margin + cell, margin, cell, cell, ink.wash);
    for (let i = 1; i < 3; i++) {
      c.rect(margin + i * cell - hair / 2, margin, hair, grid, ink.rule);
      c.rect(margin, margin + i * cell - hair / 2, grid, hair, ink.rule);
    }
    frameRect(c, margin, margin, grid, Math.max(2, S * 0.028), ink.ink);

    const inset = cell * 0.16;
    notchedCage(
      c,
      margin + inset,
      margin + cell + inset,
      cell * 2 - inset * 2,
      cell * 2 - inset * 2,
      cell * 0.55,
      Math.max(2, S * 0.016),
      ink.cage,
    );
    total(c, margin + inset + cell * 0.04, margin + cell + inset - cell * 0.04, cell * 0.34, Math.max(2, S * 0.022), ink.ink);
  },

  /* D: one figure, as large as the tile allows, with a cage bracket. */
  digit: (c, S, pad, ink) => {
    const margin = S * pad;
    const side = S - margin * 2;
    frameRect(c, margin, margin, side, Math.max(2, S * 0.03), ink.ink);
    const inset = side * 0.12;
    const t = Math.max(2, S * 0.022);
    // Just the corner of a cage, top-left, with its total.
    c.line(margin + inset + side * 0.3, margin + inset, margin + inset + side * 0.62, margin + inset, t, ink.cage);
    c.line(margin + inset, margin + inset + side * 0.22, margin + inset, margin + inset + side * 0.55, t, ink.cage);
    total(c, margin + inset + side * 0.02, margin + inset - side * 0.03, side * 0.24, Math.max(3, S * 0.026), ink.ink);

    const h = side * 0.62;
    figure(c, '7', margin + side * 0.42 - (h * 0.62) / 2, margin + side * 0.36, h * 0.62, h, Math.max(4, S * 0.06), ink.ink);
  },
};

function drawIcon(
  size: number,
  pad: number,
  rounded: boolean,
  design = 'corner',
  ink: Ink = DAY,
): Canvas {
  const c = new Canvas(size * SS, size * SS);
  const S = size * SS;
  if (rounded) c.roundedRect(0, 0, S, S, S * 0.22, ink.stock);
  else c.rect(0, 0, S, S, ink.stock);
  DESIGNS[design](c, S, pad, ink);
  return c.downsample(SS);
}

/** A coarse look at what the artwork actually reads like at a given size. */
function preview(canvas: Canvas, cols = 56): void {
  const step = canvas.w / cols;
  const ramp = ' .:-=+*#%@';
  for (let y = 0; y < canvas.h; y += step * 2) {
    let line = '';
    for (let x = 0; x < canvas.w; x += step) {
      const i = (Math.floor(y) * canvas.w + Math.floor(x)) * 4;
      const lum = (canvas.px[i] * 0.3 + canvas.px[i + 1] * 0.59 + canvas.px[i + 2] * 0.11) / 255;
      const alpha = canvas.px[i + 3] / 255;
      line += ramp[Math.min(ramp.length - 1, Math.round((1 - lum) * alpha * (ramp.length - 1)))];
    }
    console.log(line);
  }
}

const out = join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });

const targets: [string, number, number, boolean][] = [
  // name, size, padding, rounded corners
  ['icon-192.png', 192, 0.14, true],
  ['icon-512.png', 512, 0.14, true],
  // Maskable icons are cropped by the launcher, so keep well inside the safe area.
  ['icon-maskable-512.png', 512, 0.26, false],
  ['apple-touch-icon.png', 180, 0.12, false],
];

for (const [name, size, pad, rounded] of targets) {
  const png = encodePNG(drawIcon(size, pad, rounded));
  writeFileSync(join(out, name), png);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
console.log('\nwrote public/icons/');

// `node tools/make-icons.ts --preview` shows how it holds up small, which is
// the only size that decides whether an icon works.
if (process.argv.includes('--preview')) {
  for (const size of [48, 96]) {
    console.log(`\n--- ${size}px ---`);
    preview(drawIcon(size, 0.14, true));
  }
}

/*
 * `node tools/make-icons.ts --options <dir>` renders every design at the sizes
 * that matter, for choosing between them.
 */
const optionsAt = process.argv.indexOf('--options');
if (optionsAt >= 0) {
  const dir = process.argv[optionsAt + 1];
  mkdirSync(dir, { recursive: true });
  for (const design of Object.keys(DESIGNS)) {
    for (const [suffix, ink] of [
      ['', DAY],
      ['-night', NIGHT],
    ] as const) {
      for (const size of [48, 96, 192]) {
        const png = encodePNG(drawIcon(size, 0.14, true, design, ink));
        writeFileSync(join(dir, `${design}${suffix}-${size}.png`), png);
      }
    }
  }
  console.log(`wrote option sheets to ${dir}`);
}
