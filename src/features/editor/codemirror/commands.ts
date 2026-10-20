// Markdown formatting for the source editor. Every action is a single CodeMirror
// transaction, so one Ctrl+Z undoes exactly one formatting step.
import { EditorSelection, Prec, type ChangeSpec } from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';
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

const BLOCK_SNIPPETS: Partial<Record<MarkdownAction, string>> = {
  hr: '---',
  table: '| Column | Column | Column |\n| ------ | ------ | ------ |\n|        |        |        |',
};

function toggleInline(view: EditorView, action: MarkdownAction): void {
  const [open, close, placeholder] = INLINE_MARKERS[action]!;
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const before = state.sliceDoc(range.from - open.length, range.from);
      const after = state.sliceDoc(range.to, range.to + close.length);

      // Already wrapped: unwrap
      if (text && before === open && after === close) {
        return {
          changes: [
            { from: range.from - open.length, to: range.from },
            { from: range.to, to: range.to + close.length },
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

function insertBlock(view: EditorView, snippet: string, selectFrom = 0, selectLength = 0): void {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const lineIsEmpty = line.text.trim().length === 0;

  // On an empty line the block takes its place; otherwise it goes below, after a blank line
  const from = lineIsEmpty ? line.from : line.to;
  const to = line.to;
  const lead = lineIsEmpty ? '' : '\n\n';
  const insert = `${lead}${snippet}\n`;
  const anchor = from + lead.length + selectFrom;

  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(anchor, anchor + selectLength),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
}

function insertLink(view: EditorView, image: boolean): void {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to) || (image ? 'description' : 'link text');
  const url = image ? 'images/picture.png' : 'https://';
  const insert = `${image ? '!' : ''}[${text}](${url})`;
  const urlStart = range.from + insert.length - url.length - 1;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(urlStart, urlStart + url.length),
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
  else if (BLOCK_SNIPPETS[action]) insertBlock(view, BLOCK_SNIPPETS[action]!, action === 'table' ? 2 : 0, action === 'table' ? 6 : 0);
  view.focus();
}

/** Inserts a fenced block (e.g. a Mermaid template) on its own lines at the cursor. */
export function insertSnippet(view: EditorView, text: string): void {
  insertBlock(view, text.trim());
  view.focus();
}

/** Puts the cursor on a 1-based document line, scrolled to the top of the pane. */
export function revealLine(view: EditorView, line: number): void {
  const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
  // Land after the indentation, where typing actually fixes the line
  const anchor = target.from + (target.text.match(/^\s*/)?.[0].length ?? 0);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 24 }),
  });
  view.focus();
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
