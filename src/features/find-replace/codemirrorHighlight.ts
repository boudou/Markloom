// Match highlights for the shared Find bar in the source editor. CodeMirror's built-in
// highlighting only runs while its own search panel is open, which we don't use.
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export const setFindMatches = StateEffect.define<{ ranges: { from: number; to: number }[]; current: number }>();

const match = Decoration.mark({ class: 'cm-searchMatch' });
const currentMatch = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

export const findHighlights = StateField.define<DecorationSet>({
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
