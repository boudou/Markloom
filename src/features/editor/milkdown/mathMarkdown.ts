// Markdown side of rich-text math. remark-math parses $…$ and $$…$$; this corrects it where it
// disagrees with the preview's rules (mathPlugin in lib/markdown.ts), so both editors show the
// same formulas and an edit doesn't add backslashes:
//  - Reading: where remark's inline math differs from the preview's (prices: `costs $5 and $10`),
//    the paragraph is read again with only the preview's formulas as math; a `$$x$$` line in a
//    paragraph becomes display math; a `$$` block that the preview doesn't close (no line ending
//    in `$$` before a blank line) goes back to text.
//  - Writing: remark-math escapes every `$` in text; here only a `$` that would start math is.
import remarkMath from 'remark-math';
import type { InlineMath, Math as DisplayMath } from 'mdast-util-math';
import type { Heading, Nodes, Paragraph, Root, RootContent, TableCell, Text } from 'mdast';
import type { Handle } from 'mdast-util-to-markdown';
import type { Processor, Transformer } from 'unified';
import { inlineMathClose } from '@/lib/markdown';

// Milkdown's soft line break: a break node marked inline, written back as a plain newline
declare module 'mdast' {
  interface BreakData {
    isInline?: boolean;
  }
}

/** Any mdast node with children, seen as able to hold whatever replaces its children */
interface Container {
  children: RootContent[];
}

/** Re-reads Markdown with the editor's whole remark pipeline (this file's fixes included) */
type Reparse = (markdown: string) => RootContent[];

/** Phrasing content as the preview's inline rules read it, with its formulas */
interface InlineSource {
  /** The source with every `$` that is not a formula's escaped and each formula as MATH_SLOT */
  markdown: string;
  formulas: string[];
}

// A closing fence line at the end of a display block's source, after any quote or list prefix
const CLOSING_FENCE = /\n[ \t>]*\${2,}[ \t]*$/;

// Stands for one formula while a paragraph is read again (U+FFFC, object replacement character)
const MATH_SLOT = '￼';

// Put before a re-read paragraph whose first line would otherwise start a block (`1. Intro` in a heading)
const PARAGRAPH_START = '';

// An autolink, which the preview reads before any `$` in it
const AUTOLINK = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/y;

function sourceRange(node: Nodes): [number, number] | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;

  return start === undefined || end === undefined ? null : [start, end];
}

/** The start of every continuation line in a container `quoteDepth` quotes deep: indentation and `>` */
function continuationPrefix(quoteDepth: number): RegExp {
  return new RegExp(`\\n[ \\t]*(?:>[ \\t]*){0,${quoteDepth}}`, 'g');
}

/**
 * The phrasing source of a paragraph, heading or table cell, without the quote markers and
 * indentation of its continuation lines (what the preview's inline rules see), or null when
 * positions are missing (Milkdown's line breaks have none, so a heading's edge can lack one).
 */
function phrasingSource(node: Paragraph | Heading | TableCell, source: string, quoteDepth: number): string | null {
  const first = node.type === 'paragraph' ? node : node.children[0];
  const last = node.type === 'paragraph' ? node : node.children[node.children.length - 1];
  const start = first && sourceRange(first)?.[0];
  const end = last && sourceRange(last)?.[1];

  return start === undefined || end === undefined ? null : source.slice(start, end).replace(continuationPrefix(quoteDepth), '\n');
}

/** Where the backtick run at `at` ends its code span, or the end of the run when nothing closes it */
function codeSpanEnd(text: string, at: number): number {
  let open = at;

  while (text[open + 1] === '`') open++;

  for (let from = open + 1; ; ) {
    const start = text.indexOf('`', from);

    if (start === -1) return open;

    let end = start;

    while (text[end + 1] === '`') end++;

    if (end - start === open - at) return end;

    from = end + 1;
  }
}

/** Reads phrasing source left to right like the preview: escapes, code spans and autolinks first */
function readInline(text: string): InlineSource {
  const formulas: string[] = [];
  let markdown = '';
  let from = 0;

  for (let at = 0; at < text.length; at++) {
    const char = text[at];

    if (char === '\\') {
      at++;
      continue;
    }

    if (char === '`') {
      at = codeSpanEnd(text, at);
      continue;
    }

    if (char === '<') {
      AUTOLINK.lastIndex = at;

      if (AUTOLINK.test(text)) at = AUTOLINK.lastIndex - 1;
      continue;
    }

    if (char !== '$') continue;

    const close = inlineMathClose(text, at, text.length);

    if (close === -1) {
      // Not math in the preview, so not in remark either
      markdown += `${text.slice(from, at)}\\$`;
    } else {
      markdown += text.slice(from, at) + MATH_SLOT;
      formulas.push(text.slice(at + 1, close));
      at = close;
    }

    from = at + 1;
  }

  return { markdown: markdown + text.slice(from), formulas };
}

