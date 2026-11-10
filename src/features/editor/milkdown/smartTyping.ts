// Typing aids in rich text (#12), matching Markdown mode's: ( [ { get their closer, typing the
// closer in front of one we inserted steps over it, Backspace in an empty pair deletes both, and
// with "Curly quotes as you type" on, " and ' become curly. Both settings are read per keystroke,
// so a toggle applies without remounting the editor.
import { $inputRule, $prose } from '@milkdown/kit/utils';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import { selectAutoPairs, selectCurlyQuotes, useSettingsStore } from '@/stores/settingsStore';
import { PAIRS, curlyQuote, isOpener, pairsBefore } from '../utils/smartTyping';

const pairsKey = new PluginKey<number[]>('markloom-auto-pairs');

const CLOSERS: readonly string[] = Object.values(PAIRS);

// The character at `offset` in the cursor's textblock; '' at its end, U+FFFC for an inline node
function charAt($pos: ResolvedPos, offset: number): string {
  const { parent } = $pos;

  if (offset < 0 || offset >= parent.content.size) return '';

  return parent.textBetween(offset, offset + 1, null, '￼');
}

// Closers we inserted, mapped through each change; dropped once deleted or once the cursor leaves
// their textblock (CodeMirror drops them on a line change)
function mapClosers(closers: number[], tr: Transaction): number[] {
  const { doc, selection } = tr;
  const kept: number[] = [];

  for (const pos of closers) {
    const mapped = tr.mapping.mapResult(pos, 1);

    if (mapped.deleted || mapped.pos >= doc.content.size) continue;

    if (doc.resolve(mapped.pos).sameParent(selection.$head)) kept.push(mapped.pos);
  }

  // Only this file sets the meta, always to a closer's position in tr.doc
  const added: number | undefined = tr.getMeta(pairsKey);

  if (added !== undefined) kept.push(added);

  return kept;
}

const autoPairs = $prose(() => {
  // A closer typed in front of one of ours: the typed one goes in as usual (so input rules such as
  // `![alt](src)` still see it), and appendTransaction then removes ours
  let stepOver: { pos: number; closer: string } | null = null;

  return new Plugin<number[]>({
    key: pairsKey,
    state: {
      init: () => [],
      apply: (tr, closers) => (tr.docChanged || tr.selectionSet || tr.getMeta(pairsKey) !== undefined ? mapClosers(closers, tr) : closers),
    },
    props: {
      handleTextInput(view, from, to, text) {
        stepOver = null;

        const { state } = view;
        const { selection } = state;

        if (!selectAutoPairs(useSettingsStore.getState()) || view.composing) return false;

        if (!(selection instanceof TextSelection) || from !== selection.from || to !== selection.to) return false;

        const { $from, $to } = selection;

        if (CLOSERS.includes(text)) {
          const ours = pairsKey.getState(state) ?? [];

          if (selection.empty && ours.includes(to) && charAt($from, $from.parentOffset) === text) stepOver = { pos: to, closer: text };

          return false;
        }

        if (!isOpener(text)) return false;

        const closer = PAIRS[text];

        if (selection.empty) {
          if (!pairsBefore(charAt($from, $from.parentOffset))) return false;

          const tr = state.tr.insertText(text + closer, from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1)).setMeta(pairsKey, from + 1);
          view.dispatch(tr.scrollIntoView());

          return true;
        }

        if (!$from.sameParent($to)) return false;

        // Wrap the selection and keep it selected
        const tr = state.tr.insertText(closer, to).insertText(text, from);
        tr.setSelection(TextSelection.create(tr.doc, selection.anchor + 1, selection.head + 1)).setMeta(pairsKey, to + 1);
        view.dispatch(tr.scrollIntoView());

        return true;
      },
      // Backspace between an empty pair deletes both, as in Markdown mode (any pair, not only ours).
      // Runs before Milkdown's keymap, which is the last plugin.
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;

        const { selection } = view.state;

        if (!selectAutoPairs(useSettingsStore.getState()) || !(selection instanceof TextSelection) || !selection.empty) return false;

        const { $from } = selection;
        const before = charAt($from, $from.parentOffset - 1);

        if (!isOpener(before) || charAt($from, $from.parentOffset) !== PAIRS[before]) return false;

        view.dispatch(view.state.tr.delete($from.pos - 1, $from.pos + 1).scrollIntoView());

        return true;
      },
    },
    // Joins the keystroke's undo event: prosemirror-history never starts a group for an appended transaction
    appendTransaction(transactions, _oldState, newState) {
      const pending = stepOver;
      stepOver = null;

      if (pending === null) return null;

      let { pos } = pending;

      for (const tr of transactions) pos = tr.mapping.map(pos, 1);

      if (newState.selection.head !== pos || pos >= newState.doc.content.size) return null;

      const $pos = newState.doc.resolve(pos);

      if (charAt($pos, $pos.parentOffset) !== pending.closer) return null;

      return newState.tr.delete(pos, pos + 1);
    },
  });
});

// Off by default; Backspace right after a conversion gives the straight quote back through
// Milkdown's undoInputRule. InputRule's defaults skip code blocks, inCodeMark: false inline code;
// math, HTML and front matter are atoms edited in their own textarea.
const curlyQuoteRule = $inputRule(
  () =>
    new InputRule(
      /["']$/,
      (state, match, start, end) => {
        const quote = match[0] === '"' ? '"' : "'";

        if (!selectCurlyQuotes(useSettingsStore.getState())) return null;

        const curly = curlyQuote((match.input ?? '').slice(0, -1), quote);

        return curly === null ? null : state.tr.insertText(curly, start, end);
      },
      { inCodeMark: false }
    )
);

export const smartTyping = [autoPairs, curlyQuoteRule];
