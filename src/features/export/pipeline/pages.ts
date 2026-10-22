// Splits the export body into pages: the body is laid out once at the page's content width
// in a hidden, script-free document, and its top-level blocks are assigned to pages from
// their measured positions. Blocks that run past a page bottom are cut across pages
// (`splitBlocks.ts`); only blocks that can't be cut and are taller than a page are scaled.
import { buildMeasuringHtml, buildPagedHtml, renderExportBody } from './html';
import { contentBox, type PageSetup } from './pageGeometry';
import { splitBlock } from './splitBlocks';

export interface PagedDocument {
  page: PageSetup;
  /** The HTML of each page's blocks, in order. */
  pages: string[];
}

const HEADING = /^H[1-6]$/;

/** Loads `html` into a hidden iframe of the given width; resolves once it has loaded. */
async function measuringFrame(html: string, width: number): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  // Same origin so this code can read the layout; no scripts run inside
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:100px;border:0;visibility:hidden;`;

  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.srcdoc = html;
  document.body.append(frame);
  await loaded;

  return frame;
}

/** Waits until fonts and images are in, so the measured positions are final. */
async function settle(doc: Document) {
  // Reading layout makes the document request the fonts its text uses
  void doc.body.offsetHeight;
  await doc.fonts.ready;
  await Promise.all(Array.from(doc.images, (img) => img.decode().catch(() => undefined)));
  await doc.fonts.ready;
}

/** A block taller than a page that can't be cut, alone on its page and scaled down to fit it. */
function fitted(block: Element, blockHeight: number, height: number): string {
  const scale = height / blockHeight;

  return `<div class="page-fit" style="zoom: ${scale.toFixed(4)}">${block.outerHTML}</div>`;
}

/**
 * Whether the block after a heading lets the heading stay on the page ending at `maxBottom`:
 * the block or its first part fits under it, or it is taller than a page and can't be cut,
 * even at the top of a page, so it gets a page of its own wherever the heading goes.
 */
function canFollowHeading(block: Element, maxBottom: number, height: number): boolean {
  const rect = block.getBoundingClientRect();

  if (rect.bottom <= maxBottom) return true;

  if (splitBlock(block, maxBottom)) return true;

  return rect.height > height && !splitBlock(block, rect.top + height);
}

/**
 * Assigns the blocks of `main` to pages of `height` px from their measured positions. A block
 * that runs past the page bottom is cut where it can be, and its parts take its place in
 * `main` so the rest is measured and cut again on the next page.
 */
function assignPages(main: Element, height: number): string[] {
  const pages: string[] = [];
  let current: Element[] = [];
  let pageStart = 0;

  const closePage = () => {
    if (current.length > 0) pages.push(current.map((block) => block.outerHTML).join('\n'));

    current = [];
  };

  let block = main.firstElementChild;

  while (block) {
    const rect = block.getBoundingClientRect();

    if (current.length === 0) pageStart = rect.top;

    const maxBottom = pageStart + height;
    const next = block.nextElementSibling;

    if (rect.bottom <= maxBottom) {
      // A heading whose next block can't start under it goes to the next page with it
      if (current.length > 0 && HEADING.test(block.tagName) && next && !canFollowHeading(next, maxBottom, height)) {
        closePage();

        continue;
      }

      current.push(block);
      block = next;

      continue;
    }

    const split = splitBlock(block, maxBottom);

    if (split) {
      block.replaceWith(split.head, split.tail);
      current.push(split.head);
      closePage();
      block = split.tail;

      continue;
    }

    // Start a page with it; a block that doesn't fit an empty page either is scaled down
    if (current.length > 0) {
      closePage();

      continue;
    }

    pages.push(fitted(block, rect.height, height));
    block = next;
  }

  closePage();

  return pages;
}

/** The text of `html` without repeated table headers, ignoring whitespace. */
function visibleText(doc: Document, html: string): string {
  const holder = doc.createElement('template');
  holder.innerHTML = html;
  holder.content.querySelectorAll('thead[data-repeated]').forEach((header) => header.remove());

  return (holder.content.textContent ?? '').replace(/\s+/g, '');
}

/** Lays the document out on pages of `page`'s size. */
export async function layoutPages(request: {
  markdown: string;
  docPath: string | null;
  page: PageSetup;
}): Promise<PagedDocument> {
  const body = await renderExportBody(request.markdown, request.docPath);
  const content = contentBox(request.page);
  const frame = await measuringFrame(await buildMeasuringHtml(body, request.page), content.width);

  try {
    // SAFETY: the frame is same-origin (sandbox allows it) and attached, so it has a document
    const doc = frame.contentDocument!;
    await settle(doc);
    const main = doc.querySelector('main.document');

    if (!main) return { page: request.page, pages: [] };

    const sourceText = main.textContent?.replace(/\s+/g, '') ?? '';
    const pages = assignPages(main, content.height);

    // Cutting blocks must neither lose nor repeat text (apart from repeated table headers)
    if (import.meta.env.DEV) {
      console.assert(visibleText(doc, pages.join('\n')) === sourceText, 'Page layout lost or duplicated text');
    }

    return { page: request.page, pages };
  } finally {
    frame.remove();
  }
}

/** Lays the document out and builds the one document that shows its pages, for the preview. */
export async function previewPages(request: {
  markdown: string;
  docPath: string | null;
  page: PageSetup;
}): Promise<{ doc: PagedDocument; html: string }> {
  const doc = await layoutPages(request);

  return { doc, html: await buildPagedHtml(doc, { title: 'Preview' }) };
}
