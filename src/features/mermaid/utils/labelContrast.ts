/**
 * Readable labels on author-coloured shapes. Mermaid colours labels for its own palette, so a
 * node the author filled (`style A fill:#a5d8ff`, a classDef fill) can end up with light text on
 * a light fill in dark mode, or dark on dark in light mode. This pass gives each such label the
 * dark or light text colour with the higher WCAG contrast against the fill. Labels with an
 * author colour, and translucent fills, are left alone. No Mermaid or React imports: it only
 * reads the SVG it is given, so it works on live DOM and on DOMParser documents alike.
 */

const DARK_TEXT = '#1A1A1A';

const LIGHT_TEXT = '#FFFFFF';

const DARK_LUMINANCE = relativeLuminance({ r: 26, g: 26, b: 26 });

const LIGHT_LUMINANCE = 1;

/** Below this opacity the theme background dominates, and Mermaid's own label colour fits. */
const MIN_OPAQUE_ALPHA = 0.5;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

type StyledElement = SVGElement | HTMLElement;

let canvasContext: CanvasRenderingContext2D | null | undefined;

/** Sets a readable label colour on every flowchart-style node and cluster with an author fill. */
export function fixLabelContrast(root: ParentNode): void {
  for (const group of root.querySelectorAll<SVGGElement>('g.node, g.cluster')) {
    const label = group.querySelector<StyledElement>(':scope > .label, :scope > .cluster-label');

    if (!label || hasAuthorColour(label)) continue;

    const fill = authorFill(group, label);

    if (!fill) continue;

    applyTextColour(label, textColourFor(fill));
  }
}

/** The first inline fill in the group, outside its label (rough shapes keep it on child paths). */
function authorFill(group: SVGGElement, label: StyledElement): Rgba | null {
  for (const element of group.querySelectorAll<StyledElement>('[style]')) {
    if (label.contains(element)) continue;

    const value = element.style.getPropertyValue('fill').trim();

    if (!value) continue;

    const colour = parseColour(value);

    if (!colour) return null;

    const opacity = Number.parseFloat(element.style.getPropertyValue('fill-opacity'));
    const alpha = colour.a * (Number.isFinite(opacity) ? opacity : 1);

    return alpha < MIN_OPAQUE_ALPHA ? null : colour;
  }

  return null;
}

function hasAuthorColour(label: StyledElement): boolean {
  if (label.style.getPropertyValue('color')) return true;

  for (const element of label.querySelectorAll<StyledElement>('[style]')) {
    if (element.style.getPropertyValue('color')) return true;

    const isText = element.localName === 'text' || element.localName === 'tspan';

    if (isText && element.style.getPropertyValue('fill')) return true;
  }

  return false;
}

/** Normalises a CSS colour through a canvas; null for paint servers, currentcolor or junk. */
function parseColour(value: string): Rgba | null {
  const lower = value.toLowerCase();

  if (lower === 'none' || lower === 'currentcolor' || lower.startsWith('url(')) return null;

  if (typeof CSS === 'undefined' || !CSS.supports('color', value)) return null;

  const context = getCanvasContext();

  if (!context) return null;

  context.fillStyle = '#010203';
  context.fillStyle = value;

  const normalised = context.fillStyle;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalised);

  if (hex) {
    return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16), a: 1 };
  }

  const rgba = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/i.exec(normalised);

  if (!rgba) return null;

  return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
}

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (canvasContext === undefined) {
    canvasContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }

  return canvasContext;
}

function textColourFor(fill: Rgba): string {
  const luminance = relativeLuminance(fill);
  const darkContrast = (luminance + 0.05) / (DARK_LUMINANCE + 0.05);
  const lightContrast = (LIGHT_LUMINANCE + 0.05) / (luminance + 0.05);

  return darkContrast >= lightContrast ? DARK_TEXT : LIGHT_TEXT;
}

function relativeLuminance({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): number {
  const channel = (value: number): number => {
    const c = value / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Colours the whole label: `color` on the HTML label and every element in it (prose CSS colours
 * strong, a and code directly), `fill` on every SVG text and tspan (Mermaid's tspan rules win
 * over inheritance). `!important` beats Mermaid's `#id span` and `.label text` rules.
 */
function applyTextColour(label: StyledElement, colour: string): void {
  label.style.setProperty('color', colour, 'important');

  for (const element of label.querySelectorAll<StyledElement>('*')) {
    const isText = element.localName === 'text' || element.localName === 'tspan';
    element.style.setProperty(isText ? 'fill' : 'color', colour, 'important');
  }
}
