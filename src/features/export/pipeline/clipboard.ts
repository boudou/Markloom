// Copy as rich text: the export body made safe to paste into email, Confluence or Google Docs.
// Styles are inline attributes because Gmail and Outlook drop <style> blocks; keep them
// visually close to EXPORT_STYLES. Body text gets no font, so a paste takes the target's own.
import { errorMessage } from '@/lib/utils';
import { blobToDataUrl, loadDocumentImage, renderDiagram, svgDataUrl, toPngBytes } from './assets';
import { renderExportBody, type BodyEmbed } from './html';
import { renderMathImage } from './mathImage';

/** Outlook ignores max-width, so pasted images are capped by their width attribute */
const MAX_WIDTH = 640;

const WEB_ADDRESS = /^(https?:)?\/\//i;

/** Formats a paste target may not show */
const RASTERIZE = ['image/svg+xml', 'image/webp'];

// The copy is backed by a plain ArrayBuffer, which BlobPart requires
const pngBytesDataUrl = (png: Uint8Array) => blobToDataUrl(new Blob([new Uint8Array(png)], { type: 'image/png' }));

async function pngDataUrl(dataUrl: string, width: number, height: number): Promise<string> {
  return pngBytesDataUrl(await toPngBytes(dataUrl, width, height));
}

/** The 1x size (toPngBytes renders at 2x), capped at MAX_WIDTH with the aspect ratio kept */
function pasteSize(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width);

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Email clients drop inline SVG and stylesheets, so diagrams, SVG/WebP images and formulas
 * (KaTeX's markup needs its stylesheet) become sized PNGs. Web images are not fetched: the
 * paste target loads them itself.
 */
const CLIPBOARD_EMBED: BodyEmbed = {
  async math(tex, display) {
    const image = await renderMathImage(tex, display);

    if (!image.ok) return { kind: 'error', error: image.error };

    // A wide display formula shrinks like a diagram; inline ones keep their size, so their depth holds
    const size = display ? pasteSize(image.width, image.height) : { width: image.width, height: image.height };

    return { kind: 'img', src: await pngBytesDataUrl(image.png), ...size, depth: image.depth };
  },
  async diagram(code) {
    const diagram = await renderDiagram(code);

    if (!diagram.ok) return { kind: 'error', error: diagram.error };

    try {
      const src = await pngDataUrl(svgDataUrl(diagram.svg), diagram.width, diagram.height);

      return { kind: 'img', src, ...pasteSize(diagram.width, diagram.height) };
    } catch (error) {
      return { kind: 'error', error: errorMessage(error) };
    }
  },
  async image(src, docPath) {
    // A pasted fragment has no page scheme to inherit, so //host goes over https
    if (WEB_ADDRESS.test(src)) return { kind: 'keep', src: src.startsWith('//') ? `https:${src}` : src };

    const image = await loadDocumentImage(src, docPath);

    if (!image) return null;

    try {
      const dataUrl = RASTERIZE.includes(image.mime) ? await pngDataUrl(image.dataUrl, image.width, image.height) : image.dataUrl;

      return { kind: 'img', src: dataUrl, ...pasteSize(image.width, image.height) };
    } catch {
      return null;
    }
  },
};

const MONO = "font-family:Consolas,'Courier New',monospace";

const RULE = '#D0D7DE';

const INLINE_STYLES: [selector: string, style: string][] = [
  ['table', 'border-collapse:collapse'],
  ['th, td', `border:1px solid ${RULE};padding:4px 8px;text-align:left;vertical-align:top`],
  ['th', 'background:#F6F8FA'],
  ['pre', `background:#F6F8FA;padding:8px 12px;border-radius:6px;white-space:pre-wrap;${MONO};font-size:0.9em`],
  [':not(pre) > code', `${MONO};background:#F1F3F5;padding:0 3px;border-radius:3px`],
  ['blockquote', `margin:0 0 1em;padding:0 1em;border-left:3px solid ${RULE};color:#3F3F46`],
  ['img', 'max-width:100%;height:auto'],
  ['div.math-display', 'margin:0 0 1em;text-align:center'],
  ['.math-error', 'color:#991B1B'],
  ['sup.footnote-ref', 'font-size:0.75em;line-height:0;font-weight:600'],
  ['section.footnotes', 'font-size:0.88em;color:#3F3F46'],
  ['.export-error', 'padding:8px 12px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B'],
];

/** The HTML part of a rich-text copy of `markdown`. */
export async function clipboardHtml(markdown: string, docPath: string | null): Promise<string> {
  const template = document.createElement('template');
  template.innerHTML = await renderExportBody(markdown, docPath, CLIPBOARD_EMBED);
  const root = template.content;

  // Decorative inline SVG, which email clients drop or show oversized
  root.querySelectorAll('svg.callout-icon').forEach((icon) => icon.remove());

  // Footnote links point at ids in the fragment, which a message or page doesn't keep: drop
  // the back-links and leave the references as plain numbers
  root.querySelectorAll('a.footnote-backref').forEach((link) => link.remove());
  root.querySelectorAll('sup.footnote-ref > a').forEach((link) => link.replaceWith(link.textContent ?? ''));

  // Pasted checkboxes come out as form fields or not at all; the markup already has the space after it
  root.querySelectorAll<HTMLInputElement>('input.task-checkbox').forEach((box) => {
    box.replaceWith(box.hasAttribute('checked') ? '☑' : '☐');
  });

  for (const [selector, style] of INLINE_STYLES) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      // The markup's own style (a table column's alignment) comes last, so it wins
      const own = element.getAttribute('style');
      element.setAttribute('style', own ? `${style};${own}` : style);
    });
  }

  return template.innerHTML;
}
