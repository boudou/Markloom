// Find and replace for the rich-text editor: highlights matches as decorations and
// edits through normal transactions, so replacements undo like any other edit.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import {
  buildSearchRegExp,
  type SearchEngine,
  type SearchOptions,
  type SearchResult,
} from '@/features/find-replace/engine';

interface Match {
  from: number;
  to: number;
}

interface SearchState {
  regex: RegExp | null;
  matches: Match[];
  current: number;
}

const key = new PluginKey<SearchState>('markloom-search');
const EMPTY: SearchState = { regex: null, matches: [], current: -1 };

function findMatches(state: EditorState, regex: RegExp | null): Match[] {
  if (!regex) return [];
  const matches: Match[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // One character per position: inline leaves (images, breaks) become U+FFFC
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    regex.lastIndex = 0;
    for (let m = regex.exec(text); m; m = regex.exec(text)) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
    }
    return false;
  });
  return matches;
}

export const searchPlugin = $prose(
  () =>
    new Plugin<SearchState>({
      key,
      state: {
        init: () => EMPTY,
        apply(tr, prev, _old, state) {
          const meta = tr.getMeta(key) as Partial<SearchState> | undefined;
          if (!meta && !tr.docChanged) return prev;
          const regex = meta && 'regex' in meta ? (meta.regex ?? null) : prev.regex;
          const matches = findMatches(state, regex);
          const wanted = meta?.current ?? prev.current;
          return { regex, matches, current: matches.length ? Math.min(Math.max(wanted, 0), matches.length - 1) : -1 };
        },
      },
      props: {
        decorations(state) {
          const search = key.getState(state);
          if (!search?.matches.length) return null;
          return DecorationSet.create(
            state.doc,
            search.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, { class: i === search.current ? 'rt-find-match is-current' : 'rt-find-match' })
            )
          );
        },
      },
    })
);

/** Adapter used by the shared Find bar */
export function prosemirrorSearchEngine(view: EditorView): SearchEngine {
  let replacement = '';
  const state = () => key.getState(view.state) ?? EMPTY;
  const result = (): SearchResult => ({ count: state().matches.length, current: state().current });

  const reveal = () => {
    const match = state().matches[state().current];
    if (!match) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView());
  };

  return {
    update(options: SearchOptions) {
      replacement = options.replacement;
      const regex = buildSearchRegExp(options);
      // Start from the first match at or after the cursor
      const from = view.state.selection.from;
      const matches = findMatches(view.state, regex);
      const first = matches.findIndex((m) => m.from >= from);
      view.dispatch(view.state.tr.setMeta(key, { regex, current: first === -1 ? 0 : first }));
      reveal();
      return { ...result(), invalid: !!options.query && !regex };
    },
    next() {
      const { matches, current } = state();
      if (matches.length) view.dispatch(view.state.tr.setMeta(key, { current: (current + 1) % matches.length }));
      reveal();
      return result();
    },
    previous() {
      const { matches, current } = state();
      if (matches.length) view.dispatch(view.state.tr.setMeta(key, { current: (current - 1 + matches.length) % matches.length }));
      reveal();
      return result();
    },
    replace() {
      const match = state().matches[state().current];
      if (match) view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
      reveal();
      return result();
    },
    replaceAll() {
      const { matches } = state();
      if (!matches.length) return 0;
      let tr = view.state.tr;
      // Back to front so earlier positions stay valid; one transaction = one undo step
      for (const match of [...matches].reverse()) tr = tr.insertText(replacement, match.from, match.to);
      view.dispatch(tr);
      return matches.length;
    },
    clear() {
      view.dispatch(view.state.tr.setMeta(key, { regex: null, current: -1 }));
    },
    focusEditor: () => view.focus(),
  };
}
