// Pasted HTML (web pages, Word, Google Docs) as Markdown for the source editor. Loaded on the first
// HTML paste (htmlPaste.ts): the only module that imports turndown.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export interface PastedMarkdown {
  markdown: string;
  /** Pictures left out because their address is not on the web (Word's file:// clips, data: URIs) */
  droppedImages: number;
}

/** Anything turndown would turn into Markdown syntax; HTML without it pastes as its plain text */
const MARKUP =
  'a[href], b, strong, i, em, s, del, strike, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, hr, img, :not(pre) > code';

const WORD_LIST_ITEM = /mso-list:\s*(l\d+)\s+level(\d+)/i;

const ORDERED_MARKER = /^\s*\(?([0-9]+|[a-zA-Z]|[ivxlcdm]+)[.)]/i;

const CODE_LANGUAGE = /(?:language|lang)-(\S+)/;

let service: TurndownService | null = null;

export function pastedMarkdown(html: string, plainText: string): PastedMarkdown {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  unwrapGoogleDocsWrapper(body);
  styledSpansToElements(body);
  unwrapLonelyListParagraphs(body);
  convertWordLists(body);
  const droppedImages = removeLocalImages(body);
  cleanLinks(body);

  if (!body.querySelector(MARKUP)) return { markdown: plainText, droppedImages };

  return { markdown: converter().turndown(body), droppedImages };
}

