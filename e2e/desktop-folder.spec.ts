// A folder handed to the desktop app (#159): `Markloom.exe <folder>` makes it the open folder, listed
// through the desktop bridge. The bridge is faked here; the main process half has its own harness.
import type { Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';

const ROOT = 'C:/e2e-desktop';

const OTHER = 'C:/e2e-other';

async function installDesktopBridge(page: Page): Promise<void> {
  await page.addInitScript(
    ([root, other]) => {
      if (window !== window.top) return;

      const folders = new Map([
        [
          root,
          [
            { name: 'sub', isDirectory: true },
            { name: 'a.md', isDirectory: false },
            // Not a document: the renderer's filter must leave it out
            { name: 'pic.png', isDirectory: false },
          ],
        ],
        [`${root}/sub`, [{ name: 'b.md', isDirectory: false }]],
        [other, [{ name: 'c.md', isDirectory: false }]],
      ]);

      const files = new Map<string, { text: string; mtimeMs: number }>([
        [`${root}/a.md`, { text: '# Alpha heading\n\nFirst line\n', mtimeMs: 1 }],
        [`${root}/sub/b.md`, { text: '# Beta heading\n\nOnly here: zebrafinch\n', mtimeMs: 1 }],
        [`${other}/c.md`, { text: '# Gamma heading\n', mtimeMs: 1 }],
      ]);

      const fileAt = (filePath: string) => {
        const file = files.get(filePath);

        if (!file) throw new Error(`No such file: ${filePath}`);

        return file;
      };

      const listen = <T,>(name: string, callback: (detail: T) => void) => {
        const listener = (event: Event) => {
          if (event instanceof CustomEvent) callback(event.detail);
        };

        window.addEventListener(name, listener);

        return () => window.removeEventListener(name, listener);
      };

      Object.defineProperty(window, 'markloomDesktop', {
        value: {
          isDesktop: true,
          platform: 'win32',
          takePendingFiles: async () => ({ files: [], folder: root }),
          onOpenFiles: (callback: (files: string[]) => void) => listen('e2e-open-files', callback),
          onOpenFolder: (callback: (folder: string) => void) => listen('e2e-open-folder', callback),
          listFolder: async (dirPath: string) => {
            const entries = folders.get(dirPath);

            if (!entries) throw new Error('Markloom does not have access to that location');

            return entries;
          },
          readFile: async (filePath: string) => {
            const { text, mtimeMs } = fileAt(filePath);

            return { bytes: new TextEncoder().encode(text), mtimeMs };
          },
          statFile: async (filePath: string) => {
            const { text, mtimeMs } = fileAt(filePath);

            return { mtimeMs, size: text.length };
          },
          writeFile: async (filePath: string, data: BlobPart) => {
            const text = await new Blob([data]).text();

            files.set(filePath, { text, mtimeMs: (files.get(filePath)?.mtimeMs ?? 0) + 1 });

            const writes = JSON.parse(localStorage.getItem('e2e-writes') ?? '[]');
            localStorage.setItem('e2e-writes', JSON.stringify([...writes, { path: filePath, text }]));
          },
          printToPdf: async () => new Uint8Array(),
          updateWindowPrefs: async () => ({ minimizeToTray: false, closeToTray: false }),
        },
      });
    },
    [ROOT, OTHER] as const
  );
  await page.reload();
}

test.beforeEach(async ({ app: _app, page }) => {
  await installDesktopBridge(page);
  await expect(page.getByRole('heading', { name: 'e2e-desktop', exact: true })).toBeVisible();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('the folder is listed with its subfolders and documents only', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'sub', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'a.md', exact: true })).toBeVisible();
  await expect(page.getByText('pic.png')).toHaveCount(0);
});

test('a document opens from the tree and saves back through the bridge', async ({ app, page }) => {
  await app.openFile('a.md');
  await expect(app.rendered().getByRole('heading', { name: 'Alpha heading' })).toBeVisible();

  await app.placeCursorAfter('First line');
  await page.keyboard.type(' zqx');
  await page.keyboard.press('ControlOrMeta+S');

  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('e2e-writes') ?? '[]')))
    .toContainEqual({ path: `${ROOT}/a.md`, text: expect.stringContaining('First line zqx') });
});

test('Quick open finds a document in a subfolder', async ({ app, page }) => {
  await page.keyboard.press('ControlOrMeta+P');
  await expect(page.getByPlaceholder('Search files in e2e-desktop')).toBeVisible();
  await page.keyboard.type('b.md');
  await expect(page.getByRole('option', { name: /b\.md/ })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name: 'b.md', exact: true })).toBeVisible();
  await expect(app.rendered().getByRole('heading', { name: 'Beta heading' })).toBeVisible();
});

test('Search across files finds a word in a subfolder', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Shift+F');
  await page.getByRole('textbox', { name: 'Search in folder' }).fill('zebrafinch');

  await expect(page.getByRole('region', { name: 'Search results' })).toContainText('sub/b.md');
});

test('a folder handed over while running replaces the open one', async ({ page }) => {
  await page.evaluate((folder) => window.dispatchEvent(new CustomEvent('e2e-open-folder', { detail: folder })), OTHER);

  await expect(page.getByRole('heading', { name: 'e2e-other', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'c.md', exact: true })).toBeVisible();
});

test('the session keeps its documents but not the desktop folder', async ({ app, page }) => {
  await app.openFile('a.md');

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('markloom-settings') ?? '{}');

        return settings.state?.lastSession ?? null;
      })
    )
    .toMatchObject({ rootName: null, paths: [`desktop:${ROOT}/a.md`] });
});
