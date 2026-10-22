// Pages of a laid-out document as PNG images: one page, or all of them in a .zip.
import { saveAs } from 'file-saver';
import { htmlToPng } from './assets';
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

/**
 * Saves page `which` (zero-based) as `<title>-NN.png`, or every page as `<title>.zip`.
 * A one-page document is saved as `<title>.png` either way.
 */
export async function savePages(doc: PagedDocument, title: string, which: 'all' | number): Promise<void> {
  const count = doc.pages.length;

  if (count === 0) throw new Error('The document has no pages');

  const css = await pagedStyles(doc.page);

  if (count === 1) {
    saveAs(pngBlob(await pagePng(doc, 0, css)), `${title}.png`);

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
