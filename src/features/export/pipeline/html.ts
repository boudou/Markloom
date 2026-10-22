// One HTML rendering of the document for PDF and HTML exports and Copy as rich text: the
// preview's sanitized markup, diagrams and images placed by an embedder (inline SVG and
// embedded images for a file), the app's fonts included in a standalone file.
import { parseMarkdown } from '@/lib/markdown';
import { loadHighlighter } from '@/features/syntax-highlight';
import { blobToDataUrl, loadDocumentImage, loadUnique, renderDiagram } from './assets';
import { EXPORT_STYLES } from './styles';
import { DEFAULT_PAGE_SETUP, pageRule, type PageSetup } from './pageGeometry';

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

const ID_LIST_ATTRIBUTES = ['aria-labelledby', 'aria-describedby'];

/**
 * Appends `suffix` to every id in an inline diagram and to the references to them (`#id`,
 * `url(#id)`, stylesheet selectors, ARIA id lists). Identical diagrams share one cached
 * render, so a repeated copy would otherwise duplicate the ids and its markers would
 * resolve to the first copy.
 */
function suffixDiagramIds(svg: SVGSVGElement, suffix: string) {
  const elements = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const ids = new Set(elements.flatMap((element) => (element.id ? [element.id] : [])));
  const renameRefs = (text: string) => text.replace(/#([\w-]+)/g, (ref, id: string) => (ids.has(id) ? `${ref}${suffix}` : ref));

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'id') {
        attribute.value += suffix;
      } else if (ID_LIST_ATTRIBUTES.includes(attribute.name)) {
        attribute.value = attribute.value.replace(/\S+/g, (id) => (ids.has(id) ? `${id}${suffix}` : id));
      } else if (attribute.value.includes('#')) {
        attribute.value = renameRefs(attribute.value);
      }
    }
  }

  // Label text stays as written: only the stylesheet's selectors name ids
  for (const style of Array.from(svg.querySelectorAll('style'))) {
    style.textContent = renameRefs(style.textContent ?? '');
  }
}

/** How a diagram goes into the body: inline SVG, an image, or an error box. */
export type DiagramPlacement =
  | { kind: 'svg'; svg: string }
  | { kind: 'img'; src: string; width: number; height: number }
  | { kind: 'error'; error: string };

/** How an image goes into the body: its address left as written, or replaced (and sized when given). */
export type ImagePlacement = { kind: 'keep'; src: string } | { kind: 'img'; src: string; width?: number; height?: number };

/** Turns the body's diagrams and images into final placements; `image` returns null when it can't be loaded. */
export interface BodyEmbed {
  diagram: (code: string) => Promise<DiagramPlacement>;
  image: (src: string, docPath: string | null) => Promise<ImagePlacement | null>;
}

/** A standalone file: diagrams as inline SVG, every image embedded at its natural size. */
const FILE_EMBED: BodyEmbed = {
  async diagram(code) {
    const diagram = await renderDiagram(code);

    return diagram.ok ? { kind: 'svg', svg: diagram.svg } : { kind: 'error', error: diagram.error };
  },
  async image(src, docPath) {
    const image = await loadDocumentImage(src, docPath);

    return image ? { kind: 'img', src: image.dataUrl } : null;
  },
};

/** The document body as self-contained HTML, with diagrams and images placed by `embed`. */
export async function renderExportBody(markdown: string, docPath: string | null, embed: BodyEmbed = FILE_EMBED): Promise<string> {
  await loadHighlighter();
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(markdown);
  const root = template.content;

  const slots = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-container[data-mermaid]'), (slot) => ({
    slot,
    code: decodeURIComponent(slot.getAttribute('data-mermaid') ?? ''),
  }));

  const images = Array.from(root.querySelectorAll('img'), (img) => ({ img, src: img.getAttribute('src') ?? '' }));

  // Every distinct diagram and image is requested at once; the markup is then built without waiting
  const [diagrams, loaded] = await Promise.all([
    loadUnique(slots.map(({ code }) => code), embed.diagram),
    loadUnique(images.map(({ src }) => src), (src) => embed.image(src, docPath)),
  ]);

  const diagramCopies = new Map<string, number>();

  for (const { slot, code } of slots) {
    // SAFETY: loadUnique returns a result for every code in slots
    const diagram = diagrams.get(code)!;
    const figure = document.createElement('figure');
    figure.className = 'diagram';

    switch (diagram.kind) {
      case 'svg': {
        // Sanitized by Mermaid itself (strict security level). Parsed per slot, so each copy has its own nodes
        figure.innerHTML = diagram.svg;
        const svg = figure.querySelector('svg');

        if (svg?.id) {
          const copies = (diagramCopies.get(svg.id) ?? 0) + 1;
          diagramCopies.set(svg.id, copies);

          // The first copy keeps Mermaid's ids; later ones become `…x2`, `…x3`
          if (copies > 1) suffixDiagramIds(svg, `x${copies}`);
        }

        break;
      }

      case 'img': {
        // An image, not inline SVG, so no ids to keep apart
        const img = document.createElement('img');
        img.src = diagram.src;
        img.alt = 'Diagram';
        img.setAttribute('width', String(diagram.width));
        img.setAttribute('height', String(diagram.height));
        figure.append(img);

        break;
      }

      case 'error':
        figure.append(errorBox('Diagram could not be rendered', diagram.error));

        break;
    }

    slot.replaceWith(figure);
  }

  for (const { img, src } of images) {
    const image = loaded.get(src);

    if (!image) {
      img.replaceWith(errorBox('Image not found', src));

      continue;
    }

    img.setAttribute('src', image.src);

    if (image.kind === 'img' && image.width !== undefined && image.height !== undefined) {
      img.setAttribute('width', String(image.width));
      img.setAttribute('height', String(image.height));
    }
  }

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
  options: { title: string; author?: string; page?: PageSetup }
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
${pageRule(options.page ?? DEFAULT_PAGE_SETUP)}
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
