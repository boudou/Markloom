/// <reference types="vite/client" />

/** The version in package.json, set at build time */
declare const __APP_VERSION__: string;

interface Window {
  /** Present only when running inside the Electron desktop shell. */
  markloomDesktop?: {
    isDesktop: true;
    platform: string;
    takePendingFiles: () => Promise<string[]>;
    onOpenFiles: (callback: (files: string[]) => void) => () => void;
    readFile: (filePath: string) => Promise<{ bytes: Uint8Array; mtimeMs: number }>;
    statFile: (filePath: string) => Promise<{ mtimeMs: number; size: number }>;
    writeFile: (filePath: string, data: string | Uint8Array) => Promise<void>;
    // Inline import() types: a top-level import would turn this global script into a module
    printToPdf: (
      html: string,
      options?: {
        pageSize?: import('./features/export/pipeline/pageGeometry').PageSize;
        landscape?: boolean;
        /** Inches */
        margins?: import('./features/export/pipeline/pageGeometry').Margins;
      }
    ) => Promise<Uint8Array>;
    /** Merges the given toggles into the desktop window preferences and returns those now in effect; `{}` only reads them */
    updateWindowPrefs: (changes: {
      minimizeToTray?: boolean;
      closeToTray?: boolean;
    }) => Promise<{ minimizeToTray: boolean; closeToTray: boolean }>;
  };
}
