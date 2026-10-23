/// <reference types="vite/client" />

/** The version in package.json, set at build time */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Google Analytics measurement ID; set only by the GitHub Pages build (#210) */
  readonly VITE_GA_ID?: string;
}

interface Window {
  /** gtag.js's command queue, once usage statistics are allowed (web version only) */
  dataLayer?: IArguments[];
  /** gtag.js sends nothing for a measurement ID while its flag is true */
  [gaDisable: `ga-disable-${string}`]: boolean;

  /** Present only when running inside the Electron desktop shell. */
  markloomDesktop?: {
    isDesktop: true;
    platform: string;
    /** Documents and the folder (an OS path) handed over before the page was ready */
    takePendingFiles: () => Promise<{ files: string[]; folder: string | null }>;
    onOpenFiles: (callback: (files: string[]) => void) => () => void;
    onOpenFolder: (callback: (folder: string) => void) => () => void;
    /** One level of a folder the desktop app trusts: its subfolders and documents */
    listFolder: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>;
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
    /**
     * Windows only: adds (true) or removes (false) "Open with Markloom" in the Explorer menu and returns
     * the state now in effect and whether this is the portable build; no argument only reads.
     * Rejects when reg.exe fails.
     */
    setExplorerMenu: (enabled?: boolean) => Promise<{ enabled: boolean; portable: boolean }>;
    /**
     * The newest published release on GitHub, compared with the running version by the main process.
     * `url` is the download for this install (installer or portable on Windows) or the release page.
     */
    checkForUpdate: () => Promise<
      | { ok: true; current: string; latest: string; newer: boolean; url: string; checkedAt: number }
      | { ok: false; error: 'offline' | 'rate-limited' | 'other' }
    >;
  };
}
