// Word export built on the same markdown-it tokens as the preview, so structure
// (nesting, tables, task lists, code) matches what the user sees.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import { saveAs } from 'file-saver';
import { getMarkdownParser, mermaidFence, mermaidFences, type Token } from '@/lib/markdown';
import { CALLOUT_COLORS, CALLOUT_LABELS, type CalloutKind } from '@/lib/callouts';
import { loadDocumentImage, loadUnique, renderDiagram, svgDataUrl, toPngBytes, type ExportImage } from './assets';
import { imageSources } from './inlineLines';
import type { ExportRequest } from './exporters';

const MAX_IMAGE_WIDTH = 600; // px, fits A4/Letter text width

const BODY_FONT = 'Calibri';

const CODE_FONT = 'Consolas';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

interface ListFrame {
  ordered: boolean;
  instance: number;
}

interface ItemFrame {
  firstParagraph: boolean;
  task: boolean;
}

interface WalkState {
  /** Every image source in the document; null when it couldn't be loaded */
  images: Map<string, ImageMaker | null>;
  /** Every diagram's source */
  diagrams: Map<string, DiagramMaker>;
  lists: ListFrame[];
  items: ItemFrame[];
  quoteDepth: number;
  /** Callout kind of each open quote, innermost last ('' for a plain quote) */
  callouts: string[];
  nextListInstance: number;
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
}

// ---------------------------------------------------------------------------
// Images

function fitted(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_WIDTH / width);

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Builds a new run for each occurrence of an image, with that occurrence's alt text. */
type ImageMaker = (alt: string) => ImageRun;

/** Builds a new paragraph for each occurrence of a diagram. */
type DiagramMaker = () => Paragraph;

/** Converts an image once (rasterizing what Word can't show natively), for every place it's used. */
async function prepareImage(image: ExportImage): Promise<ImageMaker> {
  const transformation = fitted(image.width, image.height);
  const altTextFor = (alt: string) => ({ name: alt || 'Image', title: alt || 'Image', description: alt || '' });

  const regular: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
  };

  const type = regular[image.mime];

  if (type) return (alt) => new ImageRun({ type, data: image.bytes, transformation, altText: altTextFor(alt) });

  const png = await toPngBytes(image.dataUrl, image.width, image.height);

  if (image.mime === 'image/svg+xml') {
    return (alt) =>
      new ImageRun({ type: 'svg', data: image.bytes, fallback: { type: 'png', data: png }, transformation, altText: altTextFor(alt) });
  }

  return (alt) => new ImageRun({ type: 'png', data: png, transformation, altText: altTextFor(alt) });
}

function diagramError(message: string): DiagramMaker {
  return () =>
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'FEF2F2', color: 'auto' },
      children: [
        new TextRun({ text: 'Diagram could not be rendered: ', bold: true, color: '991B1B' }),
        new TextRun({ text: message, color: '991B1B' }),
      ],
    });
}

async function prepareDiagram(code: string): Promise<DiagramMaker> {
  const diagram = await renderDiagram(code);

  if (!diagram.ok) return diagramError(diagram.error);

  const { svg, width, height } = diagram;
  let png: Uint8Array;

  try {
    png = await toPngBytes(svgDataUrl(svg), width, height);
  } catch (error) {
    return diagramError(error instanceof Error ? error.message : String(error));
  }

  return () =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 200 },
      children: [
        new ImageRun({
          type: 'svg',
          data: new TextEncoder().encode(svg),
          fallback: { type: 'png', data: png },
          transformation: fitted(width, height),
          altText: { name: 'Diagram', title: 'Diagram', description: code.slice(0, 200) },
        }),
      ],
    });
}

// ---------------------------------------------------------------------------
// Inline content

