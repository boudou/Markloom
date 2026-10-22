import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { flushEditorEdits } from './uiStore';

export type EditorMode = 'split' | 'wysiwyg';

/** What the left panel shows: the folder's files, the document's contents (headings), or a search of the folder */
export type SidebarView = 'files' | 'outline' | 'search';

interface AppState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarWidth: number;

  // Root folder
  rootPath: string | null;

  // Editor
  editorMode: EditorMode;

  // Which panel the sidebar shows
  sidebarView: SidebarView;

  /** Only the writing surface shows; the layout it hides is left as it was. Not remembered across restarts. */
  focusMode: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setRootPath: (path: string | null) => void;
  setEditorMode: (mode: EditorMode) => void;
  /** Opens the sidebar on a view, or closes it if that view is already showing */
  toggleSidebarView: (view: SidebarView) => void;
  showSidebarView: (view: SidebarView) => void;
  toggleFocusMode: () => void;
  setFocusMode: (on: boolean) => void;
}

/** Sidebar width in px: the store clamp, the resize handle and its double-click reset read this */
export const SIDEBAR_WIDTH = { min: 200, max: 500, defaultValue: 280 } as const;

// Layout and mode. Document state lives in the tabs store (`@/features/tabs`).
export const useAppStore = create<AppState>()(
  persist(
  immer((set) => ({
    // Initial state
    sidebarOpen: true,
    sidebarWidth: SIDEBAR_WIDTH.defaultValue,
    rootPath: null,
    editorMode: 'split',
    sidebarView: 'files',
    focusMode: false,

    // Actions
    toggleSidebar: () =>
      set((state) => {
        state.sidebarOpen = !state.sidebarOpen;
      }),

    setSidebarWidth: (width) =>
      set((state) => {
        state.sidebarWidth = Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, width));
      }),

    setRootPath: (path) =>
      set((state) => {
        state.rootPath = path;
      }),

    setEditorMode: (mode) => {
      // The leaving editor's pending edit reaches the tabs store before the other editor
      // renders, so it arrives there as outside text and never as that editor's undo step
      flushEditorEdits();
      set((state) => {
        state.editorMode = mode;
      });
    },

    toggleSidebarView: (view) =>
      set((state) => {
        const showing = state.sidebarOpen && state.sidebarView === view;
        state.sidebarView = view;
        state.sidebarOpen = !showing;
      }),

    showSidebarView: (view) =>
      set((state) => {
        state.sidebarView = view;
        state.sidebarOpen = true;
      }),

    toggleFocusMode: () =>
      set((state) => {
        state.focusMode = !state.focusMode;
      }),

    setFocusMode: (on) =>
      set((state) => {
        state.focusMode = on;
      }),
  })),
    {
      // Layout survives restarts; the open folder is restored separately (it needs permission)
      name: 'markloom-layout',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        editorMode: state.editorMode,
        sidebarView: state.sidebarView,
      }),
    }
  )
);
