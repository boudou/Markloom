import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface RecentFile {
  path: string;
  name: string;
  accessedAt: number;
}

/** A folder opened before; its directory handle lives in IndexedDB under `key` */
export interface RecentFolder {
  key: string;
  name: string;
  openedAt: number;
}

export interface LastSession {
  /** Name of the folder that was open (its handle lives in IndexedDB) */
  rootName: string | null;
  /** Paths of the documents that were open, in tab order */
  paths: string[];
  activePath: string | null;
}

export interface EditorSettings {
  wordWrap: boolean;
  lineNumbers: boolean;
}

/** How wide the rich-text page and the Markdown preview may grow */
export type PageWidth = 'readable' | 'wide' | 'full';

/** Cycle order of the toolbar button and order of the palette commands */
export const PAGE_WIDTHS: readonly { value: PageWidth; label: string }[] = [
  { value: 'readable', label: 'Readable' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
];

/** Auto-save delays offered in Settings, in seconds */
export const AUTO_SAVE_INTERVALS: readonly number[] = [10, 30, 60, 300];

/** "10 seconds", "1 minute", "5 minutes": whole minutes read as minutes */
export function formatInterval(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;

    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }

  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

interface SettingsState {
  // Editor settings
  editor: EditorSettings;

  // Auto-save
  autoSave: boolean;
  autoSaveInterval: number; // seconds

  // Sync scroll
  syncScroll: boolean;

  // Share of the split view given to the source pane, in percent
  splitRatio: number;

  // Width of the rich-text page and the preview column
  pageWidth: PageWidth;

  // What was open last time, so it can be offered again on launch
  lastSession: LastSession | null;

  // Recent files
  recentFiles: RecentFile[];

  // Recent folders, newest first
  recentFolders: RecentFolder[];

  /** Word-count goals, keyed by document path (or tab id for unsaved documents) */
  wordGoals: Record<string, number>;

  // Actions
  setAutoSave: (enabled: boolean, interval?: number) => void;
  setAutoSaveInterval: (seconds: number) => void;
  setWordWrap: (on: boolean) => void;
  setLineNumbers: (on: boolean) => void;
  setSyncScroll: (enabled: boolean) => void;
  setSplitRatio: (ratio: number) => void;
  setPageWidth: (width: PageWidth) => void;
  setLastSession: (session: LastSession | null) => void;

  // Recent files
  addRecentFile: (file: Omit<RecentFile, 'accessedAt'>) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  addRecentFolder: (folder: Omit<RecentFolder, 'openedAt'>) => void;
  removeRecentFolder: (key: string) => void;
  setWordGoal: (key: string, goal: number | null) => void;
  /** Re-keys a goal, e.g. from an unsaved tab's id to the path it was first saved to */
  moveWordGoal: (fromKey: string, toKey: string) => void;
}

type PersistedSettings = Pick<
  SettingsState,
  'editor' | 'autoSave' | 'autoSaveInterval' | 'syncScroll' | 'splitRatio' | 'pageWidth' | 'lastSession' | 'recentFiles' | 'recentFolders' | 'wordGoals'
>;

type KeptTopLevelSettings = Partial<Omit<PersistedSettings, 'editor'>>;

/** What an older save may hold of today's settings; its other keys are dropped on load. */
type SavedSettings = KeptTopLevelSettings & { editor?: Partial<EditorSettings> };

const MAX_RECENT_FILES = 10;

export const MAX_RECENT_FOLDERS = 8;

const SETTINGS_VERSION = 1;

/** Source pane share in percent: the store clamp, the split handle and its double-click reset read this */
export const SPLIT_RATIO = { min: 25, max: 75, defaultValue: 50 } as const;

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  wordWrap: true,
  lineNumbers: true,
};

const KEPT_TOP_LEVEL_KEYS = [
  'autoSave',
  'autoSaveInterval',
  'syncScroll',
  'splitRatio',
  'pageWidth',
  'lastSession',
  'recentFiles',
  'recentFolders',
  'wordGoals',
] as const;

function copyIfPresent<K extends (typeof KEPT_TOP_LEVEL_KEYS)[number]>(
  from: KeptTopLevelSettings,
  to: KeptTopLevelSettings,
  key: K
): void {
  const value = from[key];

  if (value !== undefined) to[key] = value;
}

/**
 * Version 0 also stored theme, feature, panel and recent-file-limit settings and more editor fields,
 * none of which are read any more. The default merge is shallow, so a missing key stays omitted
 * (setting it to undefined would overwrite the default) and `editor` is rebuilt whole.
 */
