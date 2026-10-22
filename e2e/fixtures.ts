// Shared setup for every spec: a test folder in the browser's origin-private file system that
// "Open folder" returns, the editor mode chosen before the app first loads, and helpers to open a
// file and read what the active editor rendered.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The app's editor modes (`EditorMode` in src/stores/appStore.ts) */
export type EditorMode = 'split' | 'wysiwyg';

/** Set per project in playwright.config.ts */
export interface EditorOptions {
  editorMode: EditorMode;
}

interface SeedFile {
  /** Relative to the test folder, with `/` separators */
  path: string;
  base64: string;
}

/** The OPFS folder that stands in for a picked folder; also the name the file tree shows */
export const FOLDER_NAME = 'e2e-folder';

/** Web images in fixtures point here; the test serves them, so no test needs the network */
export const WEB_IMAGE_ORIGIN = 'https://images.e2e.test';

const FOLDER_SOURCE = join(import.meta.dirname, 'folder');

/** Set on <html> once the Markdown preview has mounted, so rich-text tests can prove it never did */
const PREVIEW_SEEN_ATTRIBUTE = 'data-e2e-preview-seen';

function seedFiles(directory: string): SeedFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) return seedFiles(full);

    return [{ path: relative(FOLDER_SOURCE, full).split(sep).join('/'), base64: readFileSync(full).toString('base64') }];
  });
}

export class MarkloomApp {
  constructor(
    readonly page: Page,
    readonly editorMode: EditorMode
  ) {}

  /** Opens the test folder with the Open folder shortcut (the picker is stubbed); the sidebar shows it */
  async openFolder(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+Shift+O');
    await expect(this.page.getByRole('heading', { name: FOLDER_NAME, exact: true })).toBeVisible();
  }

  /** Opens a file from the tree by its exact name (names can be substrings of each other) */
  async openFile(name: string): Promise<void> {
    await this.treeItem(name).click();
    await expect(this.page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name, exact: true })).toBeVisible();
    await expect(this.rendered()).toBeVisible();
  }

  /** What the active editor shows: the preview's article in Markdown mode, the document in rich text */
  rendered(): Locator {
    if (this.editorMode === 'split') return this.page.getByRole('region', { name: 'Preview' }).locator('article');

    return this.page.locator('[data-doc-surface] .rt-document');
  }

  /** Whether the Markdown preview has mounted at any point since the page loaded */
  async previewEverMounted(): Promise<boolean> {
    return this.page.evaluate((attribute) => document.documentElement.hasAttribute(attribute), PREVIEW_SEEN_ATTRIBUTE);
  }

  private treeItem(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
}

export const test = base.extend<{ app: MarkloomApp }, EditorOptions>({
  editorMode: ['split', { option: true, scope: 'worker' }],

  app: async ({ page, editorMode }, use) => {
    const files = seedFiles(FOLDER_SOURCE);

    const webImage = readFileSync(join(FOLDER_SOURCE, 'assets', 'pic.png'));

    await page.route(`${WEB_IMAGE_ORIGIN}/**`, (route) => route.fulfill({ contentType: 'image/png', body: webImage }));

    // Top frame only: the export preview's sandboxed iframes have no storage access
    await page.addInitScript(
      ([mode, folderName, previewAttribute]) => {
        if (window !== window.top) return;

        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true }),
        });

        // The mode is set once per tab, so a test that switches modes keeps its choice across reloads
        if (!sessionStorage.getItem('e2e-mode-set')) {
          localStorage.setItem('markloom-layout', JSON.stringify({ state: { editorMode: mode }, version: 0 }));
          sessionStorage.setItem('e2e-mode-set', '1');
        }

        new MutationObserver((_records, observer) => {
          if (!document.querySelector('[role="region"][aria-label="Preview"]')) return;

          document.documentElement.setAttribute(previewAttribute, '');
          observer.disconnect();
        }).observe(document, { childList: true, subtree: true });
      },
      [editorMode, FOLDER_NAME, PREVIEW_SEEN_ATTRIBUTE] as const
    );

    await page.goto('/');

    // The default (non-persistent) context starts with an empty origin-private file system
    await page.evaluate(
      async ([folderName, seed]) => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true });

        for (const file of seed) {
          const parts = file.path.split('/');
          const fileName = parts.pop() ?? '';
          let directory = folder;

          for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });

          const writable = await (await directory.getFileHandle(fileName, { create: true })).createWritable();

          await writable.write(Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0)));
          await writable.close();
        }
      },
      [FOLDER_NAME, files] as const
    );

    await use(new MarkloomApp(page, editorMode));
  },
});

export { expect };
