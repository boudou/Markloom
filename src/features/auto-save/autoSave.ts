// Auto-save runs outside React: re-renders elsewhere in the app can't cancel its timer.
// Each edited document that already has a file is written after the user pauses, on its own timer.
import { create } from 'zustand';
import { useTabsStore, type Tab } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { saveTab } from '@/lib/documentActions';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Facts about the scheduler; the status shown to the user is derived from them by `autoSaveStatus`. */
interface AutoSaveState {
  /** A timer is waiting to write some tab */
  pending: boolean;
  /** A write is in flight for some tab */
  saving: boolean;
  /** Result of the most recent write */
  last: 'saved' | 'error' | null;
  lastSaved: Date | null;
}

export const useAutoSaveStatus = create<AutoSaveState>(() => ({
  pending: false,
  saving: false,
  last: null,
  lastSaved: null,
}));

export function autoSaveStatus({ pending, saving, last }: AutoSaveState): AutoSaveStatus {
  if (saving) return 'saving';

  if (pending) return 'pending';

  return last ?? 'idle';
}

const timers = new Map<string, number>();

// Tabs being written now: a second write to the same file could finish first and leave older text
const saving = new Set<string>();

let started = false;

function publish() {
  useAutoSaveStatus.setState({ pending: timers.size > 0, saving: saving.size > 0 });
}

function clearTimer(tabId: string) {
  window.clearTimeout(timers.get(tabId));
  timers.delete(tabId);
}

/** Restarts this tab's timer if it has unsaved changes to a file; otherwise stops it. */
function arm(tab: Tab) {
  clearTimer(tab.id);
  const { autoSave, autoSaveInterval } = useSettingsStore.getState();

  if (autoSave && tab.path && tab.isDirty) {
    timers.set(tab.id, window.setTimeout(() => void flush(tab.id), autoSaveInterval * 1000));
  }
}

async function flush(tabId: string) {
  timers.delete(tabId);
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);

  // While a write is in flight, skip: when it ends, markTabSaved changes the tab and re-arms it if still dirty
  if (!tab?.path || !tab.isDirty || !useSettingsStore.getState().autoSave || saving.has(tabId)) {
    publish();

    return;
  }

  saving.add(tabId);
  publish();
  const ok = await saveTab(tabId, { quiet: true });
  saving.delete(tabId);
  useAutoSaveStatus.setState(ok ? { last: 'saved', lastSaved: new Date() } : { last: 'error' });
  publish();
}

function rearmAll() {
  for (const tab of useTabsStore.getState().tabs) arm(tab);
  publish();
}

/** Turns auto-save on or off; the choice is remembered. */
export function toggleAutoSave(): void {
  const { autoSave, setAutoSave } = useSettingsStore.getState();
  setAutoSave(!autoSave);
}

/** Start once at app launch. */
export function startAutoSave(): void {
  if (started) return;
  started = true;

  // Immer gives only a changed tab a new object, so typing in one tab leaves the other timers alone
  useTabsStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;

    const previous = new Map(prev.tabs.map((t) => [t.id, t]));

    for (const tab of state.tabs) {
      if (previous.get(tab.id) !== tab) arm(tab);
      previous.delete(tab.id);
    }

    // What is left was closed
    for (const tabId of previous.keys()) clearTimer(tabId);
    publish();
  });

  useSettingsStore.subscribe((state, prev) => {
    if (state.autoSave !== prev.autoSave || state.autoSaveInterval !== prev.autoSaveInterval) rearmAll();
  });
}
