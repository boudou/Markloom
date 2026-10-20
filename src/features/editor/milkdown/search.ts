// Find and replace for the rich-text editor: a thin adapter over the shared search engine.
// Highlights are decorations, edits are normal transactions, so replacements undo like any other edit.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import {
  collectMatches,
  createDocChangeListeners,
  createSearchEngine,
  type SearchEngine,
  type SearchMatch,
} from '@/features/find-replace/engine';

interface HighlightMeta {
  matches: SearchMatch[];
  current: number;
}

const key = new PluginKey<DecorationSet>('markloom-search');
const docChanges = createDocChangeListeners<EditorView>();

export const searchPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, decorations) {
          const meta: HighlightMeta | undefined = tr.getMeta(key);
          if (meta) {
            return DecorationSet.create(
              tr.doc,
              meta.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, { class: i === meta.current ? 'rt-find-match is-current' : 'rt-find-match' })
              )
            );
          }

          // Between recounts the highlights just follow the edits
          return tr.docChanged ? decorations.map(tr.mapping, tr.doc) : decorations;
        },
      },
      props: {
        decorations: (state) => key.getState(state),
      },
      view: () => ({
        update(view, previous) {
          if (view.state.doc !== previous.doc) docChanges.notify(view);
        },
      }),
    })
);

/** Adapter used by the shared Find bar */
export function prosemirrorSearchEngine(view: EditorView): SearchEngine {
  // The bar can clear the search after Milkdown destroyed the view (mode or tab switch)
  const dispatch = (build: (state: EditorState) => Transaction) => {
    if (!view.isDestroyed) view.dispatch(build(view.state));
  };

  return createSearchEngine({
    matches(regex) {
      const found: SearchMatch[] = [];
      view.state.doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        // One character per position: inline leaves (images, breaks) become U+FFFC
        const text = node.textBetween(0, node.content.size, undefined, '￼');
        for (const match of collectMatches(regex, text, pos + 1)) found.push(match);
        return false;
      });
      return found;
    },
    applyReplacements(edits) {
      dispatch((state) => {
        let tr = state.tr;
        // Back to front so earlier positions stay valid; one transaction = one undo step
        for (let i = edits.length - 1; i >= 0; i--) tr = tr.insertText(edits[i].text, edits[i].from, edits[i].to);
        return tr;
      });
    },
    setHighlights(matches, current) {
      const meta: HighlightMeta = { matches, current };
      dispatch((state) => state.tr.setMeta(key, meta));
    },
    select(match) {
      dispatch((state) => state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView());
    },
    selectionFrom: () => view.state.selection.from,
    onDocChange: (listener) => docChanges.listen(view, listener),
    focus: () => view.focus(),
  });
}
