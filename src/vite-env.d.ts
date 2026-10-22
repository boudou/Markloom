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
    printToPdf: (html: string, options?: { pageSize?: string; landscape?: boolean }) => Promise<Uint8Array>;
  };
}
