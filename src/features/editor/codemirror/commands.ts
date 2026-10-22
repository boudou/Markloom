// Markdown formatting for the source editor. Every action is a single CodeMirror
// transaction, so one Ctrl+Z undoes exactly one formatting step.
import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type ChangeSpec,
  type EditorState,
  type Line,
} from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { defaultKeymap } from '@codemirror/commands';
import type { MarkdownAction } from '../types';
import { SHORTCUTS } from '@/lib/shortcuts';

const INLINE_MARKERS: Partial<Record<MarkdownAction, [string, string, string]>> = {
  bold: ['**', '**', 'bold text'],
  italic: ['_', '_', 'italic text'],
  strikethrough: ['~~', '~~', 'struck text'],
  code: ['`', '`', 'code'],
};

const LINE_PREFIXES: Partial<Record<MarkdownAction, string>> = {
  paragraph: '',
  h1: '# ',
  h2: '## ',
  h3: '### ',
  ul: '- ',
  ol: '1. ',
  checkbox: '- [ ] ',
  quote: '> ',
};

// Any existing block prefix we replace when changing a line's type
const BLOCK_PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

// Ends with a blank line and an empty one for the cursor: text typed directly under a table
// would become a table row
const TABLE = '| Column | Column | Column |\n| ------ | ------ | ------ |\n|        |        |        |\n\n';

const INLINE_PAIRS = Object.values(INLINE_MARKERS).map(([open, close]) => [open, close] as const);

/**
 * Finds the span whose `open`/`close` markers wrap `from..to`, looking outward through other
 * inline markers, so Bold finds the `**` in `**_text_**` with only `text` selected.
 */
function findWrapping(state: EditorState, from: number, to: number, open: string, close: string): { from: number; to: number } | null {
  const wraps = (start: number, end: number, before: string, after: string) =>
    state.sliceDoc(start - before.length, start) === before && state.sliceDoc(end, end + after.length) === after;

  for (;;) {
    if (wraps(from, to, open, close)) return { from, to };

    const outer = INLINE_PAIRS.find(([o, c]) => o !== open && wraps(from, to, o, c));

    if (!outer) return null;
    from -= outer[0].length;
    to += outer[1].length;
  }
}

function toggleInline(view: EditorView, action: MarkdownAction): void {
  const [open, close, placeholder] = INLINE_MARKERS[action]!;
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const wrapping = text ? findWrapping(state, range.from, range.to, open, close) : null;

      // Already wrapped, directly or around other inline markers: unwrap
      if (wrapping) {
        return {
          changes: [
            { from: wrapping.from - open.length, to: wrapping.from },
            { from: wrapping.to, to: wrapping.to + close.length },
          ],
          range: EditorSelection.range(range.from - open.length, range.to - open.length),
        };
      }

      const inner = text || placeholder;

      return {
        changes: { from: range.from, to: range.to, insert: open + inner + close },
        range: EditorSelection.range(range.from + open.length, range.from + open.length + inner.length),
      };
    }),
    { scrollIntoView: true, userEvent: 'input.format' }
  );
}

function toggleLinePrefix(view: EditorView, action: MarkdownAction): void {
  const prefix = LINE_PREFIXES[action] ?? '';
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  let lineIndex = 0;

  // Toggle off when every selected line already has this exact prefix
  const lines = state.selection.ranges.flatMap((range) => {
    const out = [];

    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);

      if (!seen.has(line.number)) {
        seen.add(line.number);
        out.push(line);
      }

      pos = line.to + 1;
    }

    return out;
  });

  const isOrdered = action === 'ol';

  const alreadyApplied = lines.every((line) => {
    const current = line.text.match(BLOCK_PREFIX)?.[2] ?? '';

    return isOrdered ? /^\d+[.)]\s+$/.test(current) : current === prefix;
  });

  for (const line of lines) {
    const match = line.text.match(BLOCK_PREFIX)!;
    const indent = match[1] ?? '';
    const existing = match[2] ?? '';
    const start = line.from + indent.length;
    const next = alreadyApplied ? '' : isOrdered ? `${++lineIndex}. ` : prefix;
    changes.push({ from: start, to: start + existing.length, insert: next });
  }

  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' });
}

