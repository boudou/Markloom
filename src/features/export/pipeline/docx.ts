// Word export built on the same markdown-it tokens as the preview, so structure
// (nesting, tables, task lists, code) matches what the user sees.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
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
import { renderMathImage, type MathImage } from './mathImage';
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
  /** Every inline formula's TeX, drawn */
  inlineMath: Map<string, MathImage>;
  /** Every display formula's TeX, drawn */
  displayMath: Map<string, MathImage>;
  lists: ListFrame[];
  items: ItemFrame[];
  quoteDepth: number;
  /** Callout kind of each open quote, innermost last ('' for a plain quote) */
  callouts: string[];
  nextListInstance: number;
  /** Word footnotes by id, filled when the walk reaches the notes at the end of the tokens */
  footnotes: Record<string, { children: Paragraph[] }>;
  /** True while walking a footnote's content */
  inFootnote: boolean;
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
// Math: images, since there is no TeX-to-Word-equation converter

const MATH_ERROR_COLOR = '991B1B';

/** A formula's image; its alt text is the TeX. */
function mathRun(tex: string, png: Uint8Array, transformation: { width: number; height: number }): ImageRun {
  return new ImageRun({ type: 'png', data: png, transformation, altText: { name: 'Formula', title: tex, description: tex } });
}

/** A display formula centred on its own line, or its `$$…$$` source in red when it can't be drawn. */
function mathParagraph(tex: string, image: MathImage | undefined, state: WalkState): Paragraph {
  if (!image?.ok) {
    const lines = tex.includes('\n') ? ['$$', ...tex.split('\n'), '$$'] : [`$$${tex}$$`];

    return new Paragraph({
      ...blockOptions(state),
      children: lines.map((line, index) => new TextRun({ text: line, color: MATH_ERROR_COLOR, break: index > 0 ? 1 : undefined })),
    });
  }

  return new Paragraph({
    ...blockOptions(state),
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 200 },
    children: [mathRun(tex, image.png, fitted(image.width, image.height))],
  });
}

// ---------------------------------------------------------------------------
// Footnotes

/**
 * A note's Word footnote id: the plugin's 0-based meta.id plus one, the number the preview shows.
 * Word keeps ids -1 and 0 for the separator lines.
 */
function noteId(token: Token): number {
  return Number(token.meta?.id) + 1;
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
      case 'math_inline': {
        const image = state.inlineMath.get(token.content);

        // At 1x it matches the 11pt text; Word sets it on the baseline, so a descent sits slightly high
        if (image?.ok) out.push(mathRun(token.content, image.png, { width: image.width, height: image.height }));
        else push(text(`$${token.content}$`, { color: MATH_ERROR_COLOR }));
        break;
      }

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

      case 'footnote_ref':
        // Word has no footnotes inside a footnote, so a reference there keeps its number as text
        if (state.inFootnote) push(text(String(noteId(token)), { superScript: true }));
        else out.push(new FootnoteReferenceRun(noteId(token)));
        break;

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
  return { style: state.inFootnote ? 'FootnoteText' : undefined, numbering, indent: indentLeft > 0 ? { left: indentLeft } : undefined, spacing, border };
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

interface TableCellTokens {
  inline: Token;
  header: boolean;
  align: string | null;
}

interface TableTokens {
  /** Cells, row by row */
  rows: TableCellTokens[][];
  /** Index of the table's table_close */
  end: number;
}

/** The cells of the table opened at `start` */
function tableCells(tokens: Token[], start: number): TableTokens {
  const rows: TableCellTokens[][] = [];
  let i = start + 1;

  for (; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
    const t = tokens[i];

    if (t.type === 'tr_open') rows.push([]);

    if (t.type === 'th_open' || t.type === 'td_open') {
      const align = (t.attrGet('style') ?? '').match(/text-align:\s*(\w+)/)?.[1] ?? null;
      rows[rows.length - 1].push({ inline: tokens[i + 1], header: t.type === 'th_open', align });
    }
  }

  return { rows, end: i };
}

/** A table as one paragraph per row, cells apart by a tab: Word footnotes hold only paragraphs */
function tableParagraphs(rows: TableCellTokens[][], state: WalkState): Paragraph[] {
  return rows.map(
    (row) =>
      new Paragraph({
        ...blockOptions(state),
        children: row.flatMap((cell, index) => [
          ...(index > 0 ? [new TextRun({ children: [new Tab()] })] : []),
          ...inlineRuns(cell.inline.children, state, { bold: cell.header }),
        ]),
      })
  );
}

function buildTable(rows: TableCellTokens[][], state: WalkState): Table {
  const alignments: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  };

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9DCE1' };

  const tableRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        children: row.map(
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

  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/**
 * Turns the notes block at the end of the tokens (footnote_block_open at `start`) into Word
 * footnotes, each note's blocks walked like the body's. Returns the index of footnote_block_close.
 */
function collectFootnotes(tokens: Token[], start: number, state: WalkState): number {
  let i = start + 1;

  for (; i < tokens.length && tokens[i].type !== 'footnote_block_close'; i++) {
    if (tokens[i].type !== 'footnote_open') continue;

    const id = noteId(tokens[i]);
    let end = i + 1;

    // Notes don't nest, so the next footnote_close is this note's
    while (end < tokens.length && tokens[end].type !== 'footnote_close') end++;

    state.inFootnote = true;
    // Tables come out as paragraphs while inFootnote is set, so every block is a paragraph
    const children = walk(tokens.slice(i + 1, end), state).flatMap((block) => (block instanceof Paragraph ? [block] : []));
    state.inFootnote = false;

    // An empty note still needs a paragraph, which carries Word's footnote mark
    state.footnotes[id] = { children: children.length > 0 ? children : [new Paragraph({ style: 'FootnoteText', children: [] })] };
    i = end;
  }

  return i;
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
        blocks.push(mathParagraph(token.content, state.displayMath.get(token.content), state));
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
        const { rows, end } = tableCells(tokens, i);

        if (state.inFootnote) blocks.push(...tableParagraphs(rows, state));
        else blocks.push(buildTable(rows, state), new Paragraph({ children: [], spacing: { after: 120 } }));
        i = end;
        break;
      }

      case 'footnote_block_open':
        i = collectFootnotes(tokens, i, state);
        break;
      case 'footnote_anchor':
        // The preview's link back to the reference; Word links a footnote to its mark itself
        break;

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

  const inlineFormulas = tokens.flatMap((token) => (token.children ?? []).flatMap((child) => (child.type === 'math_inline' ? [child.content] : [])));
  const displayFormulas = tokens.flatMap((token) => (token.type === 'math_block' ? [token.content] : []));

  // Every distinct image, diagram and formula is prepared at once (formulas are drawn one at a
  // time); the document is then built without waiting
  const [images, diagrams, inlineMath, displayMath] = await Promise.all([
    loadUnique(tokens.flatMap(imageSources), async (src) => {
      const image = await loadDocumentImage(src, request.docPath);

      return image ? prepareImage(image) : null;
    }),
    loadUnique(mermaidFences(tokens).map(({ code }) => code), prepareDiagram),
    loadUnique(inlineFormulas, (tex) => renderMathImage(tex, false)),
    loadUnique(displayFormulas, (tex) => renderMathImage(tex, true)),
  ]);

  const state: WalkState = { images, diagrams, inlineMath, displayMath, lists: [], items: [], quoteDepth: 0, callouts: [], nextListInstance: 0, footnotes: {}, inFootnote: false };
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
    footnotes: state.footnotes,
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
