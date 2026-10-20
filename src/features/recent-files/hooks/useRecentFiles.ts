import { useCallback } from 'react';
import { useSettingsStore, type RecentFile } from '@/stores/settingsStore';
import { useTabsStore } from '@/features/tabs';
import { readFile } from '@/features/file-tree/api/fileSystem';

export type { RecentFile };

export function useRecentFiles() {
  const recentFiles = useSettingsStore((s) => s.recentFiles);
  const storeAddRecentFile = useSettingsStore((s) => s.addRecentFile);
  const storeRemoveRecentFile = useSettingsStore((s) => s.removeRecentFile);
  const storeClearRecentFiles = useSettingsStore((s) => s.clearRecentFiles);
  const openDocument = useTabsStore((s) => s.openDocument);

  const addRecentFile = useCallback(
    (path: string) => {
      const name = path.split(/[/\\]/).pop() || path;
      storeAddRecentFile({ path, name });
    },
    [storeAddRecentFile]
  );

  const removeRecentFile = useCallback(
    (path: string) => {
      storeRemoveRecentFile(path);
    },
    [storeRemoveRecentFile]
  );

  const clearRecentFiles = useCallback(() => {
    storeClearRecentFiles();
  }, [storeClearRecentFiles]);

  const openRecentFile = useCallback(
    async (path: string) => {
      try {
        const content = await readFile(path);
        openDocument(path, content);
        addRecentFile(path);
      } catch (error) {
        console.error('Failed to open recent file:', error);
        // Optionally remove from recent files if it no longer exists
        removeRecentFile(path);
        throw error;
      }
    },
    [openDocument, addRecentFile, removeRecentFile]
  );

  return {
    recentFiles,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
    openRecentFile,
  };
}
