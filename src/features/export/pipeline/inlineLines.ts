// Where each inline token (paragraph text, list item, heading, table cell) sits in the source.
import type MarkdownIt from 'markdown-it';

type Token = ReturnType<MarkdownIt['parse']>[number];

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
    if (token.type !== 'inline') continue;

    const lines = token.map ?? rowLines;
    if (lines) placed.push({ token, lines });
  }

  return placed;
}
