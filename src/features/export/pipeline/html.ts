// One HTML rendering of the document for PDF and HTML exports and Copy as rich text: the
// preview's sanitized markup, diagrams and images placed by an embedder (inline SVG and
// embedded images for a file), the app's fonts included in a standalone file.
import { parseMarkdown } from '@/lib/markdown';
import { loadHighlighter } from '@/features/syntax-highlight';
import { takeMathSlots, typesetMath } from '@/features/math';
import { loadDocumentImage, loadUnique, renderDiagram } from './assets';
import { embeddedFontFaces, mathExportCss } from './fonts';
import { EXPORT_STYLES, PAGED_STYLES } from './styles';
import { contentBox, DEFAULT_PAGE_SETUP, PAGE_MARGINS_MM, pageBox, pageRule, type PageSetup } from './pageGeometry';
import type { PagedDocument } from './pages';

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

/**
 * How an image goes into the body: its address left as written, replaced (and sized when
 * given), or an error box with `title` and the address when it loaded but can't be placed.
 */
export type ImagePlacement =
  | { kind: 'keep'; src: string }
  | { kind: 'img'; src: string; width?: number; height?: number }
  | { kind: 'error'; title: string };

/**
 * How a formula goes into the body: KaTeX's HTML (which needs its stylesheet), an image with
 * its depth below the baseline (CSS px), or its `$…$` source in red when it can't be drawn.
 */
export type MathPlacement =
  | { kind: 'html'; html: string }
  | { kind: 'img'; src: string; width: number; height: number; depth: number }
  | { kind: 'error'; error: string };

/**
 * Turns the body's diagrams, images and formulas into final placements; `image` returns null
 * when the image can't be loaded (shown as "Image not found").
 */
export interface BodyEmbed {
  diagram: (code: string) => Promise<DiagramPlacement>;
  image: (src: string, docPath: string | null) => Promise<ImagePlacement | null>;
  math: (tex: string, display: boolean) => Promise<MathPlacement>;
}

/** A standalone file: diagrams as inline SVG, every image embedded at its natural size, math typeset. */
const FILE_EMBED: BodyEmbed = {
  async math(tex, display) {
    return { kind: 'html', html: await typesetMath(tex, display) };
  },
  async diagram(code) {
    const diagram = await renderDiagram(code);

    return diagram.ok ? { kind: 'svg', svg: diagram.svg } : { kind: 'error', error: diagram.error };
  },
  async image(src, docPath) {
    const image = await loadDocumentImage(src, docPath);

    return image ? { kind: 'img', src: image.dataUrl } : null;
  },
};

/** Fills a formula's placeholder (`span.math` or `div.math-display`, which shows `$…$` until then). */
function placeMath(slot: HTMLElement, tex: string, display: boolean, formula: MathPlacement): void {
  switch (formula.kind) {
    case 'html':
      // Sanitized by typesetMath
      slot.innerHTML = formula.html;
      slot.setAttribute('data-math-done', '');

      break;

    case 'img': {
      const img = document.createElement('img');
      img.src = formula.src;
      img.alt = tex;
      img.setAttribute('width', String(formula.width));
      img.setAttribute('height', String(formula.height));

      // Inline formulas sit on the text's baseline, their descent below it
      if (!display) img.style.verticalAlign = `-${formula.depth}px`;

      slot.replaceChildren(img);

      break;
    }

    case 'error':
      // The placeholder's text is already the source
      slot.classList.add('math-error');
      slot.title = formula.error;

      break;
  }
}

