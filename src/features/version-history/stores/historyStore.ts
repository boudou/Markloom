import { create } from 'zustand';
import { saveVersion, getVersionsForFile, deleteVersion, cleanupOldVersions, type VersionEntry } from '../utils';

interface HistoryState {
  /** The document `versions` belong to; replies for any other document are dropped */
  filePath: string | null;
  versions: VersionEntry[];
  isLoading: boolean;
  selectedVersionId: string | null;

  // Actions
  loadVersions: (filePath: string) => Promise<void>;
  saveCurrentVersion: (filePath: string, content: string, label?: string) => Promise<void>;
  selectVersion: (id: string | null) => void;
  removeVersion: (id: string) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  filePath: null,
  versions: [],
  isLoading: false,
  selectedVersionId: null,

  loadVersions: async (filePath) => {
    set((state) => ({
      filePath,
      isLoading: true,
      selectedVersionId: state.filePath === filePath ? state.selectedVersionId : null,
    }));
    try {
      const versions = await getVersionsForFile(filePath);
      if (get().filePath === filePath) set({ versions, isLoading: false });
    } catch (error) {
      console.error('Failed to load versions:', error);
      if (get().filePath === filePath) set({ versions: [], isLoading: false });
    }
  },

  saveCurrentVersion: async (filePath, content, label) => {
    try {
      await saveVersion(filePath, content, label);
      // Clean up old versions (keep latest 50)
      await cleanupOldVersions(filePath, 50);
      const versions = await getVersionsForFile(filePath);
      if (get().filePath === filePath) set({ versions });
    } catch (error) {
      console.error('Failed to save version:', error);
    }
  },

  selectVersion: (id) => set({ selectedVersionId: id }),

  removeVersion: async (id) => {
    try {
      await deleteVersion(id);
      set((state) => ({
        versions: state.versions.filter((v) => v.id !== id),
        selectedVersionId: state.selectedVersionId === id ? null : state.selectedVersionId,
      }));
    } catch (error) {
      console.error('Failed to delete version:', error);
    }
  },
}));
