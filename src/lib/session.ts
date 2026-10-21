// Remembers what was open (folder + documents) and offers it back on the next launch.
import { create } from 'zustand';
import { useTabsStore, selectActiveTab, selectTabContent, type Tab } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore, type LastSession } from '@/stores/settingsStore';
import { notify } from '@/stores/uiStore';
import { showFolder } from '@/lib/documentActions';
import { readFile, restoreRememberedFolder } from '@/features/file-tree/api/fileSystem';
import { ROOT_KEY, hasPermission, recallDirectoryHandle } from '@/features/file-tree/api/handleStore';
import { deleteDrafts, listDrafts, saveDraftsNow, startDraftTracking, type Draft } from '@/lib/drafts';

/** What the start panel offers to reopen: the remembered session plus unsaved Untitled drafts */
export interface SessionOffer extends LastSession {
  drafts: Draft[];
}

interface SessionState {
  /** Last session that can still be reopened, or null once handled */
  offer: SessionOffer | null;
  restoring: boolean;
}

export const useSessionStore = create<SessionState>()(() => ({ offer: null, restoring: false }));

// Until the previous session is restored or replaced, don't overwrite it with an empty one
let tracking = false;

function currentSession(): LastSession {
  const state = useTabsStore.getState();
  const paths = state.tabs.map((t) => t.path).filter((p): p is string => !!p);

  return {
    rootName: useAppStore.getState().rootPath,
    paths,
    activePath: selectActiveTab(state)?.path ?? null,
  };
}

function isEmpty(session: LastSession | null): boolean {
  return !session || (!session.rootName && session.paths.length === 0);
}

function startTracking() {
  let timer: number | undefined;
  let lastWritten = JSON.stringify(useSettingsStore.getState().lastSession);

  const save = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const session = currentSession();
      // A rename or a dirty flip changes tabs too; only rewrite settings when what's open actually changed
      const serialized = JSON.stringify(session);

      if (tracking && serialized === lastWritten) return;

      if (!tracking) {
        if (isEmpty(session)) return;
        // The user started something new: that becomes the session to remember
        tracking = true;
        useSessionStore.setState({ offer: null });
      }

      lastWritten = serialized;
      useSettingsStore.getState().setLastSession(session);
    }, 400);
  };

  // Typing changes only `contents`, so it never reaches save
  useTabsStore.subscribe((state, prev) => {
    if (state.tabs !== prev.tabs || state.activeTabId !== prev.activeTabId) save();
  });
  useAppStore.subscribe((state, prev) => {
    if (state.rootPath !== prev.rootPath) save();
  });
}

async function hasGrantedAccess(): Promise<boolean> {
  const root = await recallDirectoryHandle(ROOT_KEY);

  return !!root && (await hasPermission(root));
}

/** An Untitled tab nobody has written in, like the one the app starts with */
function isBlankUntitled(tab: Tab, content: string): boolean {
  return !tab.path && !tab.isDirty && content === '';
}

/** Opens each draft as a dirty Untitled tab and returns the new tab ids */
function reopenDrafts(drafts: Draft[]): string[] {
  const tabs = useTabsStore.getState();

  return drafts.map((draft) => {
    // Created empty, then filled, so the tab is dirty: closing it asks, and it is drafted again
    tabs.createTab(null, '', draft.name);
    // createTab without a path always appends the new tab
    const { tabs: open } = useTabsStore.getState();
    const id = open[open.length - 1].id;

    tabs.updateTabContent(id, draft.content);
    useSettingsStore.getState().moveWordGoal(draft.id, id);

    return id;
  });
}

/** Reopens the last session. Call from a click: the browser may need to ask for access. */
export async function restoreLastSession(): Promise<void> {
  const session = useSessionStore.getState().offer;

  if (!session) return;
  useSessionStore.setState({ restoring: true });

  try {
    let folderOk = true;

    if (session.rootName) {
      const name = await restoreRememberedFolder();
      folderOk = !!name;

      if (name) showFolder(name);
    }

    const tabs = useTabsStore.getState();
    let reopened = 0;

    for (const path of session.paths) {
      try {
        tabs.openDocument(path, await readFile(path));
        reopened++;
      } catch {
        // Moved, deleted, or access declined: skip it and say so below
      }
    }

    // No awaits from here to the close, so the user cannot type into the blank tab in between
    const state = useTabsStore.getState();
    const startTab = selectActiveTab(state);
    const blank = startTab && isBlankUntitled(startTab, selectTabContent(state, startTab.id)) ? startTab : undefined;
    const restoredIds = reopenDrafts(session.drafts);

    // The empty tab the app starts with would sit in front of the restored drafts
    if (blank && restoredIds.length > 0) tabs.closeTabs([blank.id]);

    const active = useTabsStore.getState().tabs.find((t) => t.path === session.activePath);
    const activeId = active?.id ?? restoredIds[0];

    if (activeId) tabs.setActiveTab(activeId);

    if (restoredIds.length > 0) {
      // Store the restored tabs under their new ids before dropping the old records
      await saveDraftsNow();
      await deleteDrafts(session.drafts.map((d) => d.id));
    }

    const missed = session.paths.length - reopened;

    if (!folderOk || missed > 0) {
      notify({
        tone: 'info',
        title: 'Some items could not be reopened',
        detail: [
          !folderOk && `Folder “${session.rootName}” needs to be opened again.`,
          missed > 0 && `${missed} document${missed === 1 ? '' : 's'} could not be found or accessed.`,
        ]
          .filter(Boolean)
          .join(' '),
      });
    }
  } finally {
    tracking = true;
    useSessionStore.setState({ offer: null, restoring: false });
    useSettingsStore.getState().setLastSession(currentSession());
  }
}

export function dismissLastSession(): void {
  tracking = true;
  useSessionStore.setState({ offer: null });
}

/** Call once at startup. */
export async function initSession(): Promise<void> {
  startTracking();
  startDraftTracking();
  const last = useSettingsStore.getState().lastSession;
  const stored = await listDrafts();
  const openIds = new Set(useTabsStore.getState().tabs.map((t) => t.id));
  // A draft written by this run before the read finished belongs to a tab that is still open
  const drafts = stored.filter((d) => !openIds.has(d.id));

  if (isEmpty(last) && drafts.length === 0) {
    tracking = true;

    return;
  }

  useSessionStore.setState({ offer: { ...(last ?? { rootName: null, paths: [], activePath: null }), drafts } });

  // Access still granted (e.g. the browser remembers it): reopen without asking
  if (await hasGrantedAccess()) await restoreLastSession();
}
