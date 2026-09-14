/*
 * Fireworks above a dojo, for a solved puzzle.
 *
 * Self-contained on purpose — no imports, no stylesheet, nothing Kakuro-shaped
 * — so the other DanDoku games can take the file as it is. It styles its own
 * canvases, takes the dojo's colours from the house tokens every one of them
 * defines, and the one thing it needs from the page, the panel to stand on, is
 * passed in.
 *
 * Three layers, all gone when the show is: a night sky, darkened so the colours
 * read over anything, even a board of dark clue squares; the canvas where the
 * fireworks go off; and in front, the dojo, drawn once, so rockets go up from
 * behind the building and spent sparks fall behind it. The pointer passes
 * straight through all three.
 */

export interface FireworksOptions {
  /**
   * What the show stands on: the panel announcing the win. The dojo is drawn on
   * its top edge and the fireworks go off above and around it. When the panel
   * sits in a stacking context of its own, as an overlay's shade gives it, the
   * show goes in just behind the panel, so no spark covers what it says.
   * Without a panel, or without room above it, the fireworks take the top of
   * the window and the dojo is left out.
   */
  above?: Element | null;
  /** Shell colours. By default a firework palette that reads as light over any theme's shade. */
  colours?: string[];
  /** Draw the dojo. On unless set false. */
  dojo?: boolean;
  /**
   * Darken the sky behind the show to the house night navy. On unless set
   * false: over a board of dark clue squares, even bright sparks were lost.
   */
  sky?: boolean;
  /** Stacking order when the show cannot go behind the panel and has to go over the page. */
  zIndex?: number;
}

type Shell = 'peony' | 'crackle' | 'ring' | 'willow';

interface Cue {
  /** When it goes up, in milliseconds after the show starts. */
  at: number;
  shell: Shell;
  finale?: boolean;
}

interface Rocket {
  at: number;
  /** How long it takes to climb: longer for a higher burst. */
  rise: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  shell: Shell;
  colour: string;
  /** The second colour of a two-tone shell. */
  second: string;
  /** How far its sparks are thrown, in CSS pixels. */
  reach: number;
  burst: boolean;
  /** Where it was last frame, to shed embers along the way it came. */
  lastX: number;
  lastY: number;
}

interface Particle {
  x: number;
  y: number;
  /** In CSS pixels per millisecond. */
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  colour: string;
  /** The share of its speed kept each millisecond. */
  drag: number;
  /** CSS pixels per millisecond squared. */
  gravity: number;
  /** Sheds embers as it falls: a willow's drooping strands. */
  trail: boolean;
  /** Time since it last shed one. */
  shed: number;
  /** Breaks into white specks near the end of its life. */
  crackle: boolean;
  /** Twinkles as it fades. */
  glitter: boolean;
  /** A round spark; otherwise a square speck, which is cheaper, for embers. */
  round: boolean;
}

interface Flash {
  x: number;
  y: number;
  age: number;
  reach: number;
  colour: string;
}

/** Where everything goes, worked out once from the window and the panel. */
export interface Stage {
  width: number;
  height: number;
  /** The dojo's centre, the line it stands on, and its width; null for a show without one. */
  dojo: { cx: number; base: number; w: number } | null;
  /** How far a full-sized shell throws its sparks. */
  reach: number;
  /** How high and how low bursts go over the panel. */
  skyTop: number;
  skyBottom: number;
  /** How wide a band, centred, the bursts spread across. */
  band: number;
  /** Where rockets go up from. */
  launchY: number;
}

const TAU = Math.PI * 2;

/** Bright enough to read as light over any theme's shade: coral, gold, sky, green, rose, violet. */
const PALETTE = ['#ff7a5c', '#ffc857', '#6ec6ff', '#7ee08a', '#ff8fd0', '#b9a2ff'];
const WHITE = '#fff4dc';
const GOLD = '#ffc46b';

/** No rocket climbs flatter than this from the horizontal: 30°. */
export const MIN_CLIMB = Math.PI / 6;

/**
 * The running order: shells of every kind, one or two at a time, then a finale
 * of four going up almost together.
 */
