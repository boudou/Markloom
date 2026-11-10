// Rich-text editing re-serializes the whole document, which reformats untouched parts
// (table padding, rule style, list markers, spacing) and floods git diffs. This keeps
// the user's original text for every top-level block whose meaning didn't change.
import MarkdownIt from 'markdown-it';
import { frontMatterPlugin, mathPlugin } from '@/lib/markdown';

// Plain renderer used only to compare meaning (no highlighting, no other app plugins). It reads
// math as the preview does, so `$$x$$` and its multi-line form, as rich text writes it, match.
// Front matter is one block, as it is one rich-text node, not a rule and a setext heading.
const comparer = new MarkdownIt({ html: true, linkify: false, typographer: false }).use(mathPlugin).use(frontMatterPlugin);

interface Block {
  text: string;
  key: string;
  /** Line range in its source document [start, end) */
  start: number;
  end: number;
}

/** markdown-it's env: link reference definitions collected while parsing, by normalized label */
interface DefinitionEnv {
  references?: Record<string, { href: string; title: string }>;
}

const EMPTY_HEADING = /^#{1,6}$/;

// Starts a definition inside an uncovered run of lines; `[^…]:` is a footnote definition
const DEFINITION_START = /^ {0,3}\[/;

// Starts a footnote definition; a line that only starts with a reference (`[^1] is cited`) doesn't
const FOOTNOTE_DEFINITION = /^ {0,3}\[\^[^\]\s]+\]:/;

const keyCache = new Map<string, string>();

/** Rendered meaning of a block. Rich text writes reference links as they were, so none is resolved. */
function blockKey(text: string): string {
  let key = keyCache.get(text);

  if (key === undefined) {
    // A fresh env per render: a definition nested in a block must not leak into the next one
    key = comparer.render(text, {}).replace(/\s+/g, ' ').trim();

    if (keyCache.size > 2000) keyCache.clear();
    keyCache.set(text, key);
  }

  return key;
}

/**
 * A definition's key: a link definition by what it defines, since rich text normalizes how it is
 * written (`[guide]:   <url>` comes back as `[guide]: url`); a footnote definition by its rendered
 * text, label included (`*a*` comes back as `_a_`), unless it also reads as a link definition,
 * which renders nothing.
 */
function definitionKey(text: string): string {
  const rendered = FOOTNOTE_DEFINITION.test(text) ? blockKey(text) : '';

  if (rendered) return `definition\0${rendered}`;

  const env: DefinitionEnv = {};
  comparer.parse(text, env);
  const references = env.references ?? {};

  return `definition\0${Object.keys(references).length ? JSON.stringify(references) : text}`;
}

/**
 * Splits lines into one block per definition, so each can be matched on its own: uncovered lines
 * (link reference and footnote definitions) at every `[`, a paragraph of footnote definitions only
 * where the next definition starts, since its other lines are continuation text.
 */
function definitionBlocks(lines: string[], from: number, to: number, definitionStart = DEFINITION_START): Block[] {
  const blocks: Block[] = [];
  let start = -1;

  const close = (end: number) => {
    if (start < 0) return;
    const text = lines.slice(start, end).join('\n').replace(/\s+$/, '');

    if (text) blocks.push({ text, key: definitionKey(text), start, end: start + text.split('\n').length });
    start = -1;
  };

  for (let line = from; line < to; line++) {
    if (!lines[line].trim()) close(line);
    else if (start < 0 || definitionStart.test(lines[line])) {
      close(line);
      start = line;
    }
  }

  close(to);

  return blocks;
}

/**
 * Top-level blocks with their exact source text, including the definitions between them. Rich
 * text has one top-level node for each: a markdown-it block, or a link or footnote definition.
 * The comparer knows no footnotes, so it reads adjacent footnote definitions as one paragraph when
 * the first one isn't also a valid link definition; those are split here, one block per
 * definition, so an edit to one leaves its neighbours' text as written (#220).
 */
