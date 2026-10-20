import { autoSaveStatus, useAutoSaveStatus, type AutoSaveStatus } from '../autoSave';

export type { AutoSaveStatus };

/** Current auto-save state for the status bar (the scheduler itself runs in autoSave.ts) */
export function useAutoSave() {
  const status = useAutoSaveStatus(autoSaveStatus);
  const lastSaved = useAutoSaveStatus((s) => s.lastSaved);

  return { status, lastSaved };
}
