import { autoSaveStatus, useAutoSaveStatus, type AutoSaveStatus } from '../autoSave';

export type { AutoSaveStatus };

/** Auto-save state of one tab for the status bar (the scheduler itself runs in autoSave.ts) */
export function useAutoSave(tabId: string | null) {
  const status = useAutoSaveStatus((s) => (tabId ? autoSaveStatus(s, tabId) : 'idle'));
  // Only this tab's own successful write has a time
  const lastSaved = useAutoSaveStatus((s) => (s.last?.tabId === tabId && s.last.result === 'saved' ? s.last.at : null));

  return { status, lastSaved };
}
