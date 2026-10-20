import { saveAs } from 'file-saver';
import { getMarkdownParser } from '@/lib/markdown';
import { buildStandaloneHtml, renderExportBody } from './html';
import { loadDocumentImage, renderDiagram, svgDataUrl } from './assets';

export interface ExportRequest {
  markdown: string;
  /** Path of the document, to resolve relative images */
  docPath: string | null;
  /** Used for the file name and document title */
  title: string;
  author?: string;
}

/** Returns 'saved' or, in a browser, 'print-dialog' when the user finishes in the print dialog. */
export async function exportPdf(request: ExportRequest): Promise<'saved' | 'print-dialog'> {
  const body = await renderExportBody(request.markdown, request.docPath);
  const html = await buildStandaloneHtml(body, request);

  const bridge = window.markloomDesktop;
  if (bridge?.printToPdf) {
    const bytes = await bridge.printToPdf(html, { pageSize: 'A4' });
    saveAs(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${request.title}.pdf`);
    return 'saved';
  }

  // Browser: hand the same document to the print dialog ("Save as PDF")
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const frameDoc = frame.contentDocument!;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  await frameDoc.fonts?.ready;
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
  return 'print-dialog';
}

export async function exportHtml(request: ExportRequest): Promise<void> {
  const body = await renderExportBody(request.markdown, request.docPath);
  const html = await buildStandaloneHtml(body, request);
  saveAs(new Blob([html], { type: 'text/html;charset=utf-8' }), `${request.title}.html`);
}

/**
 * A single portable .md file: diagrams become embedded SVG images and local images
 * are embedded too, so it reads the same anywhere it's opened.
 */
export async function exportMarkdown(request: ExportRequest): Promise<void> {
  const lines = request.markdown.split('\n');
  const tokens = getMarkdownParser().parse(request.markdown, {});

  // Replace each Mermaid fence (bottom-up so line numbers stay valid)
  const fences = tokens.filter((t) => t.type === 'fence' && t.info.trim() === 'mermaid' && t.map);
  for (const fence of fences.reverse()) {
    const [start, end] = fence.map!;
    try {
      const { svg } = await renderDiagram(fence.content.trim());
      lines.splice(start, end - start, `![Diagram](${svgDataUrl(svg)})`);
    } catch {
      // Leave the source in place; it still renders wherever Mermaid is supported
    }
  }

  // Embed images referenced by relative path
  let text = lines.join('\n');
  const images = [...text.matchAll(/!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(\s+"[^"]*")?\)/g)];
  for (const match of images.reverse()) {
    const src = match[2].replace(/^<|>$/g, '');
    if (/^(data|https?):/i.test(src)) continue;
    const image = await loadDocumentImage(src, request.docPath);
    if (!image) continue;
    const replacement = `![${match[1]}](${image.dataUrl}${match[3] ?? ''})`;
    text = text.slice(0, match.index!) + replacement + text.slice(match.index! + match[0].length);
  }

  saveAs(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${request.title}.md`);
}