const SHOW: Cue[] = [
  { at: 200, shell: 'peony' },
  { at: 800, shell: 'crackle' },
  { at: 1350, shell: 'ring' },
  { at: 1850, shell: 'willow' },
  { at: 2400, shell: 'peony' },
  { at: 2800, shell: 'crackle' },
  { at: 3300, shell: 'ring' },
  { at: 3380, shell: 'peony' },
  { at: 3900, shell: 'willow' },
  { at: 4600, shell: 'peony', finale: true },
  { at: 4720, shell: 'crackle', finale: true },
  { at: 4840, shell: 'peony', finale: true },
  { at: 4960, shell: 'crackle', finale: true },
];

/** The drag on a shell's sparks, and the heavier drag that makes a willow hang. */
const DRAG = 0.9982;
const WILLOW_DRAG = 0.9971;
/** Gravity on a shell of 120px reach, about 160px/s², and in proportion for others. */
const GRAVITY = 0.00016;
/** How long a burst's flash lasts. */
const FLASH_MS = 220;
/**
 * How much of the sky's glow is rubbed out every sixtieth of a second. Nothing
 * is cleared outright, so each spark leaves a trail fading out behind it.
 */
const TRAIL_FADE = 0.24;
const FRAME_MS = 1000 / 60;
/** A frame longer than this is a tab that was hidden, not time for the sparks to fly. */
const MAX_STEP_MS = 34;
/** Past this many particles nothing sheds embers, to spare a slow phone. */
const MAX_PARTICLES = 2400;
/** The dojo is this tall for each unit of its width. */
const DOJO_HEIGHT = 0.62;
const DOJO_FADE_MS = 400;
/** The night sky comes up as the show starts, and goes with the dojo at the end. */
const SKY_FADE_MS = 500;
/** The house night navy, as the red, green and blue of an rgba(). */
const NIGHT = '10, 17, 30';
/**
 * The show's time is kept frame by frame, capped per frame, so frames that come
 * slowly stretch it out, and a hidden tab draws none at all. Whatever the frames
 * do, a timer takes everything away this long after the start.
 */
const DEADLINE_MS = 15000;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const held = out[i] as T;
    out[i] = out[j] as T;
    out[j] = held;
  }
  return out;
}

function particle(
  fields: Pick<Particle, 'x' | 'y' | 'vx' | 'vy' | 'life' | 'size' | 'colour' | 'drag' | 'gravity'> &
    Partial<Particle>,
): Particle {
  return { age: 0, shed: 0, trail: false, crackle: false, glitter: false, round: true, ...fields };
}

/** Where the dojo, the sky and the launch line go, from the window and the panel. Exported for the tests. */
export function stage(width: number, height: number, options: FireworksOptions): Stage {
  const rect = options.above ? options.above.getBoundingClientRect() : null;
  const floor = rect ? Math.min(rect.top, height) : height;
  const reach = Math.min(Math.max(Math.min(width, height) * 0.28, 80), 190);
  const band = Math.min(width * 0.92, 1100);
  const room = floor - 8;
  if (options.dojo !== false && room >= 150) {
    // As tall as the room allows within reason, and never wider than most of the window.
    const w = Math.min(Math.min(Math.max(room * 0.42, 60), 150) / DOJO_HEIGHT, width * 0.7);
    const roof = floor - w * DOJO_HEIGHT;
    const skyTop = Math.min(reach * 0.5 + 6, roof * 0.45);
    return {
      width,
      height,
      dojo: { cx: width / 2, base: floor, w },
      reach,
      skyTop,
      skyBottom: Math.max(skyTop, roof - reach * 0.3),
      band,
      launchY: floor,
    };
  }
  const skyTop = height * 0.12;
  return {
    width,
    height,
    dojo: null,
    reach: reach * 0.85,
    skyTop,
    skyBottom: Math.max(skyTop, floor * 0.55),
    band,
    launchY: height + 10,
  };
}

