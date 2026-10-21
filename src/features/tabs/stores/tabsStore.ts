import { useCallback } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { documentName } from '@/features/file-tree/api/fileSystem';

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  /** Changes whenever a different file is loaded into this tab; editors are keyed by it so undo history never crosses documents */
  loadId: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  /** Opens a new tab, or switches to the tab that already has this path */
  createTab: (path?: string | null, content?: string, name?: string) => void;
  /** Opens a file, reusing the active tab when it is an empty, untouched Untitled tab */
  openDocument: (path: string, content: string) => void;
  closeTab: (tabId: string) => void;
  /** Closes several tabs at once (no unsaved-changes check; see requestCloseTabs) */
  closeTabs: (tabIds: string[]) => void;
  /** Points a tab at a new file location, e.g. after "Save as" */
  setTabPath: (tabId: string, path: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  loadFileIntoTab: (tabId: string, path: string, content: string) => void;
  /** Records what is now on disk; pass the text that was written if editing continued meanwhile */
  markTabSaved: (tabId: string, savedContent?: string) => void;
}

const createNewTab = (path?: string | null, content?: string, name?: string): Tab => {
  const fileName = path ? documentName(path) : name || 'Untitled';

  return {
    id: nanoid(),
    path: path || null,
    name: fileName,
    content: content || '',
    originalContent: content || '',
    isDirty: false,
    loadId: nanoid(),
  };
};

export const useTabsStore = create<TabsState>()(
  immer((set, get) => ({
    tabs: [createNewTab(null, '', 'Untitled')],
    activeTabId: null,

    createTab: (path, content, name) => {
      const newTab = createNewTab(path, content, name);
      set((state) => {
        // Check if file is already open
        if (path) {
          const existingTab = state.tabs.find((t) => t.path === path);

          if (existingTab) {
            state.activeTabId = existingTab.id;

            return;
          }
        }

        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
      });
    },

    openDocument: (path, content) => {
      const state = get();
      const active = state.tabs.find((t) => t.id === state.activeTabId);
      const alreadyOpen = state.tabs.some((t) => t.path === path);

      if (!alreadyOpen && active && !active.path && !active.isDirty && active.content === '') {
        get().loadFileIntoTab(active.id, path, content);
      } else {
        get().createTab(path, content);
      }
    },

    closeTab: (tabId) => get().closeTabs([tabId]),

    closeTabs: (tabIds) => {
      set((state) => {
        const activeIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
        state.tabs = state.tabs.filter((t) => !tabIds.includes(t.id));

        if (state.tabs.length === 0) {
          // Always keep one tab so there is somewhere to write
          const newTab = createNewTab();
          state.tabs.push(newTab);
          state.activeTabId = newTab.id;
        } else if (!state.tabs.some((t) => t.id === state.activeTabId)) {
          // The active tab was closed: move to its left neighbour
          const newIndex = Math.min(Math.max(0, activeIndex - 1), state.tabs.length - 1);
          state.activeTabId = state.tabs[newIndex].id;
        }
      });
    },

    setTabPath: (tabId, path) => {
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);

        if (tab) {
          tab.path = path;
          tab.name = documentName(path);
        }
      });
    },

    setActiveTab: (tabId) => {
      set((state) => {
        if (state.tabs.some((t) => t.id === tabId)) {
          state.activeTabId = tabId;
        }
      });
    },

    updateTabContent: (tabId, content) => {
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);

        if (tab) {
          tab.content = content;
          tab.isDirty = content !== tab.originalContent;
        }
      });
    },

    loadFileIntoTab: (tabId, path, content) => {
      set((state) => {
        const index = state.tabs.findIndex((t) => t.id === tabId);

        // A freshly loaded document under the same tab id (new loadId, clean state)
        if (index !== -1) state.tabs[index] = { ...createNewTab(path, content), id: tabId };
      });
    },

    markTabSaved: (tabId, savedContent) => {
      set((state) => {
        const tab = state.tabs.find((t) => t.id === tabId);

        if (tab) {
          tab.originalContent = savedContent ?? tab.content;
          tab.isDirty = tab.content !== tab.originalContent;
        }
      });
    },
  }))
);

// Initialize with active tab
useTabsStore.setState((state) => ({
  activeTabId: state.tabs[0]?.id || null,
}));

/** The tab being edited. Select fields from it, not the tab itself: its object changes on every keystroke. */
export const selectActiveTab = (s: TabsState): Tab | undefined => s.tabs.find((t) => t.id === s.activeTabId);

/** A document's text ('' for an unknown tab). Read text through this, never through a tab object. */
export const selectTabContent = (s: TabsState, tabId: string): string => s.tabs.find((t) => t.id === tabId)?.content ?? '';

/** The active document's text ('' when no tab is active). Read text through this, never through a tab object. */
export const selectActiveContent = (s: TabsState): string => selectActiveTab(s)?.content ?? '';

export const useActiveContent = () => useTabsStore(selectActiveContent);

/** Where the active document lives; null until it is saved */
export const useActivePath = () => useTabsStore((s) => selectActiveTab(s)?.path ?? null);

/** Editor onChange: writes into the tab that was active when the editor rendered */
export function useSetActiveContent() {
  const tabId = useTabsStore((s) => s.activeTabId);

  return useCallback(
    (content: string) => {
      if (tabId) useTabsStore.getState().updateTabContent(tabId, content);
    },
    [tabId]
  );
}
