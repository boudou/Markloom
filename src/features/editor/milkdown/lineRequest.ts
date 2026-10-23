// Rich text's side of a line request (uiStore.lineRequest): a source line lands on the
// top-level block that holds it, and inside that block on its list item, table row or code line.
import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { getMarkdownParser } from '@/lib/markdown';
import type { LineRequest } from '@/stores/uiStore';
import { sourceBlocks } from './preserve';
import { isMermaidBlock, lineRange } from './plugins';

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/** Nodes counted in document order, as markdown-it's list items and table rows */
const ITEM_NODES = new Set(['list_item', 'table_header_row', 'table_row']);

/** Index of the last block starting at or before the row, or 0 when none does */
function blockIndex(blocks: Array<{ start: number }>, row: number): number {
  let index = 0;

  for (let i = 0; i < blocks.length && blocks[i].start <= row; i++) index = i;

  return index;
}

/** Top-level children, without the empty paragraph Milkdown's trailing plugin appends */
function sourceChildCount(doc: ProseNode): number {
  const last = doc.lastChild;
  const trailing = last?.type.name === 'paragraph' && last.content.size === 0;

  return doc.childCount - (trailing ? 1 : 0);
}

/** How many list items and table rows of the block start at or before its line `rel` */
function itemsUpTo(blockText: string, rel: number): number {
  let count = 0;

  for (const token of getMarkdownParser().parse(blockText, {})) {
    if ((token.type === 'list_item_open' || token.type === 'tr_open') && token.map && token.map[0] <= rel) count++;
  }

  return count;
}

/** Position of the nth (1-based) list item or table row inside the node at `pos` */
function nthItem(node: ProseNode, pos: number, n: number): { pos: number; node: ProseNode } | undefined {
  let seen = 0;
  let found: { pos: number; node: ProseNode } | undefined;

  node.descendants((child, offset) => {
    if (found) return false;

    if (ITEM_NODES.has(child.type.name) && ++seen === n) {
      found = { pos: pos + 1 + offset, node: child };

      return false;
    }

    return true;
  });

  return found;
}

/** The first text position inside the node at `pos`, if it has one */
function firstTextIn(doc: ProseNode, pos: number, node: ProseNode): number | undefined {
  const caret = Selection.findFrom(doc.resolve(pos + 1), 1, true)?.from;

  return caret !== undefined && caret < pos + node.nodeSize ? caret : undefined;
}

/**
 * Where the caret goes for line `rel` of a block (0-based, within its source lines), or
 * undefined when it gets none: a diagram's hidden source, an atom, or raw HTML.
 */
function caretInBlock(doc: ProseNode, node: ProseNode, pos: number, blockLines: string[], rel: number): number | undefined {
  if (node.type.name === 'code_block') {
    if (isMermaidBlock(node)) return undefined;

    const fenced = FENCE_OPEN.test(blockLines[0] ?? '');
    const lineCount = node.textContent.split('\n').length;
    const codeLine = Math.min(Math.max(rel + (fenced ? 0 : 1), 1), lineCount);

    return pos + 1 + (lineRange(node.textContent, codeLine)?.textStart ?? 0);
  }

  // A lone inline atom (text is a leaf too) is how raw HTML or a lone image is kept
  if (node.isTextblock) {
    const only = node.childCount === 1 ? node.firstChild : null;

    return only && !only.isText && only.isAtom ? undefined : pos + 1;
  }

  if (node.isAtom) return undefined;

  const n = itemsUpTo(blockLines.join('\n'), rel);
  const item = n > 0 ? nthItem(node, pos, n) : undefined;

  return item ? firstTextIn(doc, item.pos, item.node) : firstTextIn(doc, pos, node);
}

/** Moves the rich-text caret to a request's source line; 'reveal' also scrolls there and focuses */
export function applyLineRequest(view: EditorView, markdown: string, request: LineRequest): void {
  const { doc } = view.state;
  const row = request.line - 1;
  const blocks = sourceBlocks(markdown);
  const children = sourceChildCount(doc);

  if (children !== blocks.length && import.meta.env.DEV) {
    console.warn('Line request: the source has', blocks.length, 'blocks, rich text', children);
  }

  const index = Math.min(blockIndex(blocks, row), doc.childCount - 1);
  let pos = 0;

  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;

  const node = doc.child(index);
  const block = blocks[index];
  const lines = markdown.split('\n');
  const caret = block ? caretInBlock(doc, node, pos, lines.slice(block.start, block.end), row - block.start) : pos + 1;

  if (caret !== undefined) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));

  if (request.kind === 'cursor') return;

  // Placed as CodeMirror's revealLine does: the block at the top of the pane
  const target = view.nodeDOM(caret !== undefined ? doc.resolve(caret).before() : pos);

  if (target instanceof HTMLElement) target.scrollIntoView({ block: 'start' });

  if (caret !== undefined) view.focus();
}
