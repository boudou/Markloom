// Search adapter for the Markdown source editor: the shared engine does the searching,
// this only reads the document and turns edits, highlights and selections into transactions.
// `findHighlights` draws the matches and feeds the doc-change hook the engine recounts from.
// Both are static extensions: @uiw/react-codemirror reconfigures the editor whenever its
// extension list changes, which would drop anything added later.
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { collectMatches, createSearchEngine, type SearchEngine } from './engine';
import { createDocChangeListeners } from './docChangeListeners';

const setFindMatches = StateEffect.define<{ ranges: { from: number; to: number }[]; current: number }>();

const matchMark = Decoration.mark({ class: 'cm-searchMatch' });

const currentMatchMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFindMatches)) {
        return Decoration.set(
          effect.value.ranges.map((r, i) => (i === effect.value.current ? currentMatchMark : matchMark).range(r.from, r.to)),
          true
        );
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const docChanges = createDocChangeListeners<EditorView>();

export const findHighlights: Extension = [
  highlightField,
  EditorView.updateListener.of((update) => {
    if (update.docChanged) docChanges.notify(update.view);
  }),
];

export function codemirrorSearchEngine(view: EditorView): SearchEngine {
  return createSearchEngine({
    // Document positions are UTF-16 offsets with \n line breaks, the same as the string
    matches: (regex) => collectMatches(regex, view.state.doc.toString(), 0),
    applyReplacements(edits) {
      // `input.replace` never joins with neighbouring history events: one call, one undo step
      view.dispatch({
        changes: edits.map(({ from, to, text }) => ({ from, to, insert: text })),
        userEvent: 'input.replace',
      });
    },
    setHighlights(matches, current) {
      view.dispatch({ effects: setFindMatches.of({ ranges: matches, current }) });
    },
    select(match) {
      view.dispatch({
        selection: { anchor: match.from, head: match.to },
        effects: EditorView.scrollIntoView(match.from),
        userEvent: 'select.search',
      });
    },
    selectionFrom: () => view.state.selection.main.from,
    // The listener runs inside an update, so it must not dispatch (the engine only schedules a recount)
    onDocChange: (listener) => docChanges.listen(view, listener),
    focus: () => view.focus(),
  });
}
