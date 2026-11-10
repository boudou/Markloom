// Typing aids in Markdown mode (#12). Bracket closing itself is basicSetup's closeBrackets, switched
// by the "Close brackets as you type" setting; this file narrows it to ()[]{} and adds curly quotes.
import { syntaxTree } from '@codemirror/language';
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { withoutFrontMatter } from '@/lib/markdown';
import { selectCurlyQuotes, useSettingsStore } from '@/stores/settingsStore';
import { PAIR_BEFORE, PAIRS, curlyQuote, straightQuote } from '../utils/smartTyping';

// closeBrackets reads this at the cursor; Markdown defines none of its own, so it replaces the
// defaults (which also pair quotes, ignoring the character before: `5"` would become `5""`)
const PAIR_DATA = [{ closeBrackets: { brackets: Object.keys(PAIRS), before: PAIR_BEFORE } }];

export const markdownPairs = EditorState.languageData.of(() => PAIR_DATA);

// Syntax nodes whose text is never prose (all from @lezer/markdown)
const LITERAL_NODES = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'CodeInfo',
  'URL',
  'Autolink',
  'HTMLTag',
  'HTMLBlock',
  'Comment',
  'CommentBlock',
  'ProcessingInstruction',
  'ProcessingInstructionBlock',
  'LinkTitle',
  'LinkLabel',
]);

const FRONT_MATTER_FENCE = /^---[ \t]*$/;

function inFrontMatter(state: EditorState, pos: number): boolean {
  if (!FRONT_MATTER_FENCE.test(state.doc.line(1).text)) return false;

  const doc = state.doc.toString();

  return pos < doc.length - withoutFrontMatter(doc).length;
}

function inLiteral(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1);

  if (LITERAL_NODES.has(node.name)) return true;

  while (node.parent) {
    node = node.parent;

    if (LITERAL_NODES.has(node.name)) return true;
  }

  return inFrontMatter(state, pos);
}

// Where the curly quote just typed sits, so Backspace can put back the straight one
const curlyTyped = StateEffect.define<number>();

const curlyAt = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(curlyTyped)) return effect.value;

    if (tr.docChanged || tr.selection) return null;

    return value;
  },
});

const typeCurlyQuote = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '"' && text !== "'") return false;

  const { state } = view;
  const { main } = state.selection;

  if (!selectCurlyQuotes(useSettingsStore.getState()) || view.composing || state.readOnly) return false;

  if (state.selection.ranges.length > 1 || from !== main.from || to !== main.to) return false;

  if (inLiteral(state, from)) return false;

  const line = state.doc.lineAt(from);
  const curly = curlyQuote(line.text.slice(0, from - line.from), text);

  if (curly === null) return false;

  view.dispatch({
    changes: { from, to, insert: curly },
    selection: { anchor: from + 1 },
    effects: curlyTyped.of(from),
    userEvent: 'input.type',
    scrollIntoView: true,
  });

  return true;
});

// Backspace right after a conversion keeps the quote but makes it straight again
function straightenQuote(view: EditorView): boolean {
  const { state } = view;
  const at = state.field(curlyAt);
  const { main } = state.selection;

  if (at === null || !main.empty || main.head !== at + 1) return false;

  const straight = straightQuote(state.doc.sliceString(at, at + 1));

  if (straight === null) return false;

  view.dispatch({ changes: { from: at, to: at + 1, insert: straight }, selection: { anchor: at + 1 }, userEvent: 'delete.backward' });

  return true;
}

export const curlyQuoteTyping = [curlyAt, typeCurlyQuote, Prec.highest(keymap.of([{ key: 'Backspace', run: straightenQuote }]))];
