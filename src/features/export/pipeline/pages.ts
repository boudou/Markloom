// Splits the export body into pages: the body is laid out once at the page's content width
// in a hidden, script-free document, and its top-level blocks are assigned to pages from
// their measured positions. Pages break only between blocks for now (#195 splits tall ones).
import { buildMeasuringHtml, buildPagedHtml, renderExportBody } from './html';
import { contentBox, type PageSetup } from './pageGeometry';

export interface PagedDocument {
  page: PageSetup;
  /** The HTML of each page's blocks, in order. */
  pages: string[];
}

interface Block {
  element: Element;
  top: number;
  bottom: number;
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

/** A block taller than a page, alone on its page and scaled down to fit it. */
function fitted(block: Block, height: number): string {
  const scale = height / (block.bottom - block.top);

  return `<div class="page-fit" style="zoom: ${scale.toFixed(4)}">${block.element.outerHTML}</div>`;
}

/** Assigns measured blocks to pages of `height` px, keeping headings with what follows. */
function assignPages(blocks: Block[], height: number): string[] {
  const pages: string[] = [];
  let current: Block[] = [];
  let pageStart = 0;

  const fits = (block: Block) => block.bottom - pageStart <= height;

  const closePage = () => {
    if (current.length > 0) pages.push(current.map((block) => block.element.outerHTML).join('\n'));

    current = [];
  };

  for (const [index, block] of blocks.entries()) {
    if (current.length === 0) pageStart = block.top;

    // A heading that fits but whose next block doesn't goes to the next page with it,
    // unless it already starts the page or the next block won't fit any page
    const next = blocks[index + 1];

    const keepWithNext =
      current.length > 0 &&
      HEADING.test(block.element.tagName) &&
      next !== undefined &&
      next.bottom - next.top <= height &&
      !fits(next);

    if (fits(block) && !keepWithNext) {
      current.push(block);

      continue;
    }

    closePage();
    pageStart = block.top;

    if (fits(block)) {
      current.push(block);

      continue;
    }

    pages.push(fitted(block, height));
  }

  closePage();

  return pages;
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

    const blocks = Array.from(main?.children ?? [], (element) => {
      const rect = element.getBoundingClientRect();

      return { element, top: rect.top, bottom: rect.bottom };
    });

    return { page: request.page, pages: assignPages(blocks, content.height) };
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
