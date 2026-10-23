// Formulas as PNG images, for targets that can't use KaTeX's HTML and CSS (Word, email). Each
// one is typeset with KaTeX, measured in the app document, then drawn with htmlToPng.
import { typesetMath } from '@/features/math';
import { errorMessage } from '@/lib/utils';
import { htmlToPng } from './assets';
import { mathExportCss } from './fonts';

/** A formula as a 2x PNG; width, height and depth (below the baseline) are 1x CSS px. */
export type MathImage =
  | { ok: true; png: Uint8Array<ArrayBuffer>; width: number; height: number; depth: number }
  | { ok: false; error: string };

/** Word export's body size, so an inline formula placed at 1x matches the text around it */
const FONT_SIZE = '11pt';

/** Room around the measured box for glyphs that overhang it (an italic f, a tall integral) */
const PAD = 2;

/** On its own line the formula is black on white, whatever the app's theme */
const PAGE_CSS = 'html, body { margin: 0; padding: 0; background: #FFFFFF; color: #1A1A1A; }';

const BOX_STYLE = `width: max-content; font-size: ${FONT_SIZE}; line-height: normal; white-space: nowrap;`;

const MAX_CACHED = 200;

const cache = new Map<string, Promise<MathImage>>();

// One formula at a time, so a document with many keeps one canvas alive
let queue: Promise<void> = Promise.resolve();

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The union of the formula's rendered parts, relative to `host` (KaTeX's own box adds the line's leading). */
function inkBox(host: HTMLElement): Box | null {
  const origin = host.getBoundingClientRect();
  const parts = Array.from(host.querySelectorAll('.katex-html > *'), (part) => part.getBoundingClientRect());
  const rects = parts.flatMap((rect) => (rect.width > 0 || rect.height > 0 ? [rect] : []));

  if (rects.length === 0) return null;

  return {
    left: Math.min(...rects.map((rect) => rect.left)) - origin.left,
    top: Math.min(...rects.map((rect) => rect.top)) - origin.top,
    right: Math.max(...rects.map((rect) => rect.right)) - origin.left,
    bottom: Math.max(...rects.map((rect) => rect.bottom)) - origin.top,
  };
}

async function rasterize(tex: string, display: boolean): Promise<MathImage> {
  // Sanitized by typesetMath
  const html = await typesetMath(tex, display);
  const host = document.createElement('div');
  host.style.cssText = `position: absolute; left: -10000px; top: 0; visibility: hidden; ${BOX_STYLE}`;
  host.innerHTML = html;

  const failed = host.querySelector('.katex-error');

  if (failed) return { ok: false, error: failed.getAttribute('title') ?? 'The formula could not be typeset' };

  // A zero-size inline block sits on the baseline, so its top is the baseline
  const baseline = document.createElement('span');
  baseline.style.cssText = 'display: inline-block; width: 0; height: 0;';
  host.append(baseline);
  document.body.append(host);

  let box: Box | null;
  let baselineTop: number;

  try {
    // Reading the layout starts KaTeX's font loads; measure once they are in
    void host.offsetWidth;
    await document.fonts.ready;
    box = inkBox(host);
    baselineTop = baseline.getBoundingClientRect().top - host.getBoundingClientRect().top;
  } finally {
    host.remove();
  }

  if (!box) return { ok: false, error: 'The formula is empty' };

  const width = Math.max(1, Math.ceil(box.right - box.left) + 2 * PAD);
  const height = Math.max(1, Math.ceil(box.bottom - box.top) + 2 * PAD);
  const depth = display ? 0 : Math.max(0, Math.round(box.bottom - baselineTop + PAD));

  // The same markup, shifted so the measured box starts PAD in; the hidden MathML copy is left out
  const content = document.createElement('div');
  content.style.cssText = `position: absolute; left: ${PAD - box.left}px; top: ${PAD - box.top}px; ${BOX_STYLE}`;
  content.innerHTML = html;
  content.querySelectorAll('.katex-mathml').forEach((mathml) => mathml.remove());

  const png = await htmlToPng(content, `${await mathExportCss()}\n${PAGE_CSS}`, width, height);

  return { ok: true, png, width, height, depth };
}

/**
 * `tex` as a sharp PNG (inline, or display math on its own line), made once per formula.
 * Never rejects: an invalid formula or a failed drawing gives `{ ok: false }`.
 */
export function renderMathImage(tex: string, display: boolean): Promise<MathImage> {
  const key = `${display ? 'display' : 'inline'}\n${tex}`;
  const cached = cache.get(key);

  if (cached) return cached;

  const image = queue.then(() => rasterize(tex, display)).catch((error): MathImage => ({ ok: false, error: errorMessage(error) }));
  queue = image.then(() => undefined);
  cache.set(key, image);

  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next();

    if (!oldest.done) cache.delete(oldest.value);
  }

  return image;
}
