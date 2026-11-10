// Notices when another program changes a file that is open in a tab. Every tab is checked when the
// window regains focus or the page shows again, and the active tab every few seconds while the page
// is visible. A tab without unsaved changes is reloaded; one with unsaved changes gets a conflict,
// which DiskChangeDialog asks about. Saving in place checks the file first (diskAllowsSave).
import { create } from 'zustand';
import { useTabsStore, selectTab, selectTabContent } from '@/features/tabs';
import { readFile, readFileVersion } from '@/features/file-tree/api/fileSystem';
import { flushEditorEdits, useUiStore } from '@/stores/uiStore';

export interface DiskConflict {
  tabId: string;
  diskContent: string;
}

/** Conflicts waiting for an answer, oldest first; one per tab (a newer disk text replaces the entry) */
export const useDiskChanges = create<{ conflicts: DiskConflict[] }>(() => ({ conflicts: [] }));

const POLL_INTERVAL_MS = 2000;

// The last version of each file whose text was compared: an unchanged version is not read again
const knownVersions = new Map<string, string>();

// Tabs with a check in flight: a focus and a poll at once must not reload twice
const checking = new Set<string>();

// Tabs being written now, with how many writes: a desktop write truncates first, so a check mid-write reads half a file
const paused = new Map<string, number>();

let started = false;

function raiseConflict(tabId: string, diskContent: string): void {
  const { conflicts } = useDiskChanges.getState();
  const index = conflicts.findIndex((c) => c.tabId === tabId);

  if (index === -1) {
    useDiskChanges.setState({ conflicts: [...conflicts, { tabId, diskContent }] });
  } else {
    useDiskChanges.setState({ conflicts: conflicts.map((c, i) => (i === index ? { tabId, diskContent } : c)) });
  }
}

function takeConflict(tabId: string): DiskConflict | undefined {
  const { conflicts } = useDiskChanges.getState();
  const conflict = conflicts.find((c) => c.tabId === tabId);

  if (conflict) useDiskChanges.setState({ conflicts: conflicts.filter((c) => c.tabId !== tabId) });

  return conflict;
}

/** Whether the keyboard focus is in the editor showing the active document */
function editorHasFocus(): boolean {
  return !!document.activeElement?.closest('.cm-content, [data-doc-surface] .rt-document');
}

/** Loads the disk text into the tab; the editor remounts, so it takes the focus back if it had it */
function reloadTab(tabId: string, path: string, content: string): void {
  const refocus = useTabsStore.getState().activeTabId === tabId && editorHasFocus();

  useTabsStore.getState().loadFileIntoTab(tabId, path, content);

  if (refocus) useUiStore.getState().requestEditorFocus(tabId);
}

async function checkTab(tabId: string): Promise<void> {
  const path = selectTab(useTabsStore.getState(), tabId)?.path;

  if (!path || checking.has(tabId) || paused.has(tabId)) return;

  checking.add(tabId);

  try {
    let version: string;
    let disk: string;

    try {
      version = await readFileVersion(path);

      if (knownVersions.get(path) === version) return;

      disk = await readFile(path);
    } catch {
      // Unreachable now (deleted, moved, no permission): nothing to compare
      return;
    }

    knownVersions.set(path, version);

    // Decide on fresh state: the user may have typed during the reads, and rich text holds edits back
    if (useTabsStore.getState().activeTabId === tabId) flushEditorEdits();

    const state = useTabsStore.getState();
    const tab = selectTab(state, tabId);

    if (!tab || tab.path !== path || paused.has(tabId) || disk === tab.originalContent) return;

    if (disk === selectTabContent(state, tabId)) {
      // The file now holds exactly the open text
      state.markTabSaved(tabId, disk);

      return;
    }

    if (tab.isDirty) {
      raiseConflict(tabId, disk);
    } else {
      reloadTab(tabId, path, disk);
    }
  } finally {
    checking.delete(tabId);
  }
}

function checkAllTabs(): void {
  for (const tab of useTabsStore.getState().tabs) void checkTab(tab.id);
}

/** Start once at app launch. */
export function startDiskChecks(): void {
  if (started) return;
  started = true;

  window.addEventListener('focus', checkAllTabs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAllTabs();
  });

  // A closed tab's conflict has nothing left to ask about
  useTabsStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;

    const { conflicts } = useDiskChanges.getState();
    const open = conflicts.filter((c) => selectTab(state, c.tabId));

    if (open.length !== conflicts.length) useDiskChanges.setState({ conflicts: open });
  });

  window.setInterval(() => {
    const { activeTabId } = useTabsStore.getState();

    if (document.visibilityState === 'visible' && activeTabId) void checkTab(activeTabId);
  }, POLL_INTERVAL_MS);
}

/** Drops the open text and loads the version on disk */
export function reloadFromDisk(tabId: string): void {
  const conflict = takeConflict(tabId);
  const path = selectTab(useTabsStore.getState(), tabId)?.path;

  if (conflict && path) reloadTab(tabId, path, conflict.diskContent);
}

/** Keeps the open text, still unsaved; the next save replaces the file without asking */
export function keepMyVersion(tabId: string): void {
  const conflict = takeConflict(tabId);

  if (conflict && selectTab(useTabsStore.getState(), tabId)) useTabsStore.getState().markTabSaved(tabId, conflict.diskContent);
}

/** Decides nothing: the tab stays as it is and the next save asks again */
export function dismissDiskConflict(tabId: string): void {
  takeConflict(tabId);
}

export function hasDiskConflict(tabId: string): boolean {
  return useDiskChanges.getState().conflicts.some((c) => c.tabId === tabId);
}

/** False (and the conflict raised) when the file's text is neither `expected` nor `content`; true when it can't be read */
export async function diskAllowsSave(tabId: string, path: string, expected: string, content: string): Promise<boolean> {
  let disk: string;

  try {
    disk = await readFile(path);
  } catch {
    // Deleted or moved: saving recreates it, as before
    return true;
  }

  if (disk === expected || disk === content) return true;

  raiseConflict(tabId, disk);

  return false;
}

/** Runs `run` with checks of this tab skipped: a desktop write truncates first, so a check mid-write reads half a file */
export async function pauseDiskChecks<T>(tabId: string, run: () => Promise<T>): Promise<T> {
  paused.set(tabId, (paused.get(tabId) ?? 0) + 1);

  try {
    return await run();
  } finally {
    const count = (paused.get(tabId) ?? 1) - 1;

    if (count > 0) {
      paused.set(tabId, count);
    } else {
      paused.delete(tabId);
    }
  }
}
