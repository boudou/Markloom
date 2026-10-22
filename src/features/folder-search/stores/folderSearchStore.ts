import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// The sidebar Search panel's query and toggles: its own, not the Find bar's, and not persisted
interface FolderSearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Bumped to ask the panel to focus its input (Ctrl+Shift+F while it is already showing) */
  focusRequest: number;
}

interface FolderSearchActions {
  setQuery: (query: string) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  requestFocus: () => void;
}

export const useFolderSearchStore = create<FolderSearchState & FolderSearchActions>()(
  immer((set) => ({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    focusRequest: 0,

    setQuery: (query) =>
      set((state) => {
        state.query = query;
      }),

    toggleCaseSensitive: () =>
      set((state) => {
        state.caseSensitive = !state.caseSensitive;
      }),

    toggleWholeWord: () =>
      set((state) => {
        state.wholeWord = !state.wholeWord;
      }),

    toggleRegex: () =>
      set((state) => {
        state.regex = !state.regex;
      }),

    requestFocus: () =>
      set((state) => {
        state.focusRequest += 1;
      }),
  }))
);
