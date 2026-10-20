import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface FindReplaceState {
  isOpen: boolean;
  showReplace: boolean;
  searchQuery: string;
  replaceQuery: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
}

interface FindReplaceActions {
  open: (showReplace?: boolean) => void;
  close: () => void;
  toggleReplace: () => void;
  setSearchQuery: (query: string) => void;
  setReplaceQuery: (query: string) => void;
  toggleCaseSensitive: () => void;
  toggleRegex: () => void;
  toggleWholeWord: () => void;
}

export const useFindReplaceStore = create<FindReplaceState & FindReplaceActions>()(
  immer((set) => ({
    isOpen: false,
    showReplace: false,
    searchQuery: '',
    replaceQuery: '',
    caseSensitive: false,
    useRegex: false,
    wholeWord: false,

    open: (showReplace = false) =>
      set((state) => {
        state.isOpen = true;
        state.showReplace = showReplace;
      }),

    close: () =>
      set((state) => {
        state.isOpen = false;
      }),

    toggleReplace: () =>
      set((state) => {
        state.showReplace = !state.showReplace;
      }),

    setSearchQuery: (query) =>
      set((state) => {
        state.searchQuery = query;
      }),

    setReplaceQuery: (query) =>
      set((state) => {
        state.replaceQuery = query;
      }),

    toggleCaseSensitive: () =>
      set((state) => {
        state.caseSensitive = !state.caseSensitive;
      }),

    toggleRegex: () =>
      set((state) => {
        state.useRegex = !state.useRegex;
      }),

    toggleWholeWord: () =>
      set((state) => {
        state.wholeWord = !state.wholeWord;
      }),
  }))
);
