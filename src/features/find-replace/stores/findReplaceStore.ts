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
  matchCount: number;
  currentMatch: number;
}

interface FindReplaceActions {
  open: (showReplace?: boolean) => void;
  close: () => void;
  toggle: () => void;
  toggleReplace: () => void;
  setSearchQuery: (query: string) => void;
  setReplaceQuery: (query: string) => void;
  toggleCaseSensitive: () => void;
  toggleRegex: () => void;
  toggleWholeWord: () => void;
  setMatchCount: (count: number) => void;
  setCurrentMatch: (current: number) => void;
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
    matchCount: 0,
    currentMatch: 0,

    open: (showReplace = false) =>
      set((state) => {
        state.isOpen = true;
        state.showReplace = showReplace;
      }),

    close: () =>
      set((state) => {
        state.isOpen = false;
      }),

    toggle: () =>
      set((state) => {
        state.isOpen = !state.isOpen;
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

    setMatchCount: (count) =>
      set((state) => {
        state.matchCount = count;
      }),

    setCurrentMatch: (current) =>
      set((state) => {
        state.currentMatch = current;
      }),
  }))
);
