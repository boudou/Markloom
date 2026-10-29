// Pages of a laid-out document as PNG images: one page, all of them in a .zip, or all of them as one tall image.
import { saveAs } from 'file-saver';
import { canvasPng, htmlToPng } from './assets';
import { pagedStyles } from './html';
import { pageBox } from './pageGeometry';
import type { PagedDocument } from './pages';

/** One page as PNG bytes (2x), drawn with the preview's stylesheet. */
async function pagePng(doc: PagedDocument, index: number, css: string): Promise<Uint8Array> {
  // Parsed inert; the page's images are data URLs and its HTML is already sanitized
  const template = document.createElement('template');
  template.innerHTML = `<section class="page" data-page="${index + 1}">${doc.pages[index] ?? ''}</section>`;
  // SAFETY: the template's markup is that one section element
  const section = template.content.firstElementChild!;
  const box = pageBox(doc.page);

  // Whole pixels, so an A4 page is 1588 × 2246 at 2x
  return htmlToPng(section, css, Math.ceil(box.width), Math.ceil(box.height));
}

/** `<title>-NN.png`, the number padded to the page count's width (at least two digits). */
function pageFileName(title: string, index: number, count: number): string {
  const digits = Math.max(2, String(count).length);

  return `${title}-${String(index + 1).padStart(digits, '0')}.png`;
}

const pngBlob = (bytes: Uint8Array) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });

/** Chromium's largest canvas side, in pixels. */
const MAX_CANVAS_SIDE = 32_767;

/**
 * Every page stacked top to bottom in one PNG, scaled down to fit when the stack would be
 * taller than {@link MAX_CANVAS_SIDE}. Pages are drawn one at a time, never all held at once.
 */
async function stackedPng(doc: PagedDocument, css: string): Promise<Blob> {
  const count = doc.pages.length;
  const first = await createImageBitmap(pngBlob(await pagePng(doc, 0, css)));
  const pageWidth = first.width;
  const pageHeight = first.height;
  const scale = Math.min(1, MAX_CANVAS_SIDE / (count * pageHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageWidth * scale);
  canvas.height = Math.round(count * pageHeight * scale);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    first.close();
    throw new Error('This browser cannot make an image this large; use Save all pages instead');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';

  for (let index = 0; index < count; index++) {
    const bitmap = index === 0 ? first : await createImageBitmap(pngBlob(await pagePng(doc, index, css)));
    // Whole-pixel edges, so scaled pages meet with no seam or gap
    const top = Math.round(index * pageHeight * scale);
    const bottom = Math.round((index + 1) * pageHeight * scale);
    ctx.drawImage(bitmap, 0, top, canvas.width, bottom - top);
    bitmap.close();
  }

  return canvasPng(canvas);
}

/** Which pages to save: one (zero-based), all of them in a .zip, or all of them as one image. */
export type PageSelection = number | 'all' | 'stacked';

/**
 * Saves page `which` (zero-based) as `<title>-NN.png`, every page as `<title>.zip`, or every
 * page stacked in one `<title>.png`. A one-page document is saved as `<title>.png` either way.
 */
export async function savePages(doc: PagedDocument, title: string, which: PageSelection): Promise<void> {
  const count = doc.pages.length;

  if (count === 0) throw new Error('The document has no pages');

  const css = await pagedStyles(doc);

  if (count === 1) {
    saveAs(pngBlob(await pagePng(doc, 0, css)), `${title}.png`);

    return;
  }

  if (which === 'stacked') {
    saveAs(await stackedPng(doc, css), `${title}.png`);

    return;
  }

  if (which !== 'all') {
    saveAs(pngBlob(await pagePng(doc, which, css)), pageFileName(title, which, count));

    return;
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // One page at a time, so a long document never holds every canvas at once
  for (let index = 0; index < count; index++) {
    zip.file(pageFileName(title, index, count), await pagePng(doc, index, css));
  }

  // PNG is already compressed
  saveAs(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${title}.zip`);
}
