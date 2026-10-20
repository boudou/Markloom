// Document-level actions shared by the title bar, keyboard shortcuts and empty states.
import { useTabsStore } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { notify, useUiStore } from '@/stores/uiStore';
import {
  openFileDialog,
  openFolderDialog,
  saveFileDialog,
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
  useTabsStore.getState().openDocument(result.path, result.content);
  const name = result.path.split(/[/\\]/).pop() || result.path;
  useSettingsStore.getState().addRecentFile({ path: result.path, name });
}

export async function openFolder(): Promise<void> {
  const path = await openFolderDialog();
  if (!path) return;
  const app = useAppStore.getState();
  app.setRootPath(path);
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