function inlineRuns(tokens: Token[] | null, state: WalkState, base: RunStyle = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const style: RunStyle = { ...base };
  let link: { href: string; runs: TextRun[] } | null = null;

  const push = (run: TextRun) => (link ? link.runs.push(run) : out.push(run));

  // docx skips a run property that is undefined, so a run outside a link gets no colour or underline
  const text = (value: string, extra: IRunOptions = {}) =>
    new TextRun({
      text: value,
      ...style,
      color: link ? '1D4ED8' : undefined,
      underline: link ? {} : undefined,
      ...extra,
    });

  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text':
        push(text(token.content));
        break;
      case 'code_inline':
        push(text(token.content, { font: CODE_FONT, color: '9F1239', shading: { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' } }));
        break;
      case 'math_inline':
        // Typeset math comes later; until then the formula stays readable as its source
        push(text(`$${token.content}$`));
        break;
      case 'strong_open': style.bold = true; break;
      case 'strong_close': style.bold = base.bold ?? false; break;
      case 'em_open': style.italics = true; break;
      case 'em_close': style.italics = false; break;
      case 's_open': style.strike = true; break;
      case 's_close': style.strike = false; break;
      case 'softbreak':
        push(text(' '));
        break;
      case 'hardbreak':
        push(new TextRun({ break: 1 }));
        break;
      case 'link_open':
        link = { href: token.attrGet('href') ?? '', runs: [] };
        break;
      case 'link_close':
        if (link) {
          // Web and mail links stay clickable; in-document or relative links become plain text
          if (/^(https?|mailto):/i.test(link.href)) out.push(new ExternalHyperlink({ link: link.href, children: link.runs }));
          else out.push(...link.runs);
          link = null;
        }

        break;
      case 'image': {
        const src = token.attrGet('src') ?? '';
        const alt = token.content;
        const make = state.images.get(src);

        if (make) out.push(make(alt));
        else push(text(`[Image not found: ${alt || src}]`, { italics: true, color: '991B1B' }));
        break;
      }

      case 'html_inline':
        if (/^<br\s*\/?>$/i.test(token.content)) push(new TextRun({ break: 1 }));
        // Other inline HTML (including our task checkboxes) carries no text
        break;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Block context: lists and quotes decide numbering, indentation and borders

function blockOptions(state: WalkState): Partial<IParagraphOptions> {
  const list = state.lists[state.lists.length - 1];
  const item = state.items[state.items.length - 1];
  const level = Math.max(0, state.lists.length - 1);
  let numbering: IParagraphOptions['numbering'];
  let indentLeft = 0;
  let spacing: IParagraphOptions['spacing'];
  let border: IParagraphOptions['border'];

  if (list && item) {
    if (item.firstParagraph && !item.task) {
      numbering = list.ordered
        ? { reference: 'ordered', level, instance: list.instance }
        : { reference: 'bullets', level };
    } else {
      indentLeft = 720 * (level + 1);
    }

    item.firstParagraph = false;
    spacing = { after: 60 };
  }

  if (state.quoteDepth > 0) {
    indentLeft += 360 * state.quoteDepth;
    // SAFETY: callouts holds data-callout values, which lib/markdown.ts sets from a CalloutKind, or ''.
    const callout = state.callouts[state.callouts.length - 1] as CalloutKind | '';
    const color = callout ? CALLOUT_COLORS[callout] : 'D9DCE1';
    border = { left: { style: BorderStyle.SINGLE, size: callout ? 18 : 12, color, space: 10 } };
  }

  // docx skips undefined paragraph properties, as it did the keys this function used to leave out
  return { numbering, indent: indentLeft > 0 ? { left: indentLeft } : undefined, spacing, border };
}

function codeParagraph(code: string): Paragraph {
  const lines = code.replace(/\n$/, '').split('\n');

  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F8F9FA', color: 'auto' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E9ECEF', space: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E9ECEF', space: 4 },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E9ECEF', space: 4 },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E9ECEF', space: 4 },
    },
    spacing: { before: 120, after: 200, line: 260 },
    // One run per line with explicit breaks: Word ignores "\n" inside a run
    children: lines.map((line, index) => new TextRun({ text: line, font: CODE_FONT, size: 18, break: index > 0 ? 1 : undefined })),
  });
}

function buildTable(tokens: Token[], start: number, state: WalkState) {
  const rows: { cells: { inline: Token; header: boolean; align: string | null }[] }[] = [];
  let i = start + 1;

  for (; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
    const t = tokens[i];

    if (t.type === 'tr_open') rows.push({ cells: [] });

    if (t.type === 'th_open' || t.type === 'td_open') {
      const align = (t.attrGet('style') ?? '').match(/text-align:\s*(\w+)/)?.[1] ?? null;
      rows[rows.length - 1].cells.push({ inline: tokens[i + 1], header: t.type === 'th_open', align });
    }
  }

  const alignments: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  };

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9DCE1' };

  const tableRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        children: row.cells.map(
          (cell) =>
            new TableCell({
              shading: cell.header ? { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              borders: { top: border, bottom: border, left: border, right: border },
              children: [
                new Paragraph({
                  alignment: cell.align ? alignments[cell.align] : undefined,
                  children: inlineRuns(cell.inline.children, state, { bold: cell.header }),
                }),
              ],
            })
        ),
      })
  );

  return { table: new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }), end: i };
}

