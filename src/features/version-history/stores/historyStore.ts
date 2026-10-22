import { create } from 'zustand';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  listVersions,
  readVersionContent,
  saveVersion,
  deleteVersion,
  trimVersions,
  clearAllVersions,
  type VersionMeta,
} from '../utils';

interface SelectedVersion {
  id: string;
  /** `null` while the snapshot's text is being read */
  content: string | null;
}

interface HistoryState {
  /** The document `versions` belong to; replies for any other document are dropped */
  filePath: string | null;
  versions: VersionMeta[];
  isLoading: boolean;
  selected: SelectedVersion | null;

  // Actions
  loadVersions: (filePath: string) => Promise<void>;
  saveCurrentVersion: (filePath: string, content: string, label?: string) => Promise<void>;
  selectVersion: (id: string | null) => Promise<void>;
  removeVersion: (id: string) => Promise<void>;
  /** Drops every file's versions past `keep`; rethrows so Settings can say it failed */
  trimAll: (keep: number) => Promise<void>;
  /** Deletes every file's versions; rethrows so Settings can say it failed */
  clearAll: () => Promise<void>;
}

/** The selection, unless its version is no longer in `versions` */
function keptSelection(selected: SelectedVersion | null, versions: VersionMeta[]): SelectedVersion | null {
  return selected && versions.some((v) => v.id === selected.id) ? selected : null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  filePath: null,
  versions: [],
  isLoading: false,
  selected: null,

  loadVersions: async (filePath) => {
    set((state) => ({
      filePath,
      isLoading: true,
      selected: state.filePath === filePath ? state.selected : null,
    }));

    try {
      const versions = await listVersions(filePath);

      if (get().filePath === filePath) set({ versions, isLoading: false });
    } catch (error) {
      console.error('Failed to load versions:', error);

      if (get().filePath === filePath) set({ versions: [], isLoading: false });
    }
  },

  saveCurrentVersion: async (filePath, content, label) => {
    try {
      const versions = await saveVersion(filePath, content, useSettingsStore.getState().historyLimit, label);

      if (get().filePath !== filePath) return;

      // The save may have pruned the selected version
      set((state) => ({ versions, selected: keptSelection(state.selected, versions) }));
    } catch (error) {
      console.error('Failed to save version:', error);
    }
  },

  selectVersion: async (id) => {
    if (id === null) {
      set({ selected: null });

      return;
    }

    set({ selected: { id, content: null } });

    try {
      const content = await readVersionContent(id);

      // Another version was picked meanwhile
      if (get().selected?.id !== id) return;

      if (content === undefined) {
        console.error('Version not found:', id);
        set({ selected: null });

        return;
      }

      set({ selected: { id, content } });
    } catch (error) {
      console.error('Failed to read version:', error);

      if (get().selected?.id === id) set({ selected: null });
    }
  },

  removeVersion: async (id) => {
    try {
      await deleteVersion(id);
      set((state) => ({
        versions: state.versions.filter((v) => v.id !== id),
        selected: state.selected?.id === id ? null : state.selected,
      }));
    } catch (error) {
      console.error('Failed to delete version:', error);
    }
  },

  trimAll: async (keep) => {
    try {
      await trimVersions(keep);
    } catch (error) {
      console.error('Failed to trim versions:', error);
      throw error;
    }

    // `versions` is newest first, the order the database prune keeps
    set((state) => {
      const versions = state.versions.slice(0, keep);

      return { versions, selected: keptSelection(state.selected, versions) };
    });
  },

  clearAll: async () => {
    try {
      await clearAllVersions();
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw error;
    }

    set({ versions: [], selected: null });
  },
}));
