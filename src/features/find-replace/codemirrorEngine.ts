// Search adapter for the Markdown source editor: the shared engine does the searching,
// this only reads the document and turns edits, highlights and selections into transactions.
import { EditorView } from '@codemirror/view';
import { collectMatches, createSearchEngine, type SearchEngine } from './engine';
import { onFindDocChange, setFindMatches } from './codemirrorHighlight';

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
    onDocChange: (listener) => onFindDocChange(view, listener),
    focus: () => view.focus(),
  });
}