function migrateSettings(saved: SavedSettings): Partial<PersistedSettings> {
  const kept: Partial<PersistedSettings> = {};

  for (const key of KEPT_TOP_LEVEL_KEYS) copyIfPresent(saved, kept, key);

  if (saved.editor) {
    kept.editor = {
      wordWrap: saved.editor.wordWrap ?? DEFAULT_EDITOR_SETTINGS.wordWrap,
      lineNumbers: saved.editor.lineNumbers ?? DEFAULT_EDITOR_SETTINGS.lineNumbers,
    };
  }

  return kept;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      // Initial state
      editor: DEFAULT_EDITOR_SETTINGS,
      autoSave: false,
      autoSaveInterval: 30, // 30 seconds
      syncScroll: true,
      splitRatio: SPLIT_RATIO.defaultValue,
      pageWidth: 'readable',
      lastSession: null,
      recentFiles: [],
      recentFolders: [],
      wordGoals: {},

      // Word-count goals; null or 0 removes the goal
      setWordGoal: (key, goal) =>
        set((state) => {
          if (goal && goal > 0) state.wordGoals[key] = Math.round(goal);
          else delete state.wordGoals[key];
        }),

      // A tab without a goal leaves any goal already stored for the target alone
      moveWordGoal: (fromKey, toKey) =>
        set((state) => {
          const goal = state.wordGoals[fromKey];

          if (goal === undefined || fromKey === toKey) return;
          state.wordGoals[toKey] = goal;
          delete state.wordGoals[fromKey];
        }),

      // Auto-save
      setAutoSave: (enabled, interval) =>
        set((state) => {
          state.autoSave = enabled;

          if (interval !== undefined) {
            state.autoSaveInterval = interval;
          }
        }),

      setAutoSaveInterval: (seconds) =>
        set((state) => {
          state.autoSaveInterval = seconds;
        }),

      // Markdown editor
      setWordWrap: (on) =>
        set((state) => {
          state.editor.wordWrap = on;
        }),

      setLineNumbers: (on) =>
        set((state) => {
          state.editor.lineNumbers = on;
        }),

      // Sync scroll
      setSyncScroll: (enabled) =>
        set((state) => {
          state.syncScroll = enabled;
        }),

      setSplitRatio: (ratio) =>
        set((state) => {
          state.splitRatio = Math.max(SPLIT_RATIO.min, Math.min(SPLIT_RATIO.max, ratio));
        }),

      setPageWidth: (width) =>
        set((state) => {
          state.pageWidth = width;
        }),

      setLastSession: (session) =>
        set((state) => {
          state.lastSession = session;
        }),

      // Recent files
      addRecentFile: (file) =>
        set((state) => {
          // Remove if already exists
          state.recentFiles = state.recentFiles.filter((f) => f.path !== file.path);

          // Add to front
          state.recentFiles.unshift({
            ...file,
            accessedAt: Date.now(),
          });

          // Trim to max
          if (state.recentFiles.length > MAX_RECENT_FILES) {
            state.recentFiles = state.recentFiles.slice(0, MAX_RECENT_FILES);
          }
        }),

      removeRecentFile: (path) =>
        set((state) => {
          state.recentFiles = state.recentFiles.filter((f) => f.path !== path);
        }),

      clearRecentFiles: () =>
        set((state) => {
          state.recentFiles = [];
        }),

      // Recent folders: keyed by handle id, so two folders with the same name stay apart
      addRecentFolder: (folder) =>
        set((state) => {
          state.recentFolders = state.recentFolders.filter((f) => f.key !== folder.key);
          state.recentFolders.unshift({ ...folder, openedAt: Date.now() });

          if (state.recentFolders.length > MAX_RECENT_FOLDERS) {
            state.recentFolders = state.recentFolders.slice(0, MAX_RECENT_FOLDERS);
          }
        }),

      removeRecentFolder: (key) =>
        set((state) => {
          state.recentFolders = state.recentFolders.filter((f) => f.key !== key);
        }),
    })),
    {
      name: 'markloom-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedSettings => ({
        editor: state.editor,
        autoSave: state.autoSave,
        autoSaveInterval: state.autoSaveInterval,
        syncScroll: state.syncScroll,
        splitRatio: state.splitRatio,
        pageWidth: state.pageWidth,
        lastSession: state.lastSession,
        recentFiles: state.recentFiles,
        recentFolders: state.recentFolders,
        wordGoals: state.wordGoals,
      }),
      // Only saves from an older version reach here.
      // SAFETY: this app wrote the save with JSON.stringify, so a present key has the type it was written with.
      migrate: (saved) => migrateSettings(saved as SavedSettings),
    }
  )
);
