/**
 * Builds the dashed outline of one cage as a single SVG path, in grid units
 * where one cell is 1x1.
 *
 * Drawing an inset dashed box per cell is the obvious approach and it is wrong:
 * at every turn the two cells' boxes stop short of each other and the corner
 * comes out open. Tracing the cage's own boundary instead means corners close
 * exactly, and collinear cells share one continuous run of dashes.
 */
export function cageOutlinePath(cells: number[], inset: number): string {
  const inCage = new Set(cells);
  const has = (r: number, c: number): boolean =>
    r >= 0 && r < 9 && c >= 0 && c < 9 && inCage.has(r * 9 + c);

  const m = inset;
  const round = (n: number): string => String(Math.round(n * 1000) / 1000);
  const parts: string[] = [];

  /**
   * Where a run's end sits along its own axis. If the neighbouring cell is in
   * the cage, the boundary is turning back on itself — a concave corner — and
   * the line has to reach *past* the shared edge by the inset to meet the
   * perpendicular run. Otherwise the corner is convex and it stops short.
   */
  const startAt = (neighbourInCage: boolean, at: number): number =>
    neighbourInCage ? at - m : at + m;
  const endAt = (neighbourInCage: boolean, at: number): number =>
    neighbourInCage ? at + m : at - m;

  // Horizontal runs: the top and bottom edges of each row.
  for (let r = 0; r < 9; r++) {
    for (const side of [-1, 1] as const) {
      const y = side === -1 ? r + m : r + 1 - m;
      const isEdge = (c: number): boolean => has(r, c) && !has(r + side, c);
      let c = 0;
      while (c < 9) {
        if (!isEdge(c)) {
          c++;
          continue;
        }
        let end = c;
        while (end + 1 < 9 && isEdge(end + 1)) end++;
        const x1 = startAt(has(r, c - 1), c);
        const x2 = endAt(has(r, end + 1), end + 1);
        parts.push(`M${round(x1)} ${round(y)}L${round(x2)} ${round(y)}`);
        c = end + 1;
      }
    }
  }

  // Vertical runs: the left and right edges of each column.
  for (let c = 0; c < 9; c++) {
    for (const side of [-1, 1] as const) {
      const x = side === -1 ? c + m : c + 1 - m;
      const isEdge = (r: number): boolean => has(r, c) && !has(r, c + side);
      let r = 0;
      while (r < 9) {
        if (!isEdge(r)) {
          r++;
          continue;
        }
        let end = r;
        while (end + 1 < 9 && isEdge(end + 1)) end++;
        const y1 = startAt(has(r - 1, c), r);
        const y2 = endAt(has(end + 1, c), end + 1);
        parts.push(`M${round(x)} ${round(y1)}L${round(x)} ${round(y2)}`);
        r = end + 1;
      }
    }
  }

  return parts.join('');
}