/**
 * The top-level block (paragraph, whole list, fence, quote) that overlaps a line. The source
 * parser is CommonMark, so a table is one Paragraph, which is the extent wanted here.
 */
function topLevelBlockAt(state: EditorState, line: Line): { from: number; to: number } | null {
  const tree = ensureSyntaxTree(state, line.to, 100) ?? syntaxTree(state);

  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.from <= line.to && node.to >= line.from) return node;
  }

  return null;
}

/**
 * Inserts a block after the top-level block that holds the cursor (never inside a table, list or
 * fence), with exactly one blank line on each side. `selectFrom` is relative to the snippet's
 * start.
 */
function insertBlock(view: EditorView, snippet: string, selectFrom = 0, selectLength = 0): void {
  const { state } = view;
  const { doc } = state;
  const isBlank = (lineNumber: number) => doc.line(lineNumber).text.trim() === '';
  const line = doc.lineAt(state.selection.main.head);
  const block = topLevelBlockAt(state, line);
  let gapFrom: number;
  let hasBefore: boolean;
  let next: number;

  if (block || !isBlank(line.number)) {
    // A line the parser hasn't reached yet counts as its own block
    const before = doc.lineAt(block ? block.to : line.to);

    gapFrom = before.to;
    hasBefore = true;
    next = before.number + 1;
  } else {
    // A blank line between blocks: the snippet replaces the blank lines around it
    let above = line.number - 1;

    while (above >= 1 && isBlank(above)) above--;

    hasBefore = above >= 1;
    gapFrom = hasBefore ? doc.line(above).to : 0;
    next = line.number;
  }

  while (next <= doc.lines && isBlank(next)) next++;

  const hasAfter = next <= doc.lines;
  const gapTo = hasAfter ? doc.line(next).from : doc.length;
  const lead = hasBefore ? '\n\n' : '';
  const tail = hasAfter ? '\n\n' : '\n';
  const anchor = gapFrom + lead.length + selectFrom;

  view.dispatch({
    changes: { from: gapFrom, to: gapTo, insert: lead + snippet + tail },
    selection: EditorSelection.range(anchor, anchor + selectLength),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
}

/** Where a just-inserted link's placeholders are, while the cursor is still in its text */
interface LinkStep {
  textFrom: number;
  urlFrom: number;
  urlTo: number;
}

const setLinkStep = StateEffect.define<LinkStep | null>();

const linkStep = StateField.define<LinkStep | null>({
  create: () => null,

  update(step, tr) {
    for (const effect of tr.effects) if (effect.is(setLinkStep)) return effect.value;

    if (!step) return null;

    const mapped = {
      textFrom: tr.changes.mapPos(step.textFrom, -1),
      urlFrom: tr.changes.mapPos(step.urlFrom, -1),
      urlTo: tr.changes.mapPos(step.urlTo, 1),
    };

    const head = tr.newSelection.main.head;

    // The link was deleted or undone, or the cursor left the link text (`urlFrom - 2` is the `]`)
    if (mapped.urlTo <= mapped.urlFrom || head < mapped.textFrom || head > mapped.urlFrom - 2) return null;

    return mapped;
  },
});

/** Tab after typing a new link's text selects its address placeholder; otherwise Tab indents */
function jumpToLinkUrl(view: EditorView): boolean {
  const step = view.state.field(linkStep, false);

  if (!step) return false;

  view.dispatch({
    selection: EditorSelection.range(step.urlFrom, step.urlTo),
    effects: setLinkStep.of(null),
    scrollIntoView: true,
  });

  return true;
}

/** The Tab step from a new link's text to its address; part of the source editor's extensions */
export const linkUrlStep = [linkStep, Prec.high(keymap.of([{ key: 'Tab', run: jumpToLinkUrl }]))];

function insertLink(view: EditorView, image: boolean): void {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const text = selected || (image ? 'description' : 'link text');
  const url = image ? 'images/picture.png' : 'https://';
  const insert = `${image ? '!' : ''}[${text}](${url})`;
  const urlFrom = range.from + insert.length - url.length - 1;
  const urlTo = urlFrom + url.length;

  // Selected text becomes the link text, so the address is all that's left to fill in
  if (selected) {
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.range(urlFrom, urlTo),
      scrollIntoView: true,
      userEvent: 'input.format',
    });

    return;
  }

  // Otherwise the text placeholder comes first and Tab moves on to the address
  const textFrom = range.from + (image ? 2 : 1);

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(textFrom, textFrom + text.length),
    effects: setLinkStep.of({ textFrom, urlFrom, urlTo }),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
}

