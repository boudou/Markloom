// Search engine for the Markdown source editor (CodeMirror's own search, driven by our bar).
import type { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll as cmReplaceAll,
} from '@codemirror/search';
import { buildSearchRegExp, type SearchEngine, type SearchOptions, type SearchResult } from './engine';
import { setFindMatches } from './codemirrorHighlight';

export function codemirrorSearchEngine(view: EditorView): SearchEngine {
  let query: SearchQuery | null = null;

  // Counts matches, works out which one holds the selection, and redraws the highlights
  const result = (): SearchResult => {
    if (!query || !query.valid || !query.search) {
      view.dispatch({ effects: setFindMatches.of({ ranges: [], current: -1 }) });
      return { count: 0, current: -1, invalid: !!query && !!query.search && !query.valid };
    }
    const { from } = view.state.selection.main;
    const cursor = query.getCursor(view.state.doc);
    const ranges: { from: number; to: number }[] = [];
    let current = -1;
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      if (current === -1 && next.value.from >= from) current = ranges.length;
      ranges.push({ from: next.value.from, to: next.value.to });
    }
    current = ranges.length ? Math.max(0, current) : -1;
    view.dispatch({ effects: setFindMatches.of({ ranges, current }) });
    return { count: ranges.length, current };
  };

  return {
    update(options: SearchOptions) {
      // Same pattern rules as Rich text, expressed as a CodeMirror regexp query
      const regex = buildSearchRegExp(options);
      query = new SearchQuery({
        search: options.query ? (regex?.source ?? options.query) : '',
        replace: options.replacement,
        caseSensitive: options.caseSensitive,
        regexp: true,
      });
      if (options.query && !regex) {
        view.dispatch({
          effects: [setSearchQuery.of(new SearchQuery({ search: '' })), setFindMatches.of({ ranges: [], current: -1 })],
        });
        return { count: 0, current: -1, invalid: true };
      }
      view.dispatch({ effects: setSearchQuery.of(query) });
      return result();
    },
    next() {
      findNext(view);
      return result();
    },
    previous() {
      findPrevious(view);
      return result();
    },
    replace() {
      replaceNext(view);
      return result();
    },
    replaceAll() {
      const before = result().count;
      cmReplaceAll(view);
      return before;
    },
    clear() {
      query = null;
      view.dispatch({ effects: [setSearchQuery.of(new SearchQuery({ search: '' })), setFindMatches.of({ ranges: [], current: -1 })] });
    },
    focusEditor: () => view.focus(),
  };
}
