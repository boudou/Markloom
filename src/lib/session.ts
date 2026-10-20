// Remembers what was open (folder + documents) and offers it back on the next launch.
import { create } from 'zustand';
import { useTabsStore } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore, type LastSession } from '@/stores/settingsStore';
import { notify } from '@/stores/uiStore';
import { readFile, restoreRememberedFolder } from '@/features/file-tree/api/fileSystem';
import { ROOT_KEY, recallHandle } from '@/features/file-tree/api/handleStore';

interface SessionState {
  /** Last session that can still be reopened, or null once handled */
  offer: LastSession | null;
  restoring: boolean;
}

export const useSessionStore = create<SessionState>()(() => ({ offer: null, restoring: false }));

// Until the previous session is restored or replaced, don't overwrite it with an empty one
let tracking = false;

function currentSession(): LastSession {
  const { tabs, activeTabId } = useTabsStore.getState();
  const paths = tabs.map((t) => t.path).filter((p): p is string => !!p);
  return {
    rootName: useAppStore.getState().rootPath,
    paths,
    activePath: tabs.find((t) => t.id === activeTabId)?.path ?? null,
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
      // Typing changes tabs too; only rewrite settings when what's open actually changed
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
  useTabsStore.subscribe(save);
  useAppStore.subscribe((state, prev) => {
    if (state.rootPath !== prev.rootPath) save();
  });
}

async function hasGrantedAccess(): Promise<boolean> {
  const root = await recallHandle<FileSystemDirectoryHandle>(ROOT_KEY);
  const query = (root as unknown as { queryPermission?: (d: { mode: string }) => Promise<string> } | null)
    ?.queryPermission;
  return !!root && !!query && (await query.call(root, { mode: 'readwrite' })) === 'granted';
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
      if (name) {
        const app = useAppStore.getState();
        app.setRootPath(name);
        app.showSidebarView('files');
      }
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

    const active = useTabsStore.getState().tabs.find((t) => t.path === session.activePath);
    if (active) useTabsStore.getState().setActiveTab(active.id);

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
  const last = useSettingsStore.getState().lastSession;
  if (isEmpty(last)) {
    tracking = true;
    return;
  }
  useSessionStore.setState({ offer: last });

  // Access still granted (e.g. the browser remembers it): reopen without asking
  if (await hasGrantedAccess()) await restoreLastSession();
}
