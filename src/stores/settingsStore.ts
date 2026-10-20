import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Theme = 'light';

export interface RecentFile {
  path: string;
  name: string;
  accessedAt: number;
}

export interface LastSession {
  /** Name of the folder that was open (its handle lives in IndexedDB) */
  rootName: string | null;
  /** Paths of the documents that were open, in tab order */
  paths: string[];
  activePath: string | null;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
}

interface SettingsState {
  // Theme
  theme: Theme;

  // Editor settings
  editor: EditorSettings;

  // Auto-save
  autoSave: boolean;
  autoSaveInterval: number; // seconds

  // Sync scroll
  syncScroll: boolean;

  // Share of the split view given to the source pane, in percent
  splitRatio: number;

  // What was open last time, so it can be offered again on launch
  lastSession: LastSession | null;

  // Features
  enabledFeatures: Record<string, boolean>;
  featureSettings: Record<string, Record<string, unknown>>;

  // Recent files
  recentFiles: RecentFile[];
  maxRecentFiles: number;

  // Panels
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // Actions
  setTheme: (theme: Theme) => void;
  setEditorSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
  setAutoSave: (enabled: boolean, interval?: number) => void;
  setSyncScroll: (enabled: boolean) => void;
  setSplitRatio: (ratio: number) => void;
  setLastSession: (session: LastSession | null) => void;

  // Feature settings
  toggleFeature: (featureId: string, enabled: boolean) => void;
  setFeatureSetting: (featureId: string, key: string, value: unknown) => void;
  getFeatureSetting: <T = unknown>(featureId: string, key: string) => T | undefined;

  // Recent files
  addRecentFile: (file: Omit<RecentFile, 'accessedAt'>) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  setRecentFiles: (files: RecentFile[]) => void;

  // Panels
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
}

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  fontFamily: 'IBM Plex Mono',
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      theme: 'light',
      editor: DEFAULT_EDITOR_SETTINGS,
      autoSave: false,
      autoSaveInterval: 30, // 30 seconds
      syncScroll: true,
      splitRatio: 50,
      lastSession: null,
      enabledFeatures: {},
      featureSettings: {},
      recentFiles: [],
      maxRecentFiles: 10,
      leftPanelOpen: true,
      rightPanelOpen: false,
      leftPanelWidth: 280,
      rightPanelWidth: 280,

      // Theme
      setTheme: (theme) =>
        set((state) => {
          state.theme = theme;
        }),

      // Editor settings
      setEditorSetting: (key, value) =>
        set((state) => {
          state.editor[key] = value;
        }),

      // Auto-save
      setAutoSave: (enabled, interval) =>
        set((state) => {
          state.autoSave = enabled;
          if (interval !== undefined) {
            state.autoSaveInterval = interval;
          }
        }),

      // Sync scroll
      setSyncScroll: (enabled) =>
        set((state) => {
          state.syncScroll = enabled;
        }),

      setSplitRatio: (ratio) =>
        set((state) => {
          state.splitRatio = Math.max(25, Math.min(75, ratio));
        }),

      setLastSession: (session) =>
        set((state) => {
          state.lastSession = session;
        }),

      // Feature settings
      toggleFeature: (featureId, enabled) =>
        set((state) => {
          state.enabledFeatures[featureId] = enabled;
        }),

      setFeatureSetting: (featureId, key, value) =>
        set((state) => {
          if (!state.featureSettings[featureId]) {
            state.featureSettings[featureId] = {};
          }
          state.featureSettings[featureId][key] = value;
        }),

      getFeatureSetting: <T = unknown>(featureId: string, key: string): T | undefined => {
        const state = get();
        return state.featureSettings[featureId]?.[key] as T | undefined;
      },

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
          if (state.recentFiles.length > state.maxRecentFiles) {
            state.recentFiles = state.recentFiles.slice(0, state.maxRecentFiles);
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

      setRecentFiles: (files) =>
        set((state) => {
          state.recentFiles = files;
        }),

      // Panels
      setLeftPanelOpen: (open) =>
        set((state) => {
          state.leftPanelOpen = open;
        }),

      setRightPanelOpen: (open) =>
        set((state) => {
          state.rightPanelOpen = open;
        }),

      setLeftPanelWidth: (width) =>
        set((state) => {
          state.leftPanelWidth = Math.max(200, Math.min(500, width));
        }),

      setRightPanelWidth: (width) =>
        set((state) => {
          state.rightPanelWidth = Math.max(200, Math.min(500, width));
        }),
    })),
    {
      name: 'markloom-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        editor: state.editor,
        autoSave: state.autoSave,
        autoSaveInterval: state.autoSaveInterval,
        syncScroll: state.syncScroll,
        splitRatio: state.splitRatio,
        lastSession: state.lastSession,
        enabledFeatures: state.enabledFeatures,
        featureSettings: state.featureSettings,
        recentFiles: state.recentFiles,
        maxRecentFiles: state.maxRecentFiles,
        leftPanelWidth: state.leftPanelWidth,
        rightPanelWidth: state.rightPanelWidth,
      }),
    }
  )
);

// Helper to get resolved theme (always light)
export function getResolvedTheme(_theme: Theme): 'light' {
  return 'light';
}
