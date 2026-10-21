import { create } from 'zustand';
import { listVersions, readVersionContent, saveVersion, deleteVersion, type VersionMeta } from '../utils';

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
      const versions = await saveVersion(filePath, content, label);

      if (get().filePath !== filePath) return;

      set((state) => ({
        versions,
        // The save may have pruned the selected version
        selected: state.selected && versions.some((v) => v.id === state.selected?.id) ? state.selected : null,
      }));
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
}));
