// Auto-save runs outside React: re-renders elsewhere in the app can't cancel its timer.
// Each edited document that already has a file is written after the user pauses, on its own timer.
import { create } from 'zustand';
import { useTabsStore, selectTab, type Tab } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { saveTab } from '@/lib/documentActions';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Result of the most recent write, with the tab it belongs to */
type LastResult = { tabId: string; result: 'saved'; at: Date } | { tabId: string; result: 'error' };

/** Facts about the scheduler; the status shown for a tab is derived from them by `autoSaveStatus`. */
interface AutoSaveState {
  /** Tabs with a timer waiting to write them */
  pending: ReadonlySet<string>;
  /** Tabs being written now */
  saving: ReadonlySet<string>;
  /** Result of the most recent write */
  last: LastResult | null;
}

export const useAutoSaveStatus = create<AutoSaveState>(() => ({
  pending: new Set(),
  saving: new Set(),
  last: null,
}));

/** What auto-save is doing for this tab; other tabs' timers, writes and results don't show. */
export function autoSaveStatus({ pending, saving, last }: AutoSaveState, tabId: string): AutoSaveStatus {
  if (saving.has(tabId)) return 'saving';

  if (pending.has(tabId)) return 'pending';

  return last?.tabId === tabId ? last.result : 'idle';
}

const timers = new Map<string, number>();

// Tabs being written now: a second write to the same file could finish first and leave older text
const saving = new Set<string>();

let started = false;

/** Writes the pending and saving tabs, and any other fields given, in one update. */
function publish(fields: Partial<AutoSaveState> = {}) {
  useAutoSaveStatus.setState({ ...fields, pending: new Set(timers.keys()), saving: new Set(saving) });
}

/**
 * The tab `last` reports on was closed, or saved or reloaded by another path (e.g. Ctrl+S).
 * Auto-save's own write is still in `saving` when its markTabSaved lands, so it doesn't count.
 */
function lastOutdated(tabs: Tab[], prevTabs: Tab[]): boolean {
  const lastTabId = useAutoSaveStatus.getState().last?.tabId;

  if (!lastTabId || saving.has(lastTabId)) return false;

  const now = tabs.find((t) => t.id === lastTabId);
  const before = prevTabs.find((t) => t.id === lastTabId);

  return !now || now.originalContent !== before?.originalContent;
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
  const tab = selectTab(useTabsStore.getState(), tabId);

  // While a write is in flight, skip: when it ends, markTabSaved changes the tab and re-arms it if still dirty
  if (!tab?.path || !tab.isDirty || !useSettingsStore.getState().autoSave || saving.has(tabId)) {
    publish();

    return;
  }

  saving.add(tabId);
  publish();
  const ok = await saveTab(tabId, { quiet: true });
  saving.delete(tabId);
  publish({ last: ok ? { tabId, result: 'saved', at: new Date() } : { tabId, result: 'error' } });
}

function rearmAll(fields: Partial<AutoSaveState>) {
  for (const tab of useTabsStore.getState().tabs) arm(tab);
  publish(fields);
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

  // A tab is re-armed when its object changes (saved, renamed, dirty flip) or its text changes, so the
  // timer waits for a pause in typing. Only that tab's object and text change, so other timers are left alone.
  useTabsStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs && state.contents === prev.contents) return;

    const previous = new Map(prev.tabs.map((t) => [t.id, t]));

    for (const tab of state.tabs) {
      if (previous.get(tab.id) !== tab || state.contents[tab.id] !== prev.contents[tab.id]) arm(tab);
      previous.delete(tab.id);
    }

    // What is left was closed
    for (const tabId of previous.keys()) clearTimer(tabId);

    // Drop the last result, so the indicator stops reporting a save that no longer describes the file
    publish(lastOutdated(state.tabs, prev.tabs) ? { last: null } : {});
  });

  useSettingsStore.subscribe((state, prev) => {
    if (state.autoSave === prev.autoSave && state.autoSaveInterval === prev.autoSaveInterval) return;

    // Turning auto-save off forgets the last result, so turning it on again starts at "Auto-save on"
    rearmAll(state.autoSave ? {} : { last: null });
  });
}