/**
 * A rocket for every cue, each climbing in a direction of its own, drawn afresh
 * for every show and never flatter than MIN_CLIMB from the horizontal. Bursts
 * used to be placed first and the rockets aimed at them, and those placed beside
 * a centred panel on a wide screen had rockets flying out almost flat, or
 * downhill, to reach them. Now the direction comes first, and the burst is
 * wherever that direction reaches the height it goes off at.
 *
 * The directions are dealt from shuffled slices of what each rocket is allowed,
 * so they spread across the sky rather than bunch. Exported for the tests.
 */
export function plan(scene: Stage, colours: string[]): Rocket[] {
  const early = SHOW.filter((cue) => !cue.finale);
  const slices = shuffled(early.map((_, i) => (i + 0.5) / early.length));
  const finaleSlices = shuffled([0.12, 0.38, 0.62, 0.88]);
  const left = (scene.width - scene.band) / 2;
  const right = left + scene.band;
  // The furthest a rocket may lean either way: how far across it goes for each pixel it climbs.
  const lean = 1 / Math.tan(MIN_CLIMB);
  let hue = Math.floor(Math.random() * colours.length);
  return SHOW.map((cue) => {
    const slice = (cue.finale ? finaleSlices.shift() : slices.shift()) ?? Math.random();
    // The finale bursts high, where four at once have the room.
    const toY = rand(scene.skyTop, cue.finale ? (scene.skyTop + scene.skyBottom) / 2 : scene.skyBottom);
    // From behind the dojo, or from below the window when there is none.
    const fromX = scene.dojo ? scene.dojo.cx + rand(-0.3, 0.3) * scene.dojo.w : rand(left, right);
    const climb = Math.max(scene.launchY - toY, 1);
    // Leaning no further than the angle allows, nor so far that the burst leaves the band.
    const most = Math.max(0, Math.min(lean, (right - fromX) / climb));
    const least = Math.min(0, Math.max(-lean, (left - fromX) / climb));
    const across = least + (most - least) * Math.min(Math.max(slice + rand(-0.04, 0.04), 0), 1);
    const toX = fromX + across * climb;
    const colour = colours[hue % colours.length] ?? GOLD;
    const second = colours[(hue + 2) % colours.length] ?? WHITE;
    hue += 1;
    const size = cue.finale ? 1.1 : cue.shell === 'ring' ? 0.8 : cue.shell === 'willow' ? 0.9 : 1;
    return {
      at: cue.at,
      rise: Math.min(650 + Math.hypot(toX - fromX, climb) * 0.9, 1150),
      fromX,
      fromY: scene.launchY,
      toX,
      toY,
      shell: cue.shell,
      colour: cue.shell === 'willow' ? GOLD : colour,
      second,
      reach: scene.reach * size,
      burst: false,
      lastX: fromX,
      lastY: scene.launchY,
    };
  });
}

/** A speck shed by a rocket on its way up, or by a willow's strand on its way down. */
function ember(particles: Particle[], x: number, y: number, life: number, gravity: number): void {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push(
    particle({
      x,
      y,
      vx: rand(-0.012, 0.012),
      vy: rand(-0.004, 0.02),
      life,
      size: rand(0.8, 1.3),
      colour: GOLD,
      drag: 0.994,
      gravity: gravity * 0.5,
      round: false,
    }),
  );
}

/** A velocity on a sphere seen side on: most sparks out at the rim, some across the middle, as a real shell looks. */
function sphere(speed: number): { vx: number; vy: number } {
  const angle = rand(0, TAU);
  const lean = rand(-1, 1);
  const across = speed * Math.sqrt(1 - lean * lean);
  return { vx: Math.cos(angle) * across, vy: Math.sin(angle) * across };
}

