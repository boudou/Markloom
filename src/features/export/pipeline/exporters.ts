import { saveAs } from 'file-saver';
import { getMarkdownParser, mermaidFences } from '@/lib/markdown';
import { buildStandaloneHtml, renderExportBody } from './html';
import { loadDocumentImage, renderDiagram, svgDataUrl } from './assets';
import { placedInlines } from './inlineLines';

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

const IMAGE_SYNTAX = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(\s+"[^"]*")?\)/g;

/**
 * A single portable Markdown text: diagrams become embedded SVG images and local images
 * are embedded too, so it reads the same anywhere it's opened.
 */
export async function portableMarkdown(request: ExportRequest): Promise<string> {
  const md = getMarkdownParser();
  const tokens = md.parse(request.markdown, {});
  const lines = request.markdown.split('\n');

  // Embed images first, while line numbers are the original ones. Only the lines of inline
  // text that markdown-it parsed as images are touched, so code blocks keep their examples.
  // Bottom-up, and a data URL has no line break, so every token's lines stay valid.
  for (const { token, lines: [start, end] } of placedInlines(tokens).reverse()) {
    const wanted = new Set(
      (token.children ?? []).flatMap((child) => (child.type === 'image' ? [child.attrGet('src') ?? ''] : []))
    );

    if (wanted.size === 0) continue;

    let text = lines.slice(start, end).join('\n');

    for (const match of [...text.matchAll(IMAGE_SYNTAX)].reverse()) {
      const rawSrc = match[2].replace(/^<|>$/g, '');

      if (/^(data|https?):/i.test(rawSrc)) continue;

      // markdown-it unescapes and then normalizes the destination; Word and HTML export load that form
      const src = md.normalizeLink(md.utils.unescapeAll(rawSrc));

      if (!wanted.has(src)) continue;

      const image = await loadDocumentImage(src, request.docPath);

      if (!image) continue;

      const replacement = `![${match[1]}](${image.dataUrl}${match[3] ?? ''})`;
      text = text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
    }

    lines.splice(start, end - start, ...text.split('\n'));
  }

  // Replace each Mermaid fence (bottom-up so line numbers stay valid). The image keeps the
  // fence's container prefix ("> ", a list marker or indent), which never holds ` or ~.
  for (const { range: [start, end], code } of mermaidFences(tokens).reverse()) {
    try {
      const { svg } = await renderDiagram(code);
      const prefix = /^[^`~]*/.exec(lines[start])?.[0] ?? '';

      lines.splice(start, end - start, `${prefix}![Diagram](${svgDataUrl(svg)})`);
    } catch {
      // Leave the source in place; it still renders wherever Mermaid is supported
    }
  }

  return lines.join('\n');
}

export async function exportMarkdown(request: ExportRequest): Promise<void> {
  const text = await portableMarkdown(request);
  saveAs(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${request.title}.md`);
}
