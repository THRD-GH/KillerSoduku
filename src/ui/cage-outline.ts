type Point = [number, number];

/**
 * How far the cage outline stops short of its top-left corner, in cell widths,
 * measured along each of the two edges that meet there. The two differ: the gap
 * along the top has to clear the width of the total printed in it, which is
 * wider for 16 than for 6, while the gap down the left only has to clear the
 * height of the figures, which is the same either way.
 */
export interface Notch {
  along: number;
  down: number;
}

/** Key a lattice point so edges can be chained by their endpoints. */
const key = (p: Point): string => `${p[0]},${p[1]}`;

/**
 * Walks the boundary of a cage and returns it as closed loops of corner
 * points, in grid units where a cell is 1x1.
 *
 * Each boundary edge is emitted with the cage on a consistent side, so the
 * edges chain end-to-end into loops. Collinear runs are then merged, leaving
 * only the corners.
 */
function boundaryLoops(cells: number[]): Point[][] {
  const inCage = new Set(cells);
  const has = (r: number, c: number): boolean =>
    r >= 0 && r < 9 && c >= 0 && c < 9 && inCage.has(r * 9 + c);

  const outgoing = new Map<string, Point[]>();
  const addEdge = (from: Point, to: Point): void => {
    const list = outgoing.get(key(from));
    if (list) list.push(to);
    else outgoing.set(key(from), [to]);
  };

  for (const cell of cells) {
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    // Anticlockwise on screen: interior stays on the same side throughout.
    if (!has(r - 1, c)) addEdge([c + 1, r], [c, r]);
    if (!has(r, c - 1)) addEdge([c, r], [c, r + 1]);
    if (!has(r + 1, c)) addEdge([c, r + 1], [c + 1, r + 1]);
    if (!has(r, c + 1)) addEdge([c + 1, r + 1], [c + 1, r]);
  }

  const loops: Point[][] = [];
  while (outgoing.size > 0) {
    const startKey = outgoing.keys().next().value as string;
    const start = startKey.split(',').map(Number) as Point;
    const loop: Point[] = [];
    let at = start;

    // Follow edges until the walk returns to where it began.
    for (let guard = 0; guard < 400; guard++) {
      const list = outgoing.get(key(at));
      if (!list || list.length === 0) break;
      const next = list.pop()!;
      if (list.length === 0) outgoing.delete(key(at));
      loop.push(at);
      at = next;
      if (key(at) === key(start)) break;
    }
    if (loop.length >= 4) loops.push(dropCollinear(loop));
  }
  return loops;
}

/** Keep only the points where the direction actually turns. */
function dropCollinear(loop: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const here = loop[i];
    const next = loop[(i + 1) % loop.length];
    const inDir = [Math.sign(here[0] - prev[0]), Math.sign(here[1] - prev[1])];
    const outDir = [Math.sign(next[0] - here[0]), Math.sign(next[1] - here[1])];
    if (inDir[0] !== outDir[0] || inDir[1] !== outDir[1]) out.push(here);
  }
  return out;
}

/**
 * Pull a loop inwards by `inset`. Every corner is a right angle, so the two
 * offset edges meet at the corner displaced along the sum of their inward
 * normals — which also handles concave corners, where that sum pushes the
 * point outwards to meet the perpendicular run.
 */
function insetLoop(loop: Point[], inset: number): Point[] {
  return loop.map((here, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    const inDir: Point = [Math.sign(here[0] - prev[0]), Math.sign(here[1] - prev[1])];
    const outDir: Point = [Math.sign(next[0] - here[0]), Math.sign(next[1] - here[1])];
    // Inward normal of a direction (dx, dy) is (dy, -dx).
    const nx = inDir[1] + outDir[1];
    const ny = -inDir[0] - outDir[0];
    return [here[0] + inset * nx, here[1] + inset * ny] as Point;
  });
}