function inlineMathValues(node: Nodes, values: string[]): string[] {
  if (node.type === 'inlineMath') values.push(node.value);
  else if ('children' in node) for (const child of node.children) inlineMathValues(child, values);

  return values;
}

const sameFormulas = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value.replace(/\s+/g, ' ') === b[index].replace(/\s+/g, ' '));

/** Puts the formulas back in place of their slots; false when one landed outside text (a link's URL) */
function fillSlots(parent: Container, formulas: string[]): boolean {
  let used = 0;

  const fill = (container: Container) => {
    container.children = container.children.flatMap((child): RootContent[] => {
      delete child.position;

      if ('children' in child) {
        fill(child);

        return [child];
      }

      if (child.type !== 'text' || !child.value.includes(MATH_SLOT)) return [child];

      return child.value.split(MATH_SLOT).flatMap((value, index): RootContent[] => {
        const parts: RootContent[] = index > 0 ? [{ type: 'inlineMath', value: formulas[used++] ?? '' }] : [];

        if (value) parts.push({ type: 'text', value });

        return parts;
      });
    });
  };

  fill(parent);

  return used === formulas.length;
}

/** Inline Markdown read as one paragraph, or null when it won't read as one */
function readParagraph(markdown: string, reparse: Reparse): Paragraph | null {
  const [paragraph, ...rest] = reparse(markdown);

  if (paragraph?.type === 'paragraph' && rest.length === 0) return paragraph;

  if (markdown.startsWith(PARAGRAPH_START)) return null;

  const started = readParagraph(PARAGRAPH_START + markdown, reparse);
  const first = started?.children[0];

  if (first?.type === 'text') first.value = first.value.slice(PARAGRAPH_START.length);

  if (started && first?.type === 'text' && !first.value) started.children.shift();

  return started;
}

/**
 * Where remark's inline math differs from the preview's, reads the content again with every `$`
 * the preview doesn't make math escaped, so emphasis, links and code between false dollars stay
 * what they are, then puts the preview's formulas back. Converges: the re-read holds no `$` that
 * could open math.
 */
function fixInlineMath(node: Paragraph | Heading | TableCell, source: string, quoteDepth: number, reparse: Reparse) {
  const text = phrasingSource(node, source, quoteDepth);

  if (text === null || !text.includes('$')) return;

  const inline = readInline(text);

  if (sameFormulas(inline.formulas, inlineMathValues(node, []))) return;

  const paragraph = readParagraph(inline.markdown, reparse);

  if (paragraph && fillSlots(paragraph, inline.formulas)) node.children = paragraph.children;
}

/** The TeX of a line the preview reads as one-line display math, `$$x$$`, or null */
function oneLineDisplayMath(line: string): string | null {
  const text = line.trim();
  const opening = text.slice(2);

  if (!text.startsWith('$$') || opening.length <= 2 || !opening.endsWith('$$')) return null;

  return opening.slice(0, -2).trim() || null;
}

/**
 * A paragraph with `$$x$$` lines, split as the preview reads it: such a line is display math even
 * with no blank line around it (the preview's block rule interrupts a paragraph), while remark
 * reads it as inline math in the paragraph's text. Null when the paragraph has no such line.
 */
function splitDisplayLines(node: Paragraph, source: string, quoteDepth: number, reparse: Reparse): RootContent[] | null {
  const range = sourceRange(node);
  const column = node.position?.start.column;

  if (!range || column === undefined || !source.slice(range[0], range[1]).includes('$$')) return null;

  const prefix = new RegExp(`^[ \\t]*(?:>[ \\t]*){0,${quoteDepth}}`);

  const lines = source.slice(range[0], range[1]).split('\n').map((line, index) => {
    const indent = index === 0 ? '' : (prefix.exec(line)?.[0] ?? '');
    const content = line.slice(indent.length);
    // Indented four columns past the paragraph's text, the line is not a block start
    const tex = indent.length + 1 - column >= 4 ? null : oneLineDisplayMath(content);

    return { content, tex };
  });

  // Decide before reading anything again: the pieces re-read below then hold no display line, so
  // they come back here with nothing to split and the recursion ends
  if (!lines.some(({ tex }) => tex !== null)) return null;

  const nodes: RootContent[] = [];
  let text: string[] = [];

  const flush = () => {
    if (text.length > 0) nodes.push(...reparse(text.join('\n')));
    text = [];
  };

  for (const { content, tex } of lines) {
    if (tex === null) {
      text.push(content);
      continue;
    }

    flush();
    nodes.push({ type: 'math', value: tex, meta: null });
  }

  flush();

  return nodes;
}

