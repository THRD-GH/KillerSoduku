type Point = [number, number];

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

/**
 * The outline of one cage as a single SVG path: one closed, rounded loop per
 * boundary, rather than a dash per cell edge. Corners join properly and the
 * line runs continuously the whole way round.
 */
export function cageOutlinePath(cells: number[], inset: number, radius = 0.13): string {
  const parts: string[] = [];

  for (const loop of boundaryLoops(cells)) {
    const points = insetLoop(loop, inset);
    if (points.length < 3) continue;

    const segments: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length];
      const here = points[i];
      const next = points[(i + 1) % points.length];

      // Never round away more than half of either adjacent edge.
      const r = Math.min(radius, distance(here, prev) / 2, distance(here, next) / 2);
      const start = towards(here, prev, r);
      const end = towards(here, next, r);

      segments.push(
        `${i === 0 ? 'M' : 'L'}${fmt(start[0])} ${fmt(start[1])}` +
          `Q${fmt(here[0])} ${fmt(here[1])} ${fmt(end[0])} ${fmt(end[1])}`,
      );
    }
    parts.push(`${segments.join('')}Z`);
  }

  return parts.join('');
}
