// Document-level actions shared by the title bar, keyboard shortcuts and empty states.
import { useTabsStore } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { useFileTreeStore } from '@/features/file-tree/stores/fileTreeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { notify, useUiStore } from '@/stores/uiStore';
import {
  openFileDialog,
  openFolderDialog,
  saveFileDialog,
  readFile,
  writeFile,
  documentName,
} from '@/features/file-tree/api/fileSystem';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function suggestedFileName(name: string): string {
  return /\.(md|markdown|mdx)$/i.test(name) ? name : `${name}.md`;
}

export function newDocument(): void {
  useTabsStore.getState().createTab(null, '', 'Untitled');
}

export async function openFile(): Promise<void> {
  const result = await openFileDialog();

  if (!result) return;

  showDocument(result.path, result.content);
}

/** Opens a document by path in a tab and adds it to Recent files. Says why when it can't; returns whether it opened. */
export async function openPath(path: string): Promise<boolean> {
  try {
    showDocument(path, await readFile(path));

    return true;
  } catch (error) {
    notify({ tone: 'error', title: `Couldn't open ${documentName(path)}`, detail: errorMessage(error) });

    return false;
  }
}

function showDocument(path: string, content: string): void {
  useTabsStore.getState().openDocument(path, content);
  useSettingsStore.getState().addRecentFile({ path, name: documentName(path) });
}

export async function openFolder(): Promise<void> {
  const path = await openFolderDialog();

  if (!path) return;
  showFolder(path);
}

/** Shows a just-opened folder in the sidebar. Used by Open Folder and by restoring the last session. */
export function showFolder(name: string): void {
  // rootPath is the folder's name: drop the old tree so a folder with the same name is read too,
  // and so a failed read doesn't change nodesRoot under the FileTree effect and read the folder again
  useFileTreeStore.getState().clearTree();
  const app = useAppStore.getState();
  app.setRootPath(name);
  app.showSidebarView('files');
}

/**
 * Saves one tab. Writes in place when the tab has a file, otherwise asks where to save.
 * Returns false when the user cancelled or the save failed (the user is told why).
 */
export async function saveTab(
  tabId: string,
  options: { saveAs?: boolean; /** Auto-save: no success message, never opens a dialog */ quiet?: boolean } = {}
): Promise<boolean> {
  const tabs = useTabsStore.getState();
  const tab = tabs.tabs.find((t) => t.id === tabId);

  if (!tab) return false;

  if (tab.path && !options.saveAs) {
    try {
      await writeFile(tab.path, tab.content);
      // The user may have kept typing during the write: only what was written counts as saved
      tabs.markTabSaved(tabId, tab.content);

      if (!options.quiet) notify({ tone: 'success', title: `Saved ${tab.name}` });

      return true;
    } catch (error) {
      notify({
        tone: 'error',
        title: `Couldn't save ${tab.name}`,
        detail: options.quiet
          ? `${errorMessage(error)}. Auto-save will try again after your next change.`
          : `${errorMessage(error)}. Choose a location to save a copy instead.`,
      });

      if (options.quiet) return false;
      // Fall through to "save as" so the work is not stranded
    }
  }

  if (options.quiet) return false;

  try {
    const newPath = await saveFileDialog(tab.content, suggestedFileName(tab.name));

    if (!newPath) return false;
    tabs.setTabPath(tabId, newPath);
    tabs.markTabSaved(tabId, tab.content);
    notify({ tone: 'success', title: `Saved ${documentName(newPath)}` });

    return true;
  } catch (error) {
    notify({
      tone: 'error',
      title: `Couldn't save ${tab.name}`,
      detail: `${errorMessage(error)}. Your changes are still open here; try saving to another folder.`,
    });

    return false;
  }
}

export function saveActiveTab(options?: { saveAs?: boolean }): Promise<boolean> {
  const { activeTabId } = useTabsStore.getState();

  return activeTabId ? saveTab(activeTabId, options) : Promise.resolve(false);
}

/** Closes tabs, asking first when any of them has unsaved changes. */
export function requestCloseTabs(tabIds: string[]): void {
  const { tabs, closeTabs } = useTabsStore.getState();
  const hasUnsaved = tabs.some((t) => tabIds.includes(t.id) && t.isDirty);

  if (hasUnsaved) {
    useUiStore.getState().setPendingClose(tabIds);
  } else {
    closeTabs(tabIds);
  }
}

export function hasUnsavedTabs(): boolean {
  return useTabsStore.getState().tabs.some((t) => t.isDirty);
}
