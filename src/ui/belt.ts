import { BELTS } from '../core/generator.ts';
import type { Level } from '../core/types.ts';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The belt for a level, tied.
 *
 * Drawn rather than shipped as an image, and drawn as a shape rather than a
 * swatch: two of the six belts are a hair away from a background this app
 * already uses — white against the day theme's cream, black against the night
 * page — so a plain block of colour would come and go depending on the theme.
 * A band with a knot has an outline and a silhouette, and reads as a belt even
 * where its colour does not carry.
 *
 * The high contrast theme takes it further and puts the name beside it, since
 * hue is not allowed to be the only thing saying which belt this is.
 */
export function belt(level: Level, width = 46): SVGSVGElement {
  const { colour } = BELTS[level];
  const height = Math.round(width * 0.48);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 46 22');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'belt');

  const band = document.createElementNS(SVG, 'path');
  // The two tails, running out either side of the knot.
  band.setAttribute('d', 'M1 7.5h17v7H1z M28 7.5h17v7H28z');
  band.setAttribute('fill', colour);
  band.setAttribute('stroke', 'var(--line-strong)');
  band.setAttribute('stroke-width', '0.9');
  band.setAttribute('stroke-linejoin', 'round');
  svg.append(band);

  const knot = document.createElementNS(SVG, 'rect');
  knot.setAttribute('x', '16.5');
  knot.setAttribute('y', '4.5');
  knot.setAttribute('width', '13');
  knot.setAttribute('height', '13');
  knot.setAttribute('rx', '2.4');
  knot.setAttribute('fill', colour);
  knot.setAttribute('stroke', 'var(--line-strong)');
  knot.setAttribute('stroke-width', '0.9');
  svg.append(knot);

  // A crease across the knot, so the shape holds together at small sizes and
  // on the two belts whose colour matches the surface behind them.
  const crease = document.createElementNS(SVG, 'path');
  crease.setAttribute('d', 'M19.5 8.4h6.5');
  crease.setAttribute('stroke', 'var(--line-strong)');
  crease.setAttribute('stroke-width', '0.8');
  crease.setAttribute('stroke-linecap', 'round');
  crease.setAttribute('opacity', '0.55');
  svg.append(crease);

  return svg;
}