function walk(tokens: Token[], state: WalkState): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'heading_open': {
        const level = Number(token.tag.slice(1)) - 1;
        blocks.push(
          new Paragraph({
            heading: HEADINGS[level],
            keepNext: true,
            children: inlineRuns(tokens[i + 1].children, state),
          })
        );
        i += 2;
        break;
      }

      case 'paragraph_open': {
        const inline = tokens[i + 1];
        const item = state.items[state.items.length - 1];
        const prefix: ParagraphChild[] = [];

        if (item?.task && item.firstParagraph) {
          const checked = /checked/.test(inline.children?.find((c) => c.type === 'html_inline')?.content ?? '');
          prefix.push(new TextRun({ text: checked ? '☑ ' : '☐ ', font: 'Segoe UI Symbol' }));
        }

        blocks.push(
          new Paragraph({
            ...blockOptions(state),
            children: [...prefix, ...inlineRuns(inline.children, state)],
          })
        );
        i += 2;
        break;
      }

      case 'bullet_list_open':
      case 'ordered_list_open':
        state.lists.push({ ordered: token.type === 'ordered_list_open', instance: ++state.nextListInstance });
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        state.lists.pop();
        break;
      case 'list_item_open':
        state.items.push({ firstParagraph: true, task: (token.attrGet('class') ?? '').includes('task-list-item') });
        break;
      case 'list_item_close':
        state.items.pop();
        break;
      case 'blockquote_open':
        state.quoteDepth++;
        state.callouts.push(token.attrGet('data-callout') ?? '');
        break;
      case 'blockquote_close':
        state.quoteDepth--;
        state.callouts.pop();
        break;
      case 'fence':
      case 'code_block': {
        const diagram = mermaidFence(token);
        // Every diagram's source is in the map, so only ordinary code has no maker
        const make = diagram && state.diagrams.get(diagram.code);
        blocks.push(make ? make() : codeParagraph(token.content));
        break;
      }

      case 'math_block':
        // Written as source, in the code style, until typeset math comes to Word
        blocks.push(codeParagraph(token.content.includes('\n') ? `$$\n${token.content}\n$$` : `$$${token.content}$$`));
        break;

      case 'hr':
        blocks.push(
          new Paragraph({
            spacing: { before: 240, after: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D9DCE1', space: 1 } },
            children: [],
          })
        );
        break;
      case 'table_open': {
        const { table, end } = buildTable(tokens, i, state);
        blocks.push(table, new Paragraph({ children: [], spacing: { after: 120 } }));
        i = end;
        break;
      }

      case 'html_block': {
        // SAFETY: calloutTitle meta is set by the callouts rule in lib/markdown.ts, from a CalloutKind.
        const callout = token.meta?.calloutTitle as CalloutKind | undefined;

        if (callout) {
          blocks.push(
            new Paragraph({
              ...blockOptions(state),
              keepNext: true,
              spacing: { after: 60 },
              children: [new TextRun({ text: CALLOUT_LABELS[callout], bold: true, color: CALLOUT_COLORS[callout] })],
            })
          );
          break;
        }

        const textContent = new DOMParser().parseFromString(token.content, 'text/html').body.textContent?.trim();

        if (textContent) blocks.push(new Paragraph({ ...blockOptions(state), children: [new TextRun(textContent)] }));
        break;
      }
    }
  }

  return blocks;
}

const BULLETS = ['•', '◦', '▪'];

const ORDERED_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];

export async function exportDocx(request: ExportRequest): Promise<void> {
  const tokens = getMarkdownParser().parse(request.markdown, {});

  // Every distinct image and diagram is prepared at once; the document is then built without waiting
  const [images, diagrams] = await Promise.all([
    loadUnique(tokens.flatMap(imageSources), async (src) => {
      const image = await loadDocumentImage(src, request.docPath);

      return image ? prepareImage(image) : null;
    }),
    loadUnique(mermaidFences(tokens).map(({ code }) => code), prepareDiagram),
  ]);

  const state: WalkState = { images, diagrams, lists: [], items: [], quoteDepth: 0, callouts: [], nextListInstance: 0 };
  const children = walk(tokens, state);

  const levels = (ordered: boolean) =>
    Array.from({ length: 6 }, (_, level) => ({
      level,
      format: ordered ? ORDERED_FORMATS[level % 3] : LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : BULLETS[level % 3],
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    }));

  const doc = new Document({
    creator: request.author || 'Markloom',
    title: request.title,
    description: 'Exported from Markloom',
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 22, color: '1A1A1A' }, paragraph: { spacing: { after: 160, line: 288 } } },
        heading1: { run: { font: BODY_FONT, size: 36, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 360, after: 160 } } },
        heading2: { run: { font: BODY_FONT, size: 30, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 320, after: 120 } } },
        heading3: { run: { font: BODY_FONT, size: 26, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 280, after: 100 } } },
        heading4: { run: { font: BODY_FONT, size: 23, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 240, after: 80 } } },
        heading5: { run: { font: BODY_FONT, size: 22, bold: true, color: '3F3F46' } },
        heading6: { run: { font: BODY_FONT, size: 22, bold: true, color: '5A5A5A' } },
      },
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(false) },
        { reference: 'ordered', levels: levels(true) },
      ],
    },
    sections: [{ children }],
  });

  saveAs(await Packer.toBlob(doc), `${request.title}.docx`);
}
