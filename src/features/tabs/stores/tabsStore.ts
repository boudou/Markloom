import { useCallback } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { documentName } from '@/features/file-tree/api/fileSystem';

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  originalContent: string;
  isDirty: boolean;
  /** Changes whenever a different file is loaded into this tab; editors are keyed by it so undo history never crosses documents */
  loadId: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  /** Document text by tab id; read it only through selectTabContent/selectActiveContent. Typing changes only this, not `tabs`. */
  contents: Record<string, string>;

  // Actions
  /**
   * Opens a new tab, or switches to the tab that already has this path.
   * A pathless tab without a `name` gets the lowest free "Untitled", "Untitled 2", …; an explicit `name` is used as given.
   */
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
    originalContent: content || '',
    isDirty: false,
    loadId: nanoid(),
  };
};

/** "Untitled" if no open tab has that name, else "Untitled N" for the lowest N >= 2 that is free */
function nextUntitledName(tabs: Tab[]): string {
  const taken = new Set(tabs.map((t) => t.name));

  if (!taken.has('Untitled')) return 'Untitled';

  let n = 2;

  while (taken.has(`Untitled ${n}`)) n++;

  return `Untitled ${n}`;
}

const firstTab = createNewTab(null, '', 'Untitled');

export const useTabsStore = create<TabsState>()(
  immer((set, get) => ({
    tabs: [firstTab],
    activeTabId: firstTab.id,
    contents: { [firstTab.id]: '' },

    createTab: (path, content, name) => {
      const tabName = !path && name === undefined ? nextUntitledName(get().tabs) : name;
      const newTab = createNewTab(path, content, tabName);
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
        state.contents[newTab.id] = content ?? '';
        state.activeTabId = newTab.id;
      });
    },

    openDocument: (path, content) => {
      const state = get();
      const active = selectActiveTab(state);
      const alreadyOpen = state.tabs.some((t) => t.path === path);

      if (!alreadyOpen && active && !active.path && !active.isDirty && selectTabContent(state, active.id) === '') {
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

        for (const id of tabIds) delete state.contents[id];

        if (state.tabs.length === 0) {
          // Always keep one tab so there is somewhere to write
          const newTab = createNewTab();
          state.tabs.push(newTab);
          state.contents[newTab.id] = '';
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
        const tab = selectTab(state, tabId);

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

    // A plain object set, not immer: this runs on every keystroke. Only a dirty flip touches `tabs`.
    updateTabContent: (tabId, content) => {
      const state = get();
      const tab = selectTab(state, tabId);

      if (!tab || state.contents[tabId] === content) return;

      const contents = { ...state.contents, [tabId]: content };
      const isDirty = content !== tab.originalContent;

      if (isDirty === tab.isDirty) {
        set({ contents });
      } else {
        set({ contents, tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isDirty } : t)) });
      }
    },

    loadFileIntoTab: (tabId, path, content) => {
      set((state) => {
        const index = state.tabs.findIndex((t) => t.id === tabId);

        // A freshly loaded document under the same tab id (new loadId, clean state)
        if (index === -1) return;

        state.tabs[index] = { ...createNewTab(path, content), id: tabId };
        state.contents[tabId] = content;
      });
    },

    markTabSaved: (tabId, savedContent) => {
      set((state) => {
        const tab = selectTab(state, tabId);

        if (tab) {
          const content = selectTabContent(state, tabId);
          tab.originalContent = savedContent ?? content;
          tab.isDirty = content !== tab.originalContent;
        }
      });
    },
  }))
);

/** The tab with this id. Select fields from it: its object changes when the tab's name, path, saved text or dirty state changes. */
export const selectTab = (s: TabsState, tabId: string | null): Tab | undefined => s.tabs.find((t) => t.id === tabId);

/** The tab being edited. Select fields from it: its object changes when the tab's name, path, saved text or dirty state changes. */
export const selectActiveTab = (s: TabsState): Tab | undefined => selectTab(s, s.activeTabId);

/** A document's text ('' for an unknown tab). The only way to read text, with selectActiveContent. */
export const selectTabContent = (s: TabsState, tabId: string): string => s.contents[tabId] ?? '';

/** The active document's text ('' when no tab is active). */
export const selectActiveContent = (s: TabsState): string => (s.activeTabId ? selectTabContent(s, s.activeTabId) : '');

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
