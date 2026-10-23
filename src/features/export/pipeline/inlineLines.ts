// Where each inline token (paragraph text, list item, heading, table cell) sits in the source.
import type { Token } from '@/lib/markdown';

export interface PlacedInline {
  token: Token;
  /** 0-based [first line, line after the last], like markdown-it's own `map` */
  lines: [number, number];
}

/**
 * The inline tokens of a parsed document with their source lines, in document order.
 * markdown-it gives table-cell inline tokens no map, so those take their row's.
 */
export function placedInlines(tokens: Token[]): PlacedInline[] {
  const placed: PlacedInline[] = [];
  let rowLines: [number, number] | null = null;

  for (const token of tokens) {
    if (token.type === 'tr_open') rowLines = token.map;

    if (token.type === 'tbody_close' || token.type === 'table_close') rowLines = null;

    if (token.type !== 'inline') continue;

    const lines = token.map ?? rowLines;

    if (lines) placed.push({ token, lines });
  }

  return placed;
}

export interface PlacedChild {
  child: Token;
  /** 1-based source line the child starts on */
  line: number;
}

/**
 * Every child of the document's inline tokens with the line it starts on, in document order.
 * A paragraph spans several lines: each line break moves the children after it one line down,
 * and so does a newline inside a child's own source (a formula or image alt text that wraps).
 * Table cells sit on their row's line.
 */
export function placedChildren(tokens: Token[]): PlacedChild[] {
  return placedInlines(tokens).flatMap(({ token, lines }) => {
    let line = lines[0] + 1;

    return (token.children ?? []).map((child) => {
      if (child.type === 'softbreak' || child.type === 'hardbreak') line++;

      const placed = { child, line };
      line += child.content.split('\n').length - 1;

      return placed;
    });
  });
}

/** The sources of the images in an inline token; block tokens have no children, so none. */
export function imageSources(token: Token): string[] {
  return (token.children ?? []).flatMap((child) => (child.type === 'image' ? [child.attrGet('src') ?? ''] : []));
}