function burst(particles: Particle[], flashes: Flash[], rocket: Rocket): void {
  const { toX: x, toY: y, reach, colour } = rocket;
  flashes.push({ x, y, age: 0, reach: reach * 0.5, colour });
  const gravity = GRAVITY * (reach / 120);
  // The launch speed that carries a spark about `reach` before its drag stops it.
  const speedFor = (drag: number): number => (reach * -Math.log(drag)) / 0.94;

  switch (rocket.shell) {
    case 'peony': {
      const v0 = speedFor(DRAG);
      for (let i = 0; i < 80; i++) {
        // A quarter of it is a smaller shell inside, in the second colour.
        const inner = i % 4 === 0;
        particles.push(
          particle({
            x,
            y,
            ...sphere(v0 * (inner ? 0.5 : rand(0.94, 1.04))),
            life: rand(1350, 1900),
            size: rand(1.3, 2.1),
            colour: inner ? rocket.second : colour,
            drag: DRAG,
            gravity,
            glitter: !inner && Math.random() < 0.3,
          }),
        );
      }
      break;
    }
    case 'crackle': {
      const v0 = speedFor(DRAG);
      for (let i = 0; i < 64; i++) {
        particles.push(
          particle({
            x,
            y,
            ...sphere(v0 * rand(0.9, 1.02)),
            life: rand(1000, 1400),
            size: rand(1.3, 1.9),
            colour,
            drag: DRAG,
            gravity,
            crackle: true,
          }),
        );
      }
      break;
    }
    case 'ring': {
      const v0 = speedFor(DRAG);
      // A flat ring, tilted, as a ring shell looks from the ground.
      const tilt = rand(-0.6, 0.6);
      const flat = rand(0.35, 0.65);
      for (let i = 0; i < 56; i++) {
        const ax = Math.cos((i / 56) * TAU) * v0;
        const ay = Math.sin((i / 56) * TAU) * v0 * flat;
        particles.push(
          particle({
            x,
            y,
            vx: ax * Math.cos(tilt) - ay * Math.sin(tilt),
            vy: ax * Math.sin(tilt) + ay * Math.cos(tilt),
            life: rand(1300, 1650),
            size: rand(1.4, 2),
            colour,
            drag: DRAG,
            gravity,
          }),
        );
      }
      // And a glittering white heart in the middle of it.
      for (let i = 0; i < 16; i++) {
        particles.push(
          particle({
            x,
            y,
            ...sphere(v0 * 0.28),
            life: rand(700, 1000),
            size: rand(1.1, 1.6),
            colour: WHITE,
            drag: DRAG,
            gravity,
            glitter: true,
          }),
        );
      }
      break;
    }
    case 'willow': {
      const v0 = speedFor(WILLOW_DRAG);
      for (let i = 0; i < 60; i++) {
        particles.push(
          particle({
            x,
            y,
            ...sphere(v0 * rand(0.9, 1.05)),
            life: rand(2500, 3200),
            size: rand(1.2, 1.7),
            colour: GOLD,
            drag: WILLOW_DRAG,
            gravity: gravity * 1.6,
            trail: true,
          }),
        );
      }
      break;
    }
  }
}

/**
 * The dojo, in units of its own width: x from -0.5 to 0.5 across it, y rising
 * from its base as it goes negative. Each solid part is filled on its own —
 * overlapping sub-paths wound opposite ways would cancel under one fill — the
 * walls in paper, the roofs in a wash, the curtain in coral, and everything is
 * then drawn over in ink.
 */
