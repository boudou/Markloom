import { create } from 'zustand';
import {
  saveVersion,
  getVersionsForFile,
  deleteVersion,
  deleteVersionsForFile,
  cleanupOldVersions,
  type VersionEntry,
} from '../utils';

interface HistoryState {
  versions: VersionEntry[];
  isLoading: boolean;
  selectedVersionId: string | null;
  isPanelOpen: boolean;

  // Actions
  loadVersions: (filePath: string) => Promise<void>;
  saveCurrentVersion: (filePath: string, content: string, label?: string) => Promise<void>;
  selectVersion: (id: string | null) => void;
  removeVersion: (id: string) => Promise<void>;
  clearVersions: (filePath: string) => Promise<void>;
  togglePanel: () => void;
  setIsPanelOpen: (open: boolean) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  versions: [],
  isLoading: false,
  selectedVersionId: null,
  isPanelOpen: false,

  loadVersions: async (filePath) => {
    set({ isLoading: true });
    try {
      const versions = await getVersionsForFile(filePath);
      set({ versions, isLoading: false });
    } catch (error) {
      console.error('Failed to load versions:', error);
      set({ versions: [], isLoading: false });
    }
  },

  saveCurrentVersion: async (filePath, content, label) => {
    try {
      await saveVersion(filePath, content, label);
      // Clean up old versions (keep latest 50)
      await cleanupOldVersions(filePath, 50);
      // Reload versions
      const versions = await getVersionsForFile(filePath);
      set({ versions });
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

  clearVersions: async (filePath) => {
    try {
      await deleteVersionsForFile(filePath);
      set({ versions: [], selectedVersionId: null });
    } catch (error) {
      console.error('Failed to clear versions:', error);
    }
  },

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setIsPanelOpen: (open) => set({ isPanelOpen: open }),
}));
