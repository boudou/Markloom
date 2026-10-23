import { saveAs } from 'file-saver';
import { getMarkdownParser, mermaidFences } from '@/lib/markdown';
import { isAbsoluteUrl } from '@/lib/documentPath';
import { buildPagedHtml, buildStandaloneHtml, renderExportBody } from './html';
import { loadDocumentImage, loadUnique, renderDiagram, svgDataUrl } from './assets';
import { imageSources, placedInlines } from './inlineLines';
import type { PagedDocument } from './pages';

export interface ExportRequest {
  markdown: string;
  /** Path of the document, to resolve relative images */
  docPath: string | null;
  /** Used for the file name and document title */
  title: string;
  author?: string;
}

/** Lets the toast and the closing dialog paint (and finish their entry animation) before print() holds the page */
const TOAST_SETTLE_MS = 300;

/**
 * Prints the pages the export preview laid out, one page box per sheet with no print
 * margins, so the PDF matches the preview page for page. `title` names the file and the
 * document. Returns 'saved' or, in a browser, 'print-dialog' when the user finishes in the
 * print dialog.
 *
 * In a browser, `onPrintDialog` runs just before the print dialog opens (print() holds the
 * page until it closes). Chrome and Edge suggest the tab's title as the file name, so the app
 * wears `title` while printing.
 */
export async function exportPdf(
  paged: PagedDocument,
  title: string,
  onPrintDialog: () => void
): Promise<'saved' | 'print-dialog'> {
  const html = await buildPagedHtml(paged, { title });

  const bridge = window.markloomDesktop;

  if (bridge?.printToPdf) {
    const bytes = await bridge.printToPdf(html, {
      pageSize: paged.page.size,
      landscape: paged.page.orientation === 'landscape',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    saveAs(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${title}.pdf`);

    return 'saved';
  }

  // Browser: hand the same pages to the print dialog ("Save as PDF"); they match the preview
  // as long as the dialog keeps its default paper and margins
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const frameDoc = frame.contentDocument!;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  await frameDoc.fonts?.ready;

  onPrintDialog();
  await new Promise<void>((resolve) => setTimeout(resolve, TOAST_SETTLE_MS));

  const appTitle = document.title;

  document.title = title;

  try {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  } finally {
    document.title = appTitle;
  }

  setTimeout(() => frame.remove(), 1000);

  return 'print-dialog';
}

export async function exportHtml(request: ExportRequest): Promise<void> {
  const body = await renderExportBody(request.markdown, request.docPath);
  const html = await buildStandaloneHtml(body, request);
  saveAs(new Blob([html], { type: 'text/html;charset=utf-8' }), `${request.title}.html`);
}

const IMAGE_SYNTAX = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(\s+"[^"]*")?\)/g;

/**
 * A single portable Markdown text: diagrams become embedded SVG images and local images
 * are embedded too, so it reads the same anywhere it's opened.
 */
export async function portableMarkdown(request: ExportRequest): Promise<string> {
  const md = getMarkdownParser();
  const tokens = md.parse(request.markdown, {});
  const lines = request.markdown.split('\n');
  const placed = placedInlines(tokens);
  const fences = mermaidFences(tokens);

  // Every distinct image and diagram is requested at once, before the text is rewritten.
  // Portable Markdown embeds only the document's own images; web addresses, data URLs and
  // any other absolute URL stay as written.
  const [images, diagrams] = await Promise.all([
    loadUnique(
      placed.flatMap(({ token }) => imageSources(token).filter((src) => !isAbsoluteUrl(src))),
      (src) => loadDocumentImage(src, request.docPath)
    ),
    loadUnique(fences.map(({ code }) => code), renderDiagram),
  ]);

  // Embed images first, while line numbers are the original ones. Only the lines of inline
  // text that markdown-it parsed as images are touched, so code blocks keep their examples.
  // Bottom-up, and a data URL has no line break, so every token's lines stay valid.
  for (const { token, lines: [start, end] } of [...placed].reverse()) {
    const wanted = new Set(imageSources(token));

    if (wanted.size === 0) continue;

    let text = lines.slice(start, end).join('\n');

    for (const match of [...text.matchAll(IMAGE_SYNTAX)].reverse()) {
      const rawSrc = match[2].replace(/^<|>$/g, '');

      if (isAbsoluteUrl(rawSrc)) continue;

      // markdown-it unescapes and then normalizes the destination; Word and HTML export load that form
      const src = md.normalizeLink(md.utils.unescapeAll(rawSrc));

      if (!wanted.has(src)) continue;

      const image = images.get(src);

      if (!image) continue;

      const replacement = `![${match[1]}](${image.dataUrl}${match[3] ?? ''})`;
      text = text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
    }

    lines.splice(start, end - start, ...text.split('\n'));
  }

  // Replace each Mermaid fence (bottom-up so line numbers stay valid). The image keeps the
  // fence's container prefix ("> ", a list marker or indent), which never holds ` or ~.
  for (const { range: [start, end], code } of [...fences].reverse()) {
    const diagram = diagrams.get(code);

    // A failed diagram keeps its source; it still renders wherever Mermaid is supported
    if (!diagram?.ok) continue;

    const prefix = /^[^`~]*/.exec(lines[start])?.[0] ?? '';
    lines.splice(start, end - start, `${prefix}![Diagram](${svgDataUrl(diagram.svg)})`);
  }

  return lines.join('\n');
}

export async function exportMarkdown(request: ExportRequest): Promise<void> {
  const text = await portableMarkdown(request);
  saveAs(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${request.title}.md`);
}