function unwrap(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function wrapChildren(element: Element, tag: string): void {
  const wrapper = element.ownerDocument.createElement(tag);

  wrapper.append(...Array.from(element.childNodes));
  element.append(wrapper);
}

function styleOf(element: Element): CSSStyleDeclaration | null {
  return element instanceof HTMLElement ? element.style : null;
}

/** Google Docs wraps the whole selection in <b style="font-weight:normal">: as is, all of it would be bold */
function unwrapGoogleDocsWrapper(body: HTMLElement): void {
  for (const bold of Array.from(body.querySelectorAll('b, strong'))) {
    const weight = styleOf(bold)?.fontWeight;

    if (weight === 'normal' || weight === '400') unwrap(bold);
  }
}

/** Google Docs writes bold, italic and strikethrough as styled spans, not <b>, <i> and <s> */
function styledSpansToElements(body: HTMLElement): void {
  for (const span of Array.from(body.querySelectorAll('span'))) {
    const style = styleOf(span);

    if (!style || span.closest('pre, code')) continue;

    const weight = style.fontWeight;
    const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
    const decoration = `${style.textDecorationLine} ${style.textDecoration}`;

    if (decoration.includes('line-through')) wrapChildren(span, 'del');

    if (style.fontStyle === 'italic') wrapChildren(span, 'em');

    if (bold && !span.closest('h1, h2, h3, h4, h5, h6')) wrapChildren(span, 'strong');
  }
}

/** A list item holding one paragraph (Google Docs) would otherwise make the list loose */
function unwrapLonelyListParagraphs(body: HTMLElement): void {
  for (const item of Array.from(body.querySelectorAll('li'))) {
    const paragraphs = item.querySelectorAll(':scope > p');

    if (paragraphs.length === 1) unwrap(paragraphs[0]);
  }
}

interface WordListItem {
  level: number;
  ordered: boolean;
}

/** A Word "list" paragraph: its level, and whether its marker (·, o, §, 1., a)) numbers it */
function wordListItem(paragraph: HTMLParagraphElement): WordListItem | null {
  const match = WORD_LIST_ITEM.exec(paragraph.getAttribute('style') ?? '');

  if (!match) return null;

  const marker = paragraph.querySelector('span[style*="mso-list:Ignore" i]');
  const ordered = ORDERED_MARKER.test(marker?.textContent ?? '');

  marker?.remove();

  return { level: Number(match[2]), ordered };
}

/** The sibling before `node`, past whitespace and comments (Word's <![if !supportLists]>) */
function previousContentSibling(node: Node): Node | null {
  let sibling = node.previousSibling;

  while (sibling && (sibling.nodeType === Node.COMMENT_NODE || (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()))) {
    sibling = sibling.previousSibling;
  }

  return sibling;
}

interface OpenList {
  list: HTMLElement;
  level: number;
}

/** Word writes lists as indented paragraphs; each run of them becomes nested <ul>/<ol> */
function convertWordLists(body: HTMLElement): void {
  const doc = body.ownerDocument;
  // A run's outer list -> the lists open in it, outermost first
  const runs = new Map<Node, OpenList[]>();

  for (const paragraph of Array.from(body.querySelectorAll('p'))) {
    const item = wordListItem(paragraph);

    if (!item) continue;

    const listTag = item.ordered ? 'ol' : 'ul';
    const previous = previousContentSibling(paragraph);
    let open = previous ? runs.get(previous) : undefined;

    if (!open) {
      const list = doc.createElement(listTag);

      paragraph.before(list);
      open = [{ list, level: item.level }];
      runs.set(list, open);
    }

    while (open.length > 1 && open[open.length - 1].level > item.level) open.pop();

    const innermost = open[open.length - 1];
    const parentItem = innermost.list.lastElementChild;

    if (item.level > innermost.level && parentItem) {
      const nested = doc.createElement(listTag);

      parentItem.append(nested);
      open.push({ list: nested, level: item.level });
    }

    const listItem = doc.createElement('li');

    listItem.append(...Array.from(paragraph.childNodes));
    open[open.length - 1].list.append(listItem);
    paragraph.remove();
  }
}

/** Drops pictures that only exist on the copying machine; returns how many */
function removeLocalImages(body: HTMLElement): number {
  let dropped = 0;

  for (const image of Array.from(body.querySelectorAll('img'))) {
    if (/^https?:/i.test(image.getAttribute('src') ?? '')) continue;

    image.remove();
    dropped++;
  }

  return dropped;
}

/** Keeps only web, mail and in-page links, and drops empty ones (heading anchor icons) */
function cleanLinks(body: HTMLElement): void {
  for (const link of Array.from(body.querySelectorAll('a[href]'))) {
    const href = link.getAttribute('href') ?? '';

    if (!/^(?:https?:|mailto:|#)/i.test(href)) unwrap(link);
    else if (!link.textContent?.trim() && !link.querySelector('img')) link.remove();
  }
}

/** One fence longer than any backtick run that starts a line of the code, at least three */
function fenceFor(code: string): string {
  let longest = 0;

  for (const match of code.matchAll(/^\s*(`+)/gm)) longest = Math.max(longest, match[1].length);

  return '`'.repeat(Math.max(3, longest + 1));
}

function codeLanguage(pre: HTMLElement): string {
  const code = pre.querySelector(':scope > code');

  return CODE_LANGUAGE.exec(pre.className)?.[1] ?? CODE_LANGUAGE.exec(code?.className ?? '')?.[1] ?? '';
}

function tableCell(turndown: TurndownService, cell: HTMLTableCellElement): string {
  return turndown.turndown(cell).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

/** A GFM table built from the DOM; the first row is the header also without <th> (Word, Google Docs) */
function tableMarkdown(turndown: TurndownService, table: HTMLTableElement): string {
  const rows = Array.from(table.rows, (row) =>
    Array.from(row.cells).flatMap((cell) => [tableCell(turndown, cell), ...Array<string>(Math.max(0, cell.colSpan - 1)).fill('')])
  );

  if (rows.length === 0) return '';

  const columns = Math.max(1, ...rows.map((row) => row.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array<string>(columns - cells.length).fill('')].join(' | ')} |`;
  const [header, ...body] = rows;

  return `\n\n${[line(header), line(Array<string>(columns).fill('---')), ...body.map(line)].join('\n')}\n\n`;
}

function converter(): TurndownService {
  if (service) return service;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    br: '\\',
  });

  turndown.use(gfm);
  turndown.remove(['script', 'style', 'meta', 'link', 'title', 'noscript']);

  // Rules added later win: these replace turndown's and the plugin's own
  turndown.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentElement;
      let prefix = '- ';

      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? '1');

        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }

      const paragraph = content.endsWith('\n');
      const text = content.replace(/^\n+/, '').replace(/\n+$/, '') + (paragraph ? '\n' : '');

      return prefix + text.replace(/\n/g, `\n${' '.repeat(prefix.length)}`) + (node.nextSibling ? '\n' : '');
    },
  });

  turndown.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`,
  });

  turndown.addRule('preformatted', {
    filter: 'pre',
    replacement: (_content, node) => {
      const code = (node.textContent ?? '').replace(/\n$/, '');
      const fence = fenceFor(code);

      return `\n\n${fence}${codeLanguage(node)}\n${code}\n${fence}\n\n`;
    },
  });

  turndown.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => (node instanceof HTMLTableElement ? tableMarkdown(turndown, node) : ''),
  });

  service = turndown;

  return turndown;
}