function dojoShapes(): { walls: Path2D[]; roofs: Path2D[]; curtain: Path2D; lines: Path2D } {
  const lines = new Path2D();

  // The stone plinth it stands on, with a step at the front.
  const plinth = new Path2D();
  plinth.rect(-0.42, -0.055, 0.84, 0.055);
  lines.moveTo(-0.09, 0);
  lines.lineTo(-0.09, -0.0275);
  lines.lineTo(0.09, -0.0275);
  lines.lineTo(0.09, 0);

  // The hall: its posts, and the beam across their heads.
  const hall = new Path2D();
  hall.rect(-0.33, -0.25, 0.66, 0.195);
  for (const x of [-0.21, -0.09, 0.09, 0.21]) {
    lines.moveTo(x, -0.055);
    lines.lineTo(x, -0.25);
  }
  lines.moveTo(-0.33, -0.215);
  lines.lineTo(0.33, -0.215);

  // A curtain hung from the beam across the doorway, between the middle posts,
  // split into three the way a noren is.
  const curtain = new Path2D();
  curtain.rect(-0.09, -0.215, 0.18, 0.065);
  for (const x of [-0.03, 0.03]) {
    lines.moveTo(x, -0.19);
    lines.lineTo(x, -0.15);
  }

  // The lower roof, its eaves sagging in the middle and sweeping up at the corners.
  const lowerRoof = new Path2D();
  lowerRoof.moveTo(-0.53, -0.305);
  lowerRoof.quadraticCurveTo(0, -0.215, 0.53, -0.305);
  lowerRoof.quadraticCurveTo(0.36, -0.325, 0.25, -0.4);
  lowerRoof.lineTo(-0.25, -0.4);
  lowerRoof.quadraticCurveTo(-0.36, -0.325, -0.53, -0.305);
  lowerRoof.closePath();
  lines.moveTo(-0.5, -0.322);
  lines.quadraticCurveTo(0, -0.24, 0.5, -0.322);

  // The short wall between the two roofs.
  const band = new Path2D();
  band.rect(-0.2, -0.445, 0.4, 0.045);
  for (const x of [-0.1, 0, 0.1]) {
    lines.moveTo(x, -0.4);
    lines.lineTo(x, -0.445);
  }

  // The upper roof, hipped and gabled, with the gable's triangle under the ridge.
  const upperRoof = new Path2D();
  upperRoof.moveTo(-0.39, -0.46);
  upperRoof.quadraticCurveTo(0, -0.43, 0.39, -0.46);
  upperRoof.quadraticCurveTo(0.25, -0.475, 0.15, -0.585);
  upperRoof.lineTo(-0.15, -0.585);
  upperRoof.quadraticCurveTo(-0.25, -0.475, -0.39, -0.46);
  upperRoof.closePath();
  lines.moveTo(-0.09, -0.505);
  lines.lineTo(0, -0.565);
  lines.lineTo(0.09, -0.505);
  lines.closePath();

  // The ridge's ends turned up.
  lines.moveTo(-0.15, -0.585);
  lines.lineTo(-0.185, -0.62);
  lines.moveTo(0.15, -0.585);
  lines.lineTo(0.185, -0.62);

  return { walls: [plinth, hall, band], roofs: [lowerRoof, upperRoof], curtain, lines };
}

interface DojoColours {
  ink: string;
  /** The walls, so the drawing reads over whatever the shade has dimmed. */
  paper: string;
  /** A wash over the roofs: slate tiles rather than more paper. */
  roof: string;
  /** The curtain in the doorway, the one warm spot on the building. */
  curtain: string;
}

/** Draws the dojo into a context already scaled to its width and moved to its base. */
function drawDojo(context: CanvasRenderingContext2D, w: number, colours: DojoColours): void {
  const { walls, roofs, curtain, lines } = dojoShapes();
  context.fillStyle = colours.paper;
  for (const part of walls) context.fill(part);
  context.fillStyle = colours.roof;
  for (const part of roofs) context.fill(part);
  context.fillStyle = colours.curtain;
  context.fill(curtain);
  context.strokeStyle = colours.ink;
  context.lineWidth = Math.max(1.5, w * 0.0065) / w;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const part of [...walls, ...roofs, curtain]) context.stroke(part);
  context.stroke(lines);
}

/**
 * Starts the show and hands back a way to stop it early. Does nothing when the
 * device asks for reduced motion: a stylesheet can still every CSS animation
 * for that, but a canvas is drawn by script and has to ask for itself.
 */
