// Auto-save runs outside React: re-renders elsewhere in the app can't cancel its timer.
// Each edited document that already has a file is written after the user pauses.
import { create } from 'zustand';
import { useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { saveTab } from '@/lib/documentActions';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export const useAutoSaveStatus = create<{ status: AutoSaveStatus; lastSaved: Date | null }>(() => ({
  status: 'idle',
  lastSaved: null,
}));

const timers = new Map<string, number>();
let started = false;

async function flush(tabId: string) {
  timers.delete(tabId);
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab?.path || !tab.isDirty || !useSettingsStore.getState().autoSave) return;

  useAutoSaveStatus.setState({ status: 'saving' });
  const ok = await saveTab(tabId, { quiet: true });
  useAutoSaveStatus.setState(ok ? { status: 'saved', lastSaved: new Date() } : { status: 'error' });
}

function schedule() {
  const { autoSave, autoSaveInterval } = useSettingsStore.getState();
  const { tabs } = useTabsStore.getState();

  for (const tab of tabs) {
    const existing = timers.get(tab.id);
    if (existing) window.clearTimeout(existing);
    timers.delete(tab.id);
    if (!autoSave || !tab.path || !tab.isDirty) continue;
    timers.set(tab.id, window.setTimeout(() => void flush(tab.id), autoSaveInterval * 1000));
  }

  if (timers.size > 0) useAutoSaveStatus.setState({ status: 'pending' });
}

/** Start once at app launch. */
export function startAutoSave(): void {
  if (started) return;
  started = true;
  // Immer gives a changed tab a new object, so this fires only on real document changes
  useTabsStore.subscribe((state, prev) => {
    if (state.tabs !== prev.tabs) schedule();
  });
  useSettingsStore.subscribe((state, prev) => {
    if (state.autoSave !== prev.autoSave || state.autoSaveInterval !== prev.autoSaveInterval) schedule();
  });
}
