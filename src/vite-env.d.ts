/// <reference types="vite/client" />

interface Window {
  /** Present only when running inside the Electron desktop shell. */
  markloomDesktop?: {
    isDesktop: true;
    platform: string;
    takePendingFiles: () => Promise<string[]>;
    onOpenFiles: (callback: (files: string[]) => void) => () => void;
    readFile: (filePath: string) => Promise<Uint8Array>;
    statFile: (filePath: string) => Promise<{ mtimeMs: number; size: number }>;
    writeFile: (filePath: string, data: string | Uint8Array) => Promise<void>;
    printToPdf: (html: string, options?: { pageSize?: string; landscape?: boolean }) => Promise<Uint8Array>;
  };
}
