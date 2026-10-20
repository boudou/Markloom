// One HTML rendering of the document for PDF and HTML exports: the preview's sanitized
// markup, diagrams as inline SVG, images embedded, the app's fonts included.
import { parseMarkdown } from '@/lib/markdown';
import { loadHighlighter } from '@/features/syntax-highlight';
import { blobToDataUrl, loadDocumentImage, renderDiagram } from './assets';
import { EXPORT_STYLES } from './styles';

const EXPORT_FONT_FAMILIES = ['Literata', 'Fraunces', 'IBM Plex Mono'];
// Latin and Greek cover the app's audience; other scripts fall back to system fonts
const FONT_SUBSETS = /-(latin|latin-ext|greek|greek-ext)-\d/;

let fontFacesPromise: Promise<string> | null = null;

/** The app's own @font-face rules with the font files inlined (fetched once). */
function embeddedFontFaces(): Promise<string> {
  fontFacesPromise ??= (async () => {
    const rules: CSSFontFaceRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(cssRules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
        if (EXPORT_FONT_FAMILIES.includes(family)) rules.push(rule);
      }
    }

    const faces = await Promise.all(
      rules.map(async (rule) => {
        const url = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+\.woff2)["']?\)/)?.[1];
        if (!url || !FONT_SUBSETS.test(url)) return '';
        try {
          const response = await fetch(url);
          if (!response.ok) return '';

          // Rejects on a failed read, so one bad face can't leave the cached promise pending
          const data = await blobToDataUrl(await response.blob());
          const s = rule.style;
          return `@font-face{font-family:'${s.getPropertyValue('font-family').replace(/['"]/g, '')}';font-style:${s.getPropertyValue('font-style') || 'normal'};font-weight:${s.getPropertyValue('font-weight') || '400'};font-display:block;src:url(${data}) format('woff2');unicode-range:${s.getPropertyValue('unicode-range') || 'U+0-10FFFF'};}`;
        } catch {
          return '';
        }
      })
    );
    return faces.join('\n');
  })();
  return fontFacesPromise;
}

function errorBox(title: string, detail: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'export-error';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const pre = document.createElement('pre');
  pre.textContent = detail;
  box.append(strong, pre);
  return box;
}

/** The document body as self-contained HTML. */
export async function renderExportBody(markdown: string, docPath: string | null): Promise<string> {
  await loadHighlighter();
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(markdown);
  const root = template.content;

  for (const slot of Array.from(root.querySelectorAll<HTMLElement>('.mermaid-container[data-mermaid]'))) {
    const code = decodeURIComponent(slot.getAttribute('data-mermaid') ?? '');
    const figure = document.createElement('figure');
    figure.className = 'diagram';
    try {
      // Sanitized by Mermaid itself (strict security level)
      figure.innerHTML = (await renderDiagram(code)).svg;
    } catch (error) {
      figure.append(errorBox('Diagram could not be rendered', error instanceof Error ? error.message : String(error)));
    }
    slot.replaceWith(figure);
  }

  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      const image = await loadDocumentImage(src, docPath);
      if (image) img.setAttribute('src', image.dataUrl);
      else img.replaceWith(errorBox('Image not found', src));
    })
  );

  const holder = document.createElement('div');
  holder.append(root);
  return holder.innerHTML;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A complete standalone HTML document around the rendered body. */
export async function buildStandaloneHtml(
  body: string,
  options: { title: string; author?: string; pageSize?: string }
): Promise<string> {
  const fonts = await embeddedFontFaces();
  return `<!doctype html>
<html lang="${document.documentElement.lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markloom">
${options.author ? `<meta name="author" content="${escapeHtml(options.author)}">` : ''}
<title>${escapeHtml(options.title)}</title>
<style>
${fonts}
@page { size: ${options.pageSize ?? 'A4'}; margin: 18mm 16mm; }
${EXPORT_STYLES}
</style>
</head>
<body>
<main class="document">
${body}
</main>
</body>
</html>`;
}
