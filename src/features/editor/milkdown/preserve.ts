// Rich-text editing re-serializes the whole document, which reformats untouched parts
// (table padding, rule style, list markers, spacing) and floods git diffs. This keeps
// the user's original text for every top-level block whose meaning didn't change.
import MarkdownIt from 'markdown-it';

// Plain renderer used only to compare meaning (no highlighting, no app plugins)
const comparer = new MarkdownIt({ html: true, linkify: false, typographer: false });

interface Block {
  text: string;
  key: string;
  /** Line range in its source document [start, end) */
  start: number;
  end: number;
}

const EMPTY_HEADING = /^#{1,6}$/;

const keyCache = new Map<string, string>();

function blockKey(text: string): string {
  let key = keyCache.get(text);

  if (key === undefined) {
    key = comparer.render(text).replace(/\s+/g, ' ').trim();

    if (keyCache.size > 2000) keyCache.clear();
    keyCache.set(text, key);
  }

  return key;
}

/** Top-level blocks with their exact source text. */
function splitBlocks(lines: string[], markdown: string): Block[] {
  const blocks: Block[] = [];

  for (const token of comparer.parse(markdown, {})) {
    if (token.level !== 0 || !token.map || token.nesting === -1) continue;
    const start = token.map[0];
    const text = lines.slice(start, token.map[1]).join('\n').replace(/\s+$/, '');

    // markdown-it counts a list's trailing blank line as part of the list; measure the real text
    if (text) blocks.push({ text, key: blockKey(text), start, end: start + text.split('\n').length });
  }

  return blocks;
}

/**
 * Returns `serialized`, except that blocks rendering identically to a block of `original`
 * keep their original text, and runs of original blocks keep their original spacing.
 * Order and content always follow `serialized`.
 */
export function preserveUnchangedBlocks(original: string, serialized: string): string {
  if (!original.trim()) return serialized;

  const originalLines = original.split('\n');
  const originalBlocks = splitBlocks(originalLines, original);
  const available = new Map<string, number[]>();
  originalBlocks.forEach((block, index) => {
    const queue = available.get(block.key) ?? [];
    queue.push(index);
    available.set(block.key, queue);
  });

  let output = '';
  let previousOriginal = -2;
  splitBlocks(serialized.split('\n'), serialized).forEach((block, i) => {
    const index = available.get(block.key)?.shift();

    if (i > 0) {
      // Consecutive untouched blocks: reuse the exact gap between them
      output +=
        index !== undefined && index === previousOriginal + 1
          ? '\n' + originalLines.slice(originalBlocks[previousOriginal].end, originalBlocks[index].start).map((l) => `${l}\n`).join('')
          : '\n\n';
    }

    // remark writes an emptied heading as a bare `#`, and splitBlocks trims an original `# `
    // to `#` too; write `# ` either way, as Markdown mode does
    const text = index !== undefined ? originalBlocks[index].text : block.text;
    output += text.replace(EMPTY_HEADING, '$& ');
    previousOriginal = index ?? -2;
  });

  return output + (original.endsWith('\n') ? '\n' : '');
}
