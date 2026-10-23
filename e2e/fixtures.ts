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

  /** Selects the whole first line (Markdown) or block (rich text) that contains `text` */
  async selectLine(text: string): Promise<void> {
    await this.placeCursorAfter(text);
    await this.page.keyboard.press('Shift+Home');
  }

  /** Saves the active document (Ctrl+S) and waits until the title bar says it is saved */
  async save(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+s');
    await expect(this.page.getByRole('toolbar', { name: 'Document actions' }).getByText('Saved', { exact: true })).toBeVisible();
  }

  /** A file of the test folder as the app sees it now, read back from the origin-private file system */
  async readFile(path: string): Promise<string> {
    return (await this.fileState(path)).text;
  }

  /** When a file of the test folder was last written (ms since the epoch) */
  async fileModified(path: string): Promise<number> {
    return (await this.fileState(path)).modified;
  }

  private fileState(path: string): Promise<{ text: string; modified: number }> {
    return this.page.evaluate(
      async ([folderName, filePath]) => {
        const parts = filePath.split('/');
        const fileName = parts.pop() ?? '';
        let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);

        for (const part of parts) directory = await directory.getDirectoryHandle(part);

        const handle = await directory.getFileHandle(fileName);

        // A file being written can't be read until the write closes
        for (let attempt = 0; ; attempt++) {
          try {
            const file = await handle.getFile();

            return { text: await file.text(), modified: file.lastModified };
          } catch (error) {
            if (attempt === 20) throw error;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      },
      [FOLDER_NAME, path] as const
    );
  }

  /** Whether the Markdown preview has mounted at any point since the page loaded */
  async previewEverMounted(): Promise<boolean> {
    return this.page.evaluate((attribute) => document.documentElement.hasAttribute(attribute), PREVIEW_SEEN_ATTRIBUTE);
  }

  /** Puts the caret at the end of the first source line (Markdown) or block (rich text) that contains `text` */
  async placeCursorAfter(text: string): Promise<void> {
    if (this.editorMode === 'wysiwyg') {
      // A list item that holds a paragraph is skipped for that paragraph: clicking the item's middle
      // can land on a block after the paragraph (a nested definition or list), and End stays there
      await this.rendered().locator(':is(p, h1, h2, h3, li:not(:has(> p)), th, td)', { hasText: text }).first().click();
      await this.page.keyboard.press('End');

      return;
    }

    // The source draws only the lines near the viewport: page down until the line is drawn
    const line = this.source().locator('.cm-line', { hasText: text }).first();

    if (!(await line.isVisible())) {
      await this.source().click();
      await this.page.keyboard.press('ControlOrMeta+Home');

      for (let page = 0; page < 50 && !(await line.isVisible()); page++) await this.page.keyboard.press('PageDown');
    }

    await line.click();
    await this.page.keyboard.press('End');
  }

  /** Picks an item from the formatting toolbar's Insert menu (Table, Code block, Divider, Image) */
  async insert(item: string): Promise<void> {
    await this.page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Insert', exact: true }).click();
    // Code block carries a shortcut hint after its name
    await this.page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click();
    // The menu hands focus back to the editor as it closes; typing before that would be lost
    await expect(this.page.getByRole('menu')).toBeHidden();
    await expect(this.editingSurface()).toBeFocused();
  }

  /** The element that takes typing: the source editor in Markdown mode, the document in rich text */
  editingSurface(): Locator {
    return this.editorMode === 'split' ? this.source() : this.rendered();
  }

  /** The Markdown source, one entry per line (an empty line is ''); Markdown mode only */
  async sourceLines(): Promise<string[]> {
    return this.source().locator('.cm-line').allTextContents();
  }

  private source(): Locator {
    return this.page.getByLabel('Markdown source');
  }

  /** A file or folder in the sidebar's tree, by its exact name */
  treeItem(name: string): Locator {
    return this.page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name, exact: true });
  }

  /** A document's tab, by its exact name, saved or not */
  tab(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return this.page
      .getByRole('tablist', { name: 'Open documents' })
      .getByRole('tab', { name: new RegExp(`^${escaped}( \\(unsaved changes\\))?$`) });
  }
}

/** A file of the test folder as the tests seeded it, with `/` separators */
export function seedText(path: string): string {
  return readFileSync(join(FOLDER_SOURCE, ...path.split('/')), 'utf8');
}

export interface SavedFile {
  name: string;
  bytes: Buffer;
}

/** Runs `action`, which must start a download, and returns the downloaded file */
export async function downloadOf(page: Page, action: () => Promise<void>): Promise<SavedFile> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);

  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

/**
 * Marks the test as a known gap in `mode` (or in both editors), naming the issue that closes it: the
 * test is expected to fail there, so once the gap is fixed it turns red until the marker goes
 */
export function knownGap(app: MarkloomApp, mode: EditorMode | 'both', issue: number, gap: string): void {
  test.fail(mode === 'both' || app.editorMode === mode, `#${issue}: ${gap}`);
}

/** Rich text has to manage without anything only the preview loads (a library, its CSS, a cache) */
export async function expectNoPreviewInRichText(app: MarkloomApp): Promise<void> {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
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
