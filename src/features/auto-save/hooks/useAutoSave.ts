import { useAutoSaveStatus, type AutoSaveStatus } from '../autoSave';

export type { AutoSaveStatus };

/** Current auto-save state for the status bar (the scheduler itself runs in autoSave.ts) */
export function useAutoSave() {
  return useAutoSaveStatus();
}