const distance = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const towards = (from: Point, to: Point, by: number): Point => {
  const d = distance(from, to);
  if (d === 0) return [...from] as Point;
  return [from[0] + ((to[0] - from[0]) / d) * by, from[1] + ((to[1] - from[1]) / d) * by];
};

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/** One rounded corner, as the move that reaches it and the curve through it. */
const cornerSegment = (
  prev: Point,
  here: Point,
  next: Point,
  radius: number,
  first: boolean,
): string => {
  // Never round away more than half of either adjacent edge.
  const r = Math.min(radius, distance(here, prev) / 2, distance(here, next) / 2);
  const start = towards(here, prev, r);
  const end = towards(here, next, r);
  return (
    `${first ? 'M' : 'L'}${fmt(start[0])} ${fmt(start[1])}` +
    `Q${fmt(here[0])} ${fmt(here[1])} ${fmt(end[0])} ${fmt(end[1])}`
  );
};

const closedLoop = (points: Point[], radius: number): string => {
  const segments = points.map((here, i) =>
    cornerSegment(
      points[(i - 1 + points.length) % points.length],
      here,
      points[(i + 1) % points.length],
      radius,
      i === 0,
    ),
  );
  return `${segments.join('')}Z`;
};

/**
 * The same loop, but stopping short on either side of one corner to leave a
 * notch — the gap the cage total is printed in, as puzzle books set it.
 *
 * The walk runs anticlockwise on screen, so it leaves this corner down the
 * cage's left edge and comes back to it along the top: those two segments are
 * the lips of the notch, and the path simply starts and ends on them.
 */
const notchedLoop = (points: Point[], at: number, radius: number, notch: Notch): string => {
  const corner = points[at];
  const order: Point[] = [];
  for (let i = 1; i < points.length; i++) order.push(points[(at + i) % points.length]);

  // A short edge — a one-cell-wide cage, or a step in the boundary — must not
  // have its whole length eaten by the notch.
  const lip = (to: Point, want: number): number => Math.min(want, distance(corner, to) * 0.6);
  const start = towards(corner, order[0], lip(order[0], notch.down));
  const last = order[order.length - 1];
  const end = towards(corner, last, lip(last, notch.along));

  const segments = [`M${fmt(start[0])} ${fmt(start[1])}`];
  for (let i = 0; i < order.length; i++) {
    segments.push(
      cornerSegment(
        i === 0 ? start : order[i - 1],
        order[i],
        i === order.length - 1 ? end : order[i + 1],
        radius,
        false,
      ),
    );
  }
  segments.push(`L${fmt(end[0])} ${fmt(end[1])}`);
  return segments.join('');
};

/**
 * The outline of one cage as a single SVG path: one rounded loop per boundary,
 * rather than a dash per cell edge. Corners join properly and the line runs
 * continuously the whole way round — except at the corner where the cage total
 * is printed, if `notch` asks for a gap there.
 */
export function cageOutlinePath(
  cells: number[],
  inset: number,
  radius = 0.05,
  notch?: Notch,
): string {
  /*
   * The total is printed in the first cell of the cage, which is its lowest
   * index: the leftmost cell of its topmost row. Both the top and the left of
   * that cell are therefore outside the cage, so its top-left corner is always
   * a convex corner of the boundary and always the one to cut.
   */
  const anchor = Math.min(...cells);
  const anchorCorner: Point = [(anchor % 9) + inset, Math.floor(anchor / 9) + inset];
  const near = (p: Point): boolean =>
    Math.abs(p[0] - anchorCorner[0]) < 1e-6 && Math.abs(p[1] - anchorCorner[1]) < 1e-6;

  const parts: string[] = [];
  for (const loop of boundaryLoops(cells)) {
    const points = insetLoop(loop, inset);
    if (points.length < 3) continue;
    const at = notch ? points.findIndex(near) : -1;
    parts.push(at >= 0 ? notchedLoop(points, at, radius, notch!) : closedLoop(points, radius));
  }
  return parts.join('');
}
