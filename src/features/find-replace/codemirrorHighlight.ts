// Match highlights for the shared Find bar in the source editor, plus the doc-change hook the
// search engine recounts from. Both are static extensions: @uiw/react-codemirror reconfigures
// the editor whenever its extension list changes, which would drop anything added later.
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { createDocChangeListeners } from './engine';

export const setFindMatches = StateEffect.define<{ ranges: { from: number; to: number }[]; current: number }>();

const match = Decoration.mark({ class: 'cm-searchMatch' });

const currentMatch = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFindMatches)) {
        return Decoration.set(
          effect.value.ranges.map((r, i) => (i === effect.value.current ? currentMatch : match).range(r.from, r.to)),
          true
        );
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const docChanges = createDocChangeListeners<EditorView>();

/** Calls `listener` after each edit in `view` (it must not dispatch: it runs inside an update) */
export const onFindDocChange = docChanges.listen;

export const findHighlights: Extension = [
  highlightField,
  EditorView.updateListener.of((update) => {
    if (update.docChanged) docChanges.notify(update.view);
  }),
];