/**
 * A `$$` block as the preview reads it. remark runs an unclosed block to the end of its container
 * and allows blank lines inside; the preview needs a line ending in `$$` before any blank line,
 * and treats anything else as text. Text after an early `$$` (`b$$` in mid-block) is read again.
 */
function displayMath(node: DisplayMath, source: string, reparse: Reparse): RootContent[] {
  const range = sourceRange(node);
  const closed = !range || CLOSING_FENCE.test(source.slice(range[0], range[1]));
  // The rest of the opening line, which remark keeps as `meta`
  const opening = node.meta?.trim() ?? '';
  const lines = node.value === '' ? [] : node.value.split('\n');

  if (closed) lines.push('$$');

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (!trimmed) break;

    if (!trimmed.endsWith('$$')) continue;

    if (closed && index === lines.length - 1) {
      // The usual case: closed by its own fence line
      if (!opening && !node.value.trim()) break;

      if (opening) node.value = node.value ? `${opening}\n${node.value}` : opening;
      node.meta = null;

      return [node];
    }

    const value = [opening, ...lines.slice(0, index), trimmed.slice(0, -2)].join('\n').trim();

    if (!value) break;

    return [{ type: 'math', value, meta: null }, ...reparse(lines.slice(index + 1).join('\n'))];
  }

  // Not math: the same lines as text, with the opening `$$` escaped so it can't open a block again
  return reparse(`\\$\\$${opening}\n${lines.join('\n')}`);
}

function continuesOnNextLine(before: Nodes, after: Nodes): boolean {
  const end = before.position?.end.line;

  return end !== undefined && end + 1 === after.position?.start.line;
}

function fixMath(parent: Container, source: string, reparse: Reparse, quoteDepth: number) {
  const children: RootContent[] = [];

  for (const child of parent.children) {
    if (child.type === 'math') {
      const nodes = displayMath(child, source, reparse);
      const previous = children[children.length - 1];
      const first = nodes[0];

      // remark lets `$$` interrupt a paragraph even when the block never closes; the preview
      // reads that line as more of the paragraph (Milkdown's soft break: an inline break)
      if (previous?.type === 'paragraph' && first?.type === 'paragraph' && continuesOnNextLine(previous, child)) {
        previous.children.push({ type: 'break', data: { isInline: true } }, ...first.children);
        children.push(...nodes.slice(1));
      } else children.push(...nodes);

      continue;
    }

    const split = child.type === 'paragraph' ? splitDisplayLines(child, source, quoteDepth, reparse) : null;

    if (split) {
      children.push(...split);
      continue;
    }

    if (child.type === 'paragraph' || child.type === 'heading' || child.type === 'tableCell') fixInlineMath(child, source, quoteDepth, reparse);
    else if ('children' in child) fixMath(child, source, reparse, child.type === 'blockquote' ? quoteDepth + 1 : quoteDepth);

    children.push(child);
  }

  parent.children = children;
}


// ---------------------------------------------------------------------------
// Writing: which `$` in text would start math, so only those are escaped

/** Text nodes to the offsets of the `$`s in them that need a backslash, set before each write */
const openers = new WeakMap<Text, number[]>();

/** A phrasing container's content roughly as it is written, with the place of each `$` of its text */
interface Flattened {
  text: string;
  dollars: Map<number, { node: Text; offset: number }>;
}

const ATTENTION_MARKERS: Partial<Record<Nodes['type'], string>> = { emphasis: '_', strong: '**', delete: '~~' };

function flatten(node: Nodes, flat: Flattened) {
  if (node.type === 'text') {
    for (let at = node.value.indexOf('$'); at !== -1; at = node.value.indexOf('$', at + 1)) {
      flat.dollars.set(flat.text.length + at, { node, offset: at });
    }

    flat.text += node.value;

    return;
  }

  if (node.type === 'inlineMath') flat.text += `$${node.value}$`;
  else if (node.type === 'inlineCode') flat.text += `\`${node.value}\``;
  else if (node.type === 'break') flat.text += '\n';
  else if (node.type === 'image') flat.text += `![${node.alt ?? ''}](${node.url})`;
  else if (node.type === 'imageReference') flat.text += `![${node.alt ?? ''}][${node.label ?? node.identifier}]`;
  else if (node.type === 'link') flattenChildren(node.children, flat, '[', `](${node.url})`);
  else if (node.type === 'linkReference') flattenChildren(node.children, flat, '[', `][${node.label ?? node.identifier}]`);
  else if ('children' in node) {
    const marker = ATTENTION_MARKERS[node.type] ?? '';
    flattenChildren(node.children, flat, marker, marker);
  } else if ('value' in node) flat.text += node.value;
}