/** The document body as self-contained HTML, with diagrams, images and formulas placed by `embed`. */
export async function renderExportBody(markdown: string, docPath: string | null, embed: BodyEmbed = FILE_EMBED): Promise<string> {
  await loadHighlighter();
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(markdown);
  const root = template.content;

  const formulas = takeMathSlots(root);

  const slots = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-container[data-mermaid]'), (slot) => ({
    slot,
    code: decodeURIComponent(slot.getAttribute('data-mermaid') ?? ''),
  }));

  const images = Array.from(root.querySelectorAll('img'), (img) => ({ img, src: img.getAttribute('src') ?? '' }));

  // Every distinct diagram, image and formula is requested at once; the markup is then built without waiting
  const [diagrams, loaded, inlineMath, displayMath] = await Promise.all([
    loadUnique(slots.map(({ code }) => code), embed.diagram),
    loadUnique(images.map(({ src }) => src), (src) => embed.image(src, docPath)),
    loadUnique(formulas.flatMap(({ tex, display }) => (display ? [] : [tex])), (tex) => embed.math(tex, false)),
    loadUnique(formulas.flatMap(({ tex, display }) => (display ? [tex] : [])), (tex) => embed.math(tex, true)),
  ]);

  for (const { slot, tex, display } of formulas) {
    // SAFETY: loadUnique returns a result for every formula's TeX, inline and display apart
    const formula = (display ? displayMath : inlineMath).get(tex)!;
    placeMath(slot, tex, display, formula);
  }

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

    if (image.kind === 'error') {
      img.replaceWith(errorBox(image.title, src));

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

/**
 * The fonts every exported document carries: the app's, then KaTeX's stylesheet and fonts
 * when `body` has typeset math (so exports without math don't grow).
 */
async function documentFonts(body: string): Promise<string> {
  const [fonts, math] = await Promise.all([embeddedFontFaces(), body.includes('class="katex') ? mathExportCss() : '']);

  return `${fonts}\n${math}`;
}

/** A whole HTML document: the shared head with the fonts for its body, then `css`. */
async function htmlDocument(options: { title: string; author?: string; css: string; body: string }): Promise<string> {
  const fonts = await documentFonts(options.body);

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
${options.css}
</style>
</head>
<body>
${options.body}
</body>
</html>`;
}

/** A complete standalone HTML document around the rendered body. */
export async function buildStandaloneHtml(
  body: string,
  options: { title: string; author?: string; page?: PageSetup }
): Promise<string> {
  return htmlDocument({
    title: options.title,
    author: options.author,
    css: `${pageRule(options.page ?? DEFAULT_PAGE_SETUP)}\n${EXPORT_STYLES}`,
    body: `<main class="document">\n${body}\n</main>`,
  });
}

/**
 * The body laid out at exactly the page's content width, for measuring where pages break.
 * Matches the printed document (`@media print` in the export styles), which doesn't apply
 * on screen.
 */
export async function buildMeasuringHtml(body: string, page: PageSetup): Promise<string> {
  return htmlDocument({
    title: 'Page layout',
    css: `${EXPORT_STYLES}\n${PAGED_STYLES}\nmain.document { width: ${contentBox(page).width}px; max-width: none; margin: 0; padding: 0; }`,
    body: `<main class="document">\n${body}\n</main>`,
  });
}

/** Every page of a paged document as a fixed-size `section.page`, one per printed sheet. */
export async function buildPagedHtml(paged: PagedDocument, options: { title: string }): Promise<string> {
  const pages = paged.pages.map((html, index) => `<section class="page" data-page="${index + 1}">\n${html}\n</section>`);

  return htmlDocument({
    title: options.title,
    css: pagedSheet(paged.page),
    body: pages.join('\n'),
  });
}

/**
 * The page styles of a paged document, without fonts. Printed (PDF), each `.page` fills one
 * sheet: `@page` names the same paper as the desktop `printToPDF` options, with no print
 * margins, since the page's own padding is the margin.
 */
function pagedSheet(page: PageSetup): string {
  const box = pageBox(page);
  const { top, right, bottom, left } = PAGE_MARGINS_MM;
  const sheet = `@page { size: ${page.size} ${page.orientation}; margin: 0; }\n.page { width: ${box.width}px; height: ${box.height}px; padding: ${top}mm ${right}mm ${bottom}mm ${left}mm; }`;

  return `${EXPORT_STYLES}\n${PAGED_STYLES}\n${sheet}`;
}

/** The stylesheet of a paged document with its fonts (KaTeX's too when it has math); page images use it, so they match the preview. */
export async function pagedStyles(doc: PagedDocument): Promise<string> {
  return `${await documentFonts(doc.pages.join('\n'))}\n${pagedSheet(doc.page)}`;
}
