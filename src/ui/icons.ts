const SVG_NS = 'http://www.w3.org/2000/svg';

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
