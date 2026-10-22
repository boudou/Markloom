// Rich-text editing re-serializes the whole document, which reformats untouched parts
// (table padding, rule style, list markers, spacing) and floods git diffs. This keeps
// the user's original text for every top-level block whose meaning didn't change.
import MarkdownIt from 'markdown-it';
import { mathPlugin } from '@/lib/markdown';

// Plain renderer used only to compare meaning (no highlighting, no other app plugins). It reads
// math as the preview does, so `$$x$$` and its multi-line form, as rich text writes it, match.
const comparer = new MarkdownIt({ html: true, linkify: false, typographer: false }).use(mathPlugin);

interface Block {
  text: string;
  key: string;
  /** Line range in its source document [start, end) */
  start: number;
  end: number;
  /** A link reference definition: source text that markdown-it emits no token for */
  definition: boolean;
}

interface Reference {
  href: string;
  title: string;
}

/** markdown-it's env: link reference definitions collected while parsing, by normalized label */
interface ReferenceEnv {
  references?: Record<string, Reference>;
}

const EMPTY_HEADING = /^#{1,6}$/;

// Starts a definition inside an uncovered run of lines; `[^…]:` is a footnote definition
const DEFINITION_START = /^ {0,3}\[/;

const FOOTNOTE_DEFINITION = /^ {0,3}\[\^/;

const keyCache = new Map<string, string>();

/** Rendered meaning of a block; `references` resolves `[text][label]` links as in its document. */
function blockKey(text: string, references: Record<string, Reference>, referencesId: string): string {
  const cacheKey = `${referencesId}\0${text}`;
  let key = keyCache.get(cacheKey);

  if (key === undefined) {
    // A fresh env per render: a definition nested in a block must not leak into the next one
    const env: ReferenceEnv = { references: { ...references } };
    key = comparer.render(text, env).replace(/\s+/g, ' ').trim();

    if (keyCache.size > 2000) keyCache.clear();
    keyCache.set(cacheKey, key);
  }

  return key;
}

/**
 * Splits uncovered lines (link reference and footnote definitions) into one block per
 * definition, so each can be matched, dropped or carried on its own.
 */
function definitionBlocks(lines: string[], from: number, to: number): Block[] {
  const blocks: Block[] = [];
  let start = -1;

  const close = (end: number) => {
    if (start < 0) return;
    const text = lines.slice(start, end).join('\n').replace(/\s+$/, '');

    if (text) blocks.push({ text, key: `definition\0${text}`, start, end: start + text.split('\n').length, definition: true });
    start = -1;
  };

  for (let line = from; line < to; line++) {
    if (!lines[line].trim()) close(line);
    else if (start < 0 || DEFINITION_START.test(lines[line])) {
      close(line);
      start = line;
    }
  }

  close(to);

  return blocks;
}

/** Top-level blocks with their exact source text, including the definitions between them. */
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

    // markdown-it counts a list's trailing blank line as part of the list; measure the real text.
    // The key is set below, once the document's definitions are known.
    if (text) blocks.push({ text, key: '', start, end: start + text.split('\n').length, definition: false });
  }

  blocks.push(...definitionBlocks(lines, covered, lines.length));

  // Resolve links only against the top-level definitions, the ones a rebuild carries: a
  // definition nested in a list or quote is lost when Milkdown rewrites its container
  const definitionEnv: ReferenceEnv = {};
  const definitionText = blocks.flatMap((block) => (block.definition ? [block.text] : [])).join('\n\n');
  comparer.parse(definitionText, definitionEnv);

  // Footnotes aren't links: the comparer has no footnote plugin, so leave `[^1]` as text
  const references: Record<string, Reference> = {};

  for (const [label, reference] of Object.entries(definitionEnv.references ?? {})) {
    if (!label.startsWith('^')) references[label] = reference;
  }

  const referencesId = JSON.stringify(references);

  for (const block of blocks) {
    if (!block.definition) block.key = blockKey(block.text, references, referencesId);
  }

  return blocks;
}

/**
 * Returns `serialized`, except that blocks rendering identically to a block of `original`
 * keep their original text, and runs of original blocks keep their original spacing.
 * Order and content follow `serialized`, plus the original's link reference definitions,
 * which Milkdown drops (it inlines reference links): each stays after the block it followed.
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
  const matched = splitBlocks(serialized.split('\n'), serialized).map((block) => ({ block, index: available.get(block.key)?.shift() }));
  const used = new Set<number>();

  for (const { index } of matched) {
    if (index !== undefined) used.add(index);
  }

  // Link reference definitions Milkdown dropped go back right after the original block they
  // followed when that block is still written as it was (or first, when nothing preceded
  // them); otherwise before the next kept block that followed them, or at the end. A
  // footnote definition that is missing was deleted or edited in rich text: not carried.
  const carriedAfter = new Map<number, number[]>();
  const carriedBefore = new Map<number, number[]>();
  const carried = new Set<number>();

  const enqueue = (anchors: Map<number, number[]>, anchor: number, index: number) => {
    const queue = anchors.get(anchor) ?? [];
    queue.push(index);
    anchors.set(anchor, queue);
  };

  originalBlocks.forEach((block, index) => {
    if (!block.definition || used.has(index) || FOOTNOTE_DEFINITION.test(block.text)) return;
    const previous = index - 1;

    if (previous < 0 || used.has(previous) || carried.has(previous)) enqueue(carriedAfter, previous, index);
    else {
      const next = originalBlocks.findIndex((_, later) => later > index && used.has(later));
      enqueue(carriedBefore, next < 0 ? Infinity : next, index);
    }

    carried.add(index);
  });

  const entries: { text: string; index: number | undefined }[] = [];

  const carry = (indices: number[] | undefined) => {
    for (const index of indices ?? []) {
      entries.push({ text: originalBlocks[index].text, index });
      carry(carriedAfter.get(index));
    }
  };

  carry(carriedAfter.get(-1));

  for (const { block, index } of matched) {
    if (index !== undefined) carry(carriedBefore.get(index));
    entries.push({ text: index !== undefined ? originalBlocks[index].text : block.text, index });

    if (index !== undefined) carry(carriedAfter.get(index));
  }

  carry(carriedBefore.get(Infinity));

  let output = '';
  let previousOriginal = -2;
  entries.forEach(({ text, index }, i) => {
    if (i > 0) {
      // Consecutive untouched blocks: reuse the exact gap between them
      output +=
        index !== undefined && index === previousOriginal + 1
          ? '\n' + originalLines.slice(originalBlocks[previousOriginal].end, originalBlocks[index].start).map((l) => `${l}\n`).join('')
          : '\n\n';
    }

    // remark writes an emptied heading as a bare `#`, and splitBlocks trims an original `# `
    // to `#` too; write `# ` either way, as Markdown mode does
    output += text.replace(EMPTY_HEADING, '$& ');
    previousOriginal = index ?? -2;
  });

  return output + (endsWithNewline ? '\n' : '');
}