/** Applies a toolbar/shortcut action to the source editor and returns focus to it. */
export function runMarkdownAction(view: EditorView, action: MarkdownAction): void {
  if (INLINE_MARKERS[action]) toggleInline(view, action);
  else if (action in LINE_PREFIXES) toggleLinePrefix(view, action);
  else if (action === 'link') insertLink(view, false);
  else if (action === 'image') insertLink(view, true);
  // Cursor lands on the empty line inside the fence
  else if (action === 'codeblock') insertBlock(view, '```\n\n```', 4, 0);
  // Cursor lands on an empty line below the table, where typing starts a paragraph
  else if (action === 'table') insertBlock(view, TABLE, TABLE.length);
  else if (action === 'hr') insertBlock(view, '---');
  view.focus();
}

/** Inserts a fenced block (e.g. a Mermaid template) on its own lines at the cursor. */
export function insertSnippet(view: EditorView, text: string): void {
  insertBlock(view, text.trim());
  view.focus();
}

/** The cursor position for a 1-based line: clamped to the document, after the indentation. */
function lineAnchor(view: EditorView, line: number): number {
  const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));

  // Land after the indentation, where typing actually fixes the line
  return target.from + (target.text.match(/^\s*/)?.[0].length ?? 0);
}

/** Puts the cursor on a 1-based document line, scrolled to the top of the pane. */
export function revealLine(view: EditorView, line: number): void {
  const anchor = lineAnchor(view, line);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(view.state.doc.lineAt(anchor).from, { y: 'start', yMargin: 24 }),
  });
  view.focus();
}

/**
 * Puts the cursor on a 1-based document line without scrolling or focusing the editor,
 * for when another pane is already scrolling there and scroll sync brings this one along.
 */
export function placeCursor(view: EditorView, line: number): void {
  view.dispatch({ selection: { anchor: lineAnchor(view, line) } });
}

/** Ticks or unticks the task item on the cursor's line ("- [ ]" <-> "- [x]") */
function toggleTaskAtCursor(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const match = line.text.match(/^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])\]/);

  if (!match) return false;
  const at = line.from + match[1].length;
  view.dispatch({
    changes: { from: at, to: at + 1, insert: match[2] === ' ' ? 'x' : ' ' },
    userEvent: 'input.format',
  });

  return true;
}

const run = (action: MarkdownAction) => (view: EditorView) => {
  runMarkdownAction(view, action);

  return true;
};

// CodeMirror's default keymap minus its toggle-comment binding on Mod-/: the app uses that
// key for Keyboard shortcuts, and `<!-- -->` around a line can break a Mermaid fence.
// Replaces basicSetup's copy (`defaultKeymap: false`).
export const editingKeymap = keymap.of(
  defaultKeymap.filter((binding) => binding.key !== SHORTCUTS.showShortcuts.combo)
);

export const markdownKeymap = Prec.high(
  keymap.of([
    { key: SHORTCUTS.bold.combo, run: run('bold') },
    { key: SHORTCUTS.italic.combo, run: run('italic') },
    { key: SHORTCUTS.strikethrough.combo, run: run('strikethrough') },
    { key: SHORTCUTS.inlineCode.combo, run: run('code') },
    { key: SHORTCUTS.link.combo, run: run('link') },
    { key: SHORTCUTS.heading1.combo, run: run('h1') },
    { key: SHORTCUTS.heading2.combo, run: run('h2') },
    { key: SHORTCUTS.heading3.combo, run: run('h3') },
    { key: SHORTCUTS.bulletList.combo, run: run('ul') },
    { key: SHORTCUTS.orderedList.combo, run: run('ol') },
    { key: SHORTCUTS.blockquote.combo, run: run('quote') },
    { key: SHORTCUTS.taskList.combo, run: run('checkbox') },
    { key: SHORTCUTS.codeBlock.combo, run: run('codeblock') },
    { key: SHORTCUTS.toggleTask.combo, run: toggleTaskAtCursor },
  ])
);
