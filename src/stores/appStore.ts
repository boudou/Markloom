import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';

export type EditorMode = 'split' | 'wysiwyg';

/** What the left panel shows: the folder's files, or the document's contents (headings) */
export type SidebarView = 'files' | 'outline';

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

  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setRootPath: (path: string | null) => void;
  setEditorMode: (mode: EditorMode) => void;
  /** Opens the sidebar on a view, or closes it if that view is already showing */
  toggleSidebarView: (view: SidebarView) => void;
  showSidebarView: (view: SidebarView) => void;
}

// Layout and mode. Document state lives in the tabs store (`@/features/tabs`).
export const useAppStore = create<AppState>()(
  persist(
  immer((set) => ({
    // Initial state
    sidebarOpen: true,
    sidebarWidth: 280,
    rootPath: null,
    editorMode: 'split',
    sidebarView: 'files',

    // Actions
    toggleSidebar: () =>
      set((state) => {
        state.sidebarOpen = !state.sidebarOpen;
      }),

    setSidebarWidth: (width) =>
      set((state) => {
        state.sidebarWidth = Math.max(200, Math.min(500, width));
      }),

    setRootPath: (path) =>
      set((state) => {
        state.rootPath = path;
      }),

    setEditorMode: (mode) =>
      set((state) => {
        state.editorMode = mode;
      }),

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