// Milkdown writes an empty paragraph or heading with no children array at all
function flattenChildren(children: Nodes[] | undefined, flat: Flattened, open: string, close: string) {
  flat.text += open;

  for (const child of children ?? []) flatten(child, flat);

  flat.text += close;
}

function markOpeners(node: Nodes) {
  if (node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'tableCell') {
    if ('children' in node) for (const child of node.children ?? []) markOpeners(child);

    return;
  }

  const flat: Flattened = { text: '', dollars: new Map() };
  flattenChildren(node.children, flat, '', '');

  if (!flat.dollars.size) return;

  // Escaping one `$` can let an earlier one close further on, so repeat until nothing changes
  const escaped = new Set<number>();
  let text = flat.text;

  for (let changed = true; changed; ) {
    changed = false;

    for (const at of flat.dollars.keys()) {
      if (escaped.has(at) || inlineMathClose(text, at, text.length) === -1) continue;

      escaped.add(at);
      // An escaped `$` neither opens nor closes math: scan on as if it were a letter
      text = `${text.slice(0, at)}x${text.slice(at + 1)}`;
      changed = true;
    }
  }

  for (const [at, { node: textNode, offset }] of flat.dollars) {
    if (!escaped.has(at)) continue;

    const offsets = openers.get(textNode) ?? [];
    offsets.push(offset);
    openers.set(textNode, offsets);
  }
}

/**
 * Wraps the stringify `text` handler so that a `$` that would start math gets a backslash, and no
 * other `$` does. Set in remarkStringifyOptions: handlers there override the extensions' ones.
 */
export function escapeMathOpeners(previous: Handle | undefined): Handle {
  const write: Handle = previous ?? ((node: Text, _parent, state, info) => state.safe(node.value, info));

  return (node: Text, parent, state, info) => {
    const offsets = openers.get(node);

    if (!offsets) return write(node, parent, state, info);

    let output = '';
    let from = 0;

    for (const offset of offsets) {
      const piece: Text = { type: 'text', value: node.value.slice(from, offset) };
      output += `${write(piece, parent, state, { ...info, before: from === 0 ? info.before : '$', after: '$' })}\\$`;
      from = offset + 1;
    }

    const rest: Text = { type: 'text', value: node.value.slice(from) };

    return output + write(rest, parent, state, { ...info, before: '$', after: info.after });
  };
}

/**
 * Inline math always between single dollars, on one line. remark-math switches to `$$` when the
 * TeX holds a `$` (as in `a\$b`), which the preview doesn't read as inline math.
 */
const writeInlineMath: Handle = (node: InlineMath) => `$${node.value.replace(/\s*\n\s*/g, ' ')}$`;

/** remark-math, corrected to the preview's rules (see the top of this file) */
export function remarkMarkloomMath(this: Processor): Transformer<Root, Root> {
  remarkMath.call(this);

  // remark-math escapes every `$` in text; escapeMathOpeners escapes only the ones that need it
  const extensions = this.data('toMarkdownExtensions') ?? [];
  const extension = extensions[extensions.length - 1];

  if (extension) {
    extension.unsafe = extension.unsafe?.filter((pattern) => !(pattern.character === '$' && pattern.inConstruct === 'phrasing'));
    extension.handlers = { ...extension.handlers, inlineMath: writeInlineMath };
  }

  const compile = this.compiler;

  if (compile) {
    this.compiler = (tree, file) => {
      // SAFETY: this processor parses Markdown, so the tree it compiles is an mdast root.
      markOpeners(tree as Root);

      return compile(tree, file);
    };
  }

  const reparse: Reparse = (markdown) => {
    // SAFETY: running this processor's transformers on its own parse yields an mdast root.
    const tree = this.runSync(this.parse(markdown), markdown) as Root;

    // Their positions are in `markdown`, not in the document: drop them so no line is compared
    for (const node of tree.children) delete node.position;

    return tree.children;
  };

  return (tree, file) => fixMath(tree, String(file.value), reparse, 0);
}
