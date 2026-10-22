// Document-level actions shared by the title bar, keyboard shortcuts and empty states.
import { useTabsStore, selectTab, selectTabContent } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { useFileTreeStore } from '@/features/file-tree/stores/fileTreeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { flushEditorEdits, notify, useUiStore } from '@/stores/uiStore';
import {
  openFileDialog,
  openFolderDialog,
  openRecentFolder,
  saveFileDialog,
  readFile,
  writeFile,
  documentName,
} from '@/features/file-tree/api/fileSystem';
import { forgetHandle } from '@/features/file-tree/api/handleStore';
import { errorMessage } from '@/lib/utils';

function suggestedFileName(name: string): string {
  return /\.(md|markdown|mdx)$/i.test(name) ? name : `${name}.md`;
}

export function newDocument(): void {
  useTabsStore.getState().createTab(null, '');
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
  const recentKeys = useSettingsStore.getState().recentFolders.map((f) => f.key);
  const folder = await openFolderDialog(recentKeys);

  if (!folder) return;
  showFolder(folder.name);
  addRecentFolder(folder.key, folder.name);
}

/** Puts a folder at the top of Recent folders and forgets the handles of folders that fell off the list */
function addRecentFolder(key: string, name: string): void {
  const settings = useSettingsStore.getState();
  const before = settings.recentFolders;

  settings.addRecentFolder({ key, name });
  const kept = new Set(useSettingsStore.getState().recentFolders.map((f) => f.key));

  for (const folder of before) {
    if (!kept.has(folder.key)) void forgetHandle(folder.key);
  }
}

/**
 * Reopens a folder from Recent folders. Call it straight from a click (no await before it):
 * the browser may need to ask for access again.
 */
export async function reopenFolder(key: string): Promise<void> {
  const result = await openRecentFolder(key);

  if (result.status === 'opened') {
    showFolder(result.name);
    addRecentFolder(key, result.name);

    return;
  }

  const name = useSettingsStore.getState().recentFolders.find((f) => f.key === key)?.name ?? 'The folder';

  if (result.status === 'missing') {
    useSettingsStore.getState().removeRecentFolder(key);
    void forgetHandle(key);
    notify({ tone: 'info', title: `${name} is no longer available` });

    return;
  }

  notify({ tone: 'info', title: `Access to ${name} wasn't granted` });
}

/** Shows a just-opened folder in the sidebar. Used by Open Folder and by restoring the last session. */
export function showFolder(name: string): void {
  // rootPath is only the folder's name: the new rootId makes even a folder with the same name a new one,
  // which the FileTree reads, dropping whatever reads of the previous folder still return
  useFileTreeStore.getState().openRoot();
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
  // First: `tabs` below is a snapshot, so a later write would not be in what we save
  flushEditorEdits();
  const tabs = useTabsStore.getState();
  const tab = selectTab(tabs, tabId);
  // Read once, before any await: text typed during the write must stay unsaved
  const content = selectTabContent(tabs, tabId);

  if (!tab) return false;

  if (tab.path && !options.saveAs) {
    try {
      await writeFile(tab.path, content);
      // The user may have kept typing during the write: only what was written counts as saved
      tabs.markTabSaved(tabId, content);

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
    const newPath = await saveFileDialog(content, suggestedFileName(tab.name));

    if (!newPath) return false;
    tabs.setTabPath(tabId, newPath);
    tabs.markTabSaved(tabId, content);

    // Goals are keyed by path once a document has one (see WordCountWidget's useGoalKey)
    if (!tab.path) useSettingsStore.getState().moveWordGoal(tabId, newPath);
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
  flushEditorEdits();
  const { tabs, closeTabs } = useTabsStore.getState();
  const hasUnsaved = tabs.some((t) => tabIds.includes(t.id) && t.isDirty);

  if (hasUnsaved) {
    useUiStore.getState().setPendingClose(tabIds);
  } else {
    closeTabs(tabIds);
  }
}

/** Whether any tab has unsaved changes. An edit the editor still holds counts, so it is written first. */
export function hasUnsavedTabs(): boolean {
  flushEditorEdits();

  return useTabsStore.getState().tabs.some((t) => t.isDirty);
}