export function fireworks(options: FireworksOptions = {}): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const sky = document.createElement('canvas');
  const context = sky.getContext('2d');
  if (!context) return () => {};

  const width = window.innerWidth;
  const height = window.innerHeight;
  // Sharp on a phone's dense screen, without paying for more than twice over.
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const scene = stage(width, height, options);

  // Behind the panel when it has a stacking context to go into, so the sparks
  // never cover what it says; otherwise over the whole page.
  const above = options.above ?? null;
  const host = above?.parentElement ?? null;
  const hostStyle = host ? getComputedStyle(host) : null;
  const behind = !!hostStyle && hostStyle.position !== 'static' && hostStyle.zIndex !== 'auto';
  const layer = behind ? -1 : (options.zIndex ?? 60);
  const mount = (node: HTMLElement, style: string): void => {
    node.setAttribute('aria-hidden', 'true');
    node.style.cssText = `position:fixed;${style};pointer-events:none;z-index:${layer}`;
    if (behind && host && above) host.insertBefore(node, above);
    else document.body.append(node);
  };

  // The night sky first, so everything else is in front of it: darkest at the
  // top, where the bursts are, easing off below the line the dojo stands on.
  let night: HTMLElement | null = null;
  if (options.sky !== false) {
    night = document.createElement('div');
    night.className = 'fireworks-sky';
    const edge = Math.round(((scene.dojo ? scene.dojo.base : height * 0.6) / height) * 100);
    mount(
      night,
      `inset:0;opacity:0;` +
        `background:linear-gradient(to bottom, rgba(${NIGHT}, 0.9) 0%, rgba(${NIGHT}, 0.8) ${edge}%, rgba(${NIGHT}, 0.4) 100%)`,
    );
  }

  sky.width = Math.round(width * ratio);
  sky.height = Math.round(height * ratio);
  sky.className = 'fireworks';
  // Sized in CSS pixels, since its own pixels are the window's times the density.
  mount(sky, 'inset:0;width:100%;height:100%');
  context.scale(ratio, ratio);

  let dojo: HTMLCanvasElement | null = null;
  if (scene.dojo) {
    const { cx, base, w } = scene.dojo;
    const canvas = document.createElement('canvas');
    const pen = canvas.getContext('2d');
    if (pen) {
      const tokens = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback;
      // A box just big enough for the building, standing on the panel.
      canvas.width = Math.round(w * 1.12 * ratio);
      canvas.height = Math.round(w * 0.68 * ratio);
      canvas.className = 'fireworks-dojo';
      mount(
        canvas,
        `left:${cx - w * 0.56}px;top:${base - w * 0.66}px;width:${w * 1.12}px;height:${w * 0.68}px;opacity:0`,
      );
      pen.scale(ratio, ratio);
      pen.translate(w * 0.56, w * 0.66);
      pen.scale(w, w);
      // In the theme's own colours, with the accent's pale wash on the roofs
      // and the house coral in the doorway.
      drawDojo(pen, w, {
        ink: token('--text', '#17273d'),
        paper: token('--panel', '#fffdfa'),
        roof: token('--accent-dim', '#dbe8ee'),
        curtain: token('--coral', '#f06951'),
      });
      dojo = canvas;
    }
  }

  const rockets = plan(scene, options.colours?.length ? options.colours : PALETTE);
  const particles: Particle[] = [];
  const flashes: Flash[] = [];

  let frame = 0;
  let deadline = 0;
  /** When the last spark went out and the dojo and sky began to fade; null until then. */
  let fadingSince: number | null = null;
  const start = performance.now();
  let last = start;

  const remove = (): void => {
    night?.remove();
    sky.remove();
    dojo?.remove();
  };
  const stop = (): void => {
    cancelAnimationFrame(frame);
    window.clearTimeout(deadline);
    remove();
  };

  const step = (now: number): void => {
    // A frame's timestamp can fall a moment before the show was started.
    const dt = Math.min(Math.max(now - last, 0), MAX_STEP_MS);
    last = now;
    const elapsed = now - start;

    /*
     * The dojo and the sky fade in and out on the show's own clock, set here
     * every frame. They were CSS transitions, and a transition runs on a clock
     * of its own: measured with the page on screen, both were still at nothing
     * 0.7s in and at 7% after 1.5s, so the building stood half there through
     * most of the show and the sky never darkened enough to matter.
     */
    const out = fadingSince === null ? 0 : now - fadingSince;
    if (dojo) dojo.style.opacity = String(Math.max(0, Math.min(1, elapsed / DOJO_FADE_MS) - out / DOJO_FADE_MS));
    if (night) night.style.opacity = String(Math.max(0, Math.min(1, elapsed / SKY_FADE_MS) - out / SKY_FADE_MS));

    // Rub out some of the last frame rather than all of it: that is the trails.
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = 1;
    context.fillStyle = `rgba(0, 0, 0, ${1 - (1 - TRAIL_FADE) ** (dt / FRAME_MS)})`;
    context.fillRect(0, 0, width, height);
    // Light adds up: where sparks cross, they burn brighter.
    context.globalCompositeOperation = 'lighter';

    let waiting = false;
    for (const rocket of rockets) {
      if (rocket.burst) continue;
      waiting = true;
      const t = (elapsed - rocket.at) / rocket.rise;
      if (t < 0) continue;
      if (t >= 1) {
        rocket.burst = true;
        burst(particles, flashes, rocket);
        continue;
      }
      // Fast off the ground, slowing towards the top.
      const eased = 1 - (1 - t) ** 2.2;
      const x = rocket.fromX + (rocket.toX - rocket.fromX) * eased;
      const y = rocket.fromY + (rocket.toY - rocket.fromY) * eased;
      // Embers every few pixels of the way, so the trail is as full at thirty frames a second as at sixty.
      const gone = Math.hypot(x - rocket.lastX, y - rocket.lastY);
      for (let d = 4; d < gone; d += 4) {
        const share = d / gone;
        ember(
          particles,
          rocket.lastX + (x - rocket.lastX) * share,
          rocket.lastY + (y - rocket.lastY) * share,
          rand(250, 520),
          GRAVITY,
        );
      }
      rocket.lastX = x;
      rocket.lastY = y;
      context.globalAlpha = 1;
      context.fillStyle = WHITE;
      context.beginPath();
      context.arc(x, y, 2, 0, TAU);
      context.fill();
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i];
      if (!flash) continue;
      flash.age += dt;
      if (flash.age >= FLASH_MS) {
        flashes.splice(i, 1);
        continue;
      }
      const left = 1 - flash.age / FLASH_MS;
      const r = flash.reach * (1 - 0.6 * left);
      const glow = context.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, r);
      glow.addColorStop(0, WHITE);
      glow.addColorStop(0.3, flash.colour);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.globalAlpha = 0.5 * left;
      context.fillStyle = glow;
      context.fillRect(flash.x - r, flash.y - r, r * 2, r * 2);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        // Swapped out rather than spliced: order does not matter, and two thousand shuffling down does.
        particles[i] = particles[particles.length - 1] as Particle;
        particles.pop();
        continue;
      }
      const keep = p.drag ** dt;
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.age / p.life;

      if (p.trail) {
        p.shed += dt;
        while (p.shed >= 24) {
          p.shed -= 24;
          ember(particles, p.x, p.y, rand(450, 800), p.gravity);
        }
      }
      if (p.crackle && t > 0.72) {
        p.crackle = false;
        for (let k = 0; k < 3; k++) {
          particles.push(
            particle({
              x: p.x,
              y: p.y,
              vx: rand(-0.05, 0.05),
              vy: rand(-0.05, 0.05),
              life: rand(160, 300),
              size: rand(1, 1.5),
              colour: WHITE,
              drag: 0.99,
              gravity: 0,
              glitter: true,
              round: false,
            }),
          );
        }
      }

      let alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      if (p.glitter && t > 0.4 && Math.random() < 0.45) alpha *= 0.15;
      const size = p.size * (t < 0.7 ? 1 : 1.7 - t);
      context.globalAlpha = alpha;
      context.fillStyle = p.colour;
      if (p.round) {
        // A soft halo round a bright core: a spark that glows rather than a dot.
        context.globalAlpha = alpha * 0.18;
        context.beginPath();
        context.arc(p.x, p.y, size * 2.8, 0, TAU);
        context.fill();
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(p.x, p.y, size, 0, TAU);
        context.fill();
      } else {
        context.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    context.globalAlpha = 1;

    if (!waiting && particles.length === 0 && flashes.length === 0) {
      // Over: the last of the glow goes at once, and the dojo and the sky fade
      // out after it, a frame at a time, before everything is taken away.
      if (fadingSince === null) {
        context.clearRect(0, 0, width, height);
        fadingSince = now;
      }
      if ((!dojo && !night) || now - fadingSince >= Math.max(DOJO_FADE_MS, SKY_FADE_MS)) {
        window.clearTimeout(deadline);
        remove();
        return;
      }
    }
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  deadline = window.setTimeout(stop, DEADLINE_MS);
  return stop;
}