function splitBlocks(lines: string[], markdown: string): Block[] {
  const tokens = comparer.parse(markdown, {});
  const blocks: Block[] = [];
  let covered = 0;

  for (const token of tokens) {
    if (token.level !== 0 || !token.map || token.nesting === -1) continue;
    const start = token.map[0];
    blocks.push(...definitionBlocks(lines, covered, start));
    covered = token.map[1];
    const text = lines.slice(start, token.map[1]).join('\n').replace(/\s+$/, '');

    // markdown-it counts a list's trailing blank line as part of the list; measure the real text
    if (!text) continue;

    const end = start + text.split('\n').length;

    if (FOOTNOTE_DEFINITION.test(text)) blocks.push(...definitionBlocks(lines, start, end, FOOTNOTE_DEFINITION));
    else blocks.push({ text, key: blockKey(text), start, end });
  }

  blocks.push(...definitionBlocks(lines, covered, lines.length));

  return blocks;
}

/** The source lines [start, end) of each top-level block, 0-based: one per rich-text top-level node */
export function sourceBlocks(markdown: string): Array<{ start: number; end: number }> {
  return splitBlocks(markdown.split('\n'), markdown).map(({ start, end }) => ({ start, end }));
}

/**
 * Returns `serialized`, except that blocks rendering identically to a block of `original`
 * keep their original text, and runs of original blocks keep their original spacing.
 * Order and content follow `serialized`.
 */
export function preserveUnchangedBlocks(original: string, serialized: string): string {
  // A blank original has no blocks to keep, but still goes through the loop below so an
  // emptied heading gets the same `# ` fix-up; its trailing newline follows `serialized`
  const endsWithNewline = (original.trim() ? original : serialized).endsWith('\n');
  const originalLines = original.split('\n');
  const originalBlocks = splitBlocks(originalLines, original);
  const available = new Map<string, number[]>();
  originalBlocks.forEach((block, index) => {
    const queue = available.get(block.key) ?? [];
    queue.push(index);
    available.set(block.key, queue);
  });

  // Each serialized block, with the original block it keeps, if any
  const entries = splitBlocks(serialized.split('\n'), serialized).map((block) => {
    const index = available.get(block.key)?.shift();

    return { text: index !== undefined ? originalBlocks[index].text : block.text, index, footnote: FOOTNOTE_DEFINITION.test(block.text) };
  });

  const kept = new Set(entries.flatMap(({ index }) => (index === undefined ? [] : [index])));

  // Where each serialized block stands in the original: the block it keeps, or for an edited block
  // between two kept ones that are one original block apart, the edited one's place
  const places = entries.map(({ index }, i) => {
    if (index !== undefined) return index;

    const place = (i > 0 ? (entries[i - 1].index ?? -2) : -1) + 1;
    const next = entries[i + 1];
    const fits = next ? next.index === place + 1 : place === originalBlocks.length - 1;

    return place >= 0 && fits && !kept.has(place) ? place : undefined;
  });

  let output = '';
  entries.forEach(({ text, index, footnote }, i) => {
    const place = places[i];
    const previous = places[i - 1];

    if (i > 0) {
      // Consecutive untouched blocks reuse the exact gap between them, and so do two footnote
      // definitions in their original places, one of them edited: adjacent definitions stay
      // adjacent, and a definition always starts a new one
      const before = entries[i - 1];
      const bothKept = index !== undefined && before.index !== undefined;
      const sameGap = place !== undefined && previous !== undefined && place === previous + 1 && (bothKept || (footnote && before.footnote));

      output += sameGap
        ? '\n' + originalLines.slice(originalBlocks[previous].end, originalBlocks[place].start).map((l) => `${l}\n`).join('')
        : '\n\n';
    }

    // remark writes an emptied heading as a bare `#`, and splitBlocks trims an original `# `
    // to `#` too; write `# ` either way, as Markdown mode does
    output += text.replace(EMPTY_HEADING, '$& ');
  });

  return output + (endsWithNewline ? '\n' : '');
}
