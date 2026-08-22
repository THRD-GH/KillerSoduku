import { BELTS } from '../core/generator.ts';
import type { Level } from '../core/types.ts';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The belt, drawn as the other DanDoku games draw it: a flat band with two
 * lines of stitching, the knot square on it with a fold across, and the two
 * tails hanging below. Same paths, same viewBox, same stroke classes, so a
 * belt looks the same whichever game it is met in.
 *
 * Outlined in the theme's strong line rather than in its own colour, because
 * two of the six sit a hair from a surface this app uses — white against the
 * day stock, black against the night page — and the outline is what keeps
 * them there. The Black belt carries its rank on the knot, which is the one
 * place a label fits.
 */
export function belt(level: Level, width = 28): SVGSVGElement {
  const { colour } = BELTS[level];
  const height = Math.round((width * 22) / 48);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 48 22');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'belt');

  const path = (d: string, cls: string, fill: string): void => {
    const node = document.createElementNS(SVG, 'path');
    node.setAttribute('d', d);
    node.setAttribute('fill', fill);
    node.setAttribute('class', cls);
    svg.append(node);
  };

  path('M1 5 H47 V13 H1 Z', 'belt-stroke', colour);
  path('M3 7.3 H45 M3 10.7 H45', 'belt-stitch', 'none');
  path('M23 12.5 L29.5 21 L34.5 21 L27.5 12.5 Z', 'belt-stroke', colour);
  path('M20.5 12.5 L13.5 21 L18.5 21 L25 12.5 Z', 'belt-stroke', colour);
  path('M19.5 3.5 H28.5 V14.5 H19.5 Z', 'belt-stroke', colour);
  path('M19.5 3.5 L28.5 14.5', 'belt-fold', 'none');

  if (level === 6) {
    const dan = document.createElementNS(SVG, 'text');
    dan.setAttribute('x', '24');
    dan.setAttribute('y', '10.8');
    dan.setAttribute('text-anchor', 'middle');
    dan.setAttribute('class', 'belt-dan');
    dan.textContent = 'DAN';
    svg.append(dan);
  }

  return svg;
}
