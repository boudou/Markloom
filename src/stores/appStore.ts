import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useTabsStore } from '@/features/tabs';
import { writeFile } from '@/features/file-tree/api/fileSystem';

export type EditorMode = 'split' | 'wysiwyg';
/** What the left panel shows: the folder's files, or the document's contents (headings) */
export type SidebarView = 'files' | 'outline';

interface AppStateBase {
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

// Base app store for non-tab related state
export const useAppStoreBase = create<AppStateBase>()(
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

// Combined interface for backwards compatibility
interface AppState extends AppStateBase {
  // Active tab content (derived from tabsStore)
  content: string;
  activeFilePath: string | null;
  isDirty: boolean;

  // Content actions (delegate to tabsStore)
  setContent: (content: string) => void;
  loadFile: (path: string, content: string) => void;
  markSaved: () => void;
  setDirty: (dirty: boolean) => void;
  saveFile: () => Promise<void>;
}

// Combined hook for backwards compatibility
// Components can continue using useAppStore and get tab-aware content
export function useAppStore(): AppState;
export function useAppStore<T>(selector: (state: AppState) => T): T;
export function useAppStore<T>(selector?: (state: AppState) => T): AppState | T {
  // Get base state
  const baseState = useAppStoreBase();

  // Get tabs state
  const tabsState = useTabsStore();
  const activeTab = tabsState.tabs.find(t => t.id === tabsState.activeTabId);

  // Create combined state
  const combinedState: AppState = {
    ...baseState,

    // Derived from active tab
    content: activeTab?.content ?? '',
    activeFilePath: activeTab?.path ?? null,
    isDirty: activeTab?.isDirty ?? false,

    // Actions that delegate to tabsStore
    setContent: (content: string) => {
      if (tabsState.activeTabId) {
        tabsState.updateTabContent(tabsState.activeTabId, content);
      }
    },

    loadFile: (path: string, content: string) => tabsState.openDocument(path, content),

    markSaved: () => {
      if (tabsState.activeTabId) {
        tabsState.markTabSaved(tabsState.activeTabId);
      }
    },

    setDirty: (dirty: boolean) => {
      // This is a simplified version - in practice isDirty is computed
      // from content vs originalContent, but we provide this for compatibility
      if (tabsState.activeTabId && activeTab) {
        if (!dirty) {
          tabsState.markTabSaved(tabsState.activeTabId);
        }
      }
    },

    saveFile: async () => {
      if (!tabsState.activeTabId || !activeTab?.path) {
        throw new Error('No file to save');
      }
      await writeFile(activeTab.path, activeTab.content);
      tabsState.markTabSaved(tabsState.activeTabId);
    },
  };

  if (selector) {
    return selector(combinedState);
  }

  return combinedState;
}
