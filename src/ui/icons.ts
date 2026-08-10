const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The checkerboard that stands for transparency everywhere it is drawn — a
 * bordered square with alternate cells filled, so it reads as "what shows
 * through" rather than as any particular colour.
 */
export function transparencyIcon(size = 15): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const cell = 3;
  const origin = 2;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 !== 0) continue;
      const square = document.createElementNS(SVG_NS, 'rect');
      square.setAttribute('x', String(origin + col * cell));
      square.setAttribute('y', String(origin + row * cell));
      square.setAttribute('width', String(cell));
      square.setAttribute('height', String(cell));
      square.setAttribute('fill', 'currentColor');
      square.setAttribute('opacity', '0.75');
      svg.append(square);
    }
  }

  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('x', '1.5');
  frame.setAttribute('y', '1.5');
  frame.setAttribute('width', '13');
  frame.setAttribute('height', '13');
  frame.setAttribute('rx', '2');
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', 'currentColor');
  frame.setAttribute('stroke-width', '1.3');
  svg.append(frame);

  return svg;
}

/** A clock face, shown in place of the time when the clock is hidden. */
export function clockIcon(size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', 'currentColor');
  group.setAttribute('stroke-width', '2');
  group.setAttribute('stroke-linecap', 'round');
  group.setAttribute('stroke-linejoin', 'round');

  const face = document.createElementNS(SVG_NS, 'circle');
  face.setAttribute('cx', '12');
  face.setAttribute('cy', '13');
  face.setAttribute('r', '8');

  // Hands at roughly ten past two, which reads as a clock at any size.
  const hands = document.createElementNS(SVG_NS, 'path');
  hands.setAttribute('d', 'M12 8.5V13h3.5');

  // A small crown, so it is a stopwatch rather than a plain circle.
  const crown = document.createElementNS(SVG_NS, 'path');
  crown.setAttribute('d', 'M9.5 2.5h5');

  group.append(face, hands, crown);
  svg.append(group);
  return svg;
}

/**
 * The undo arrow: a hooked arc pointing back on itself. `mirrored` flips it
 * horizontally for redo, so the pair is unmistakably the same gesture in
 * opposite directions.
 */
export function undoArrow(mirrored = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '19');
  svg.setAttribute('height', '19');
  svg.setAttribute('aria-hidden', 'true');

  const group = document.createElementNS(SVG_NS, 'g');
  if (mirrored) group.setAttribute('transform', 'translate(24,0) scale(-1,1)');
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', 'currentColor');
  group.setAttribute('stroke-width', '2.3');
  group.setAttribute('stroke-linecap', 'round');
  group.setAttribute('stroke-linejoin', 'round');

  const arc = document.createElementNS(SVG_NS, 'path');
  arc.setAttribute('d', 'M7 9h8a5 5 0 0 1 0 10h-5');

  const head = document.createElementNS(SVG_NS, 'polyline');
  head.setAttribute('points', '11,5 7,9 11,13');

  group.append(arc, head);
  svg.append(group);
  return svg;
}

/**
 * A waste bin, for the control that throws a parked game away. A cross reads
 * as "close" or "dismiss" more than it reads as "delete", and this sits beside
 * a row that opens the puzzle — the two need to be unmistakable.
 */
export function binIcon(size = 17): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const add = (d: string): void => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  };

  // Lid, with the handle above it, then the tapering body and two ribs.
  add('M4 7h16');
  add('M10 4h4');
  add('M6.5 7l1 12.2a1.8 1.8 0 0 0 1.8 1.8h5.4a1.8 1.8 0 0 0 1.8-1.8L17.5 7');
  add('M10.2 10.6v6.6');
  add('M13.8 10.6v6.6');

  return svg;
}
