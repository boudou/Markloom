// Markdown side of rich-text callouts: remark escapes every `[` in text, so an edited callout
// would save as `> \[!NOTE]`, which the preview reads as a plain quote. Here a callout marker at
// the start of a quote is written as it is, and every other `[` keeps its escape.
// A marker written escaped (`> \[!NOTE]`) is text, as in the preview: remark drops the backslash
// while reading, so such a quote is noted here, kept by the blockquote schema (callouts.ts) and
// written with its escape again.
import type { Blockquote, Node, Nodes, Paragraph, Root, Text } from 'mdast';
import type { Handle } from 'mdast-util-to-markdown';
import type { Processor, Transformer } from 'unified';
import { CALLOUT_MARKER } from '@/lib/callouts';

// Set on a quote being written whose marker is text (see callouts.ts)
declare module 'mdast' {
  interface BlockquoteData {
    literalCalloutMarker?: boolean;
  }
}

/** Text nodes that hold only a callout marker, set before each write */
const markers = new WeakSet<Text>();

/** Quotes just read whose marker was written escaped, so it is text */
const literalMarkerQuotes = new WeakSet<Node>();

/** True when the quote just read starts with a marker written escaped (`\[!NOTE]`), which is text */
export function hasLiteralMarker(quote: Node): boolean {
  return literalMarkerQuotes.has(quote);
}

/** The quote's first paragraph and text, and the marker at its start ("[!" + kind + "]"), if it starts with one */
function markerOf(quote: Blockquote): { paragraph: Paragraph; text: Text; marker: string } | undefined {
  const paragraph = quote.children[0];

  if (paragraph?.type !== 'paragraph') return undefined;

  const text = paragraph.children?.[0];
  const match = text?.type === 'text' ? text.value.match(CALLOUT_MARKER) : null;

  if (text?.type !== 'text' || !match) return undefined;

  return { paragraph, text, marker: text.value.slice(0, '[!'.length + match[1].length + ']'.length) };
}

/** Notes each quote whose marker reads differently in the source: an escape or an entity */
function findLiteralMarkers(node: Nodes, source: string) {
  if (!('children' in node)) return;

  for (const child of node.children ?? []) findLiteralMarkers(child, source);

  if (node.type !== 'blockquote') return;

  // The paragraph's start: Milkdown splits text at line breaks into new nodes with no position
  const found = markerOf(node);
  const start = found?.paragraph.position?.start.offset;

  if (found && start !== undefined && !source.startsWith(found.marker, start)) literalMarkerQuotes.add(node);
}

/** Splits the marker at the start of each quote's first paragraph into a text node of its own */
function markMarkers(node: Nodes) {
  if (!('children' in node)) return;

  // Milkdown writes an empty paragraph with no children array at all
  for (const child of node.children ?? []) markMarkers(child);

  if (node.type !== 'blockquote' || node.data?.literalCalloutMarker) return;

  const found = markerOf(node);

  if (!found) return;

  // The marker text alone; spaces and the line break after it go through the usual escaping
  const { paragraph, text, marker: value } = found;
  const marker: Text = { type: 'text', value };
  const rest = text.value.slice(value.length);

  markers.add(marker);
  paragraph.children.splice(0, 1, marker, ...(rest ? [{ ...text, value: rest }] : []));
}

/** Wraps the stringify `text` handler so a callout marker is written without a backslash */
export function keepCalloutMarkers(previous: Handle | undefined): Handle {
  const write: Handle = previous ?? ((node: Text, _parent, state, info) => state.safe(node.value, info));

  return (node: Text, parent, state, info) => (markers.has(node) ? node.value : write(node, parent, state, info));
}

/** Remark plugin: notes escaped markers when reading, marks the callout markers when writing */
export function remarkCalloutMarkers(this: Processor): Transformer<Root, Root> {
  const compile = this.compiler;

  if (compile) {
    this.compiler = (tree, file) => {
      // SAFETY: this processor parses Markdown, so the tree it compiles is an mdast root.
      markMarkers(tree as Root);

      return compile(tree, file);
    };
  }

  return (tree, file) => findLiteralMarkers(tree, String(file.value));
}
