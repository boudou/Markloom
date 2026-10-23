// Settings > Updates (#157): the desktop app asks the main process for the newest release and links
// to it. The bridge is faked here; the main process half (GitHub request, asset choice, errors) has
// its own harness. The browser build has no Updates section and never contacts GitHub.
import type { Locator, Page } from '@playwright/test';
import { test, expect, type MarkloomApp } from './fixtures';

/** What `markloomDesktop.checkForUpdate` resolves to (src/vite-env.d.ts, which the e2e config doesn't load) */
type UpdateCheck =
  | { ok: true; current: string; latest: string; newer: boolean; url: string; checkedAt: number }
  | { ok: false; error: 'offline' | 'rate-limited' | 'other' };

const DOWNLOAD_URL = 'https://github.com/boudou/Markloom/releases/download/v9.9.9/Markloom-Setup-9.9.9.exe';

const NEWER: UpdateCheck = { ok: true, current: '0.7.0', latest: '9.9.9', newer: true, url: DOWNLOAD_URL, checkedAt: 1767225600000 };

declare global {
  interface Window {
    /** What the fake bridge's checkForUpdate answers next */
    __e2eUpdate?: UpdateCheck;
  }
}

async function installDesktopBridge(page: Page): Promise<void> {
  await page.addInitScript((newer) => {
    if (window !== window.top) return;

    window.__e2eUpdate = newer;

    Object.defineProperty(window, 'markloomDesktop', {
      value: {
        isDesktop: true,
        platform: 'win32',
        takePendingFiles: async () => ({ files: [], folder: null }),
        onOpenFiles: () => () => {},
        onOpenFolder: () => () => {},
        listFolder: async () => [],
        readFile: async () => {
          throw new Error('No files in this test');
        },
        statFile: async () => {
          throw new Error('No files in this test');
        },
        writeFile: async () => {},
        printToPdf: async () => new Uint8Array(),
        updateWindowPrefs: async () => ({ minimizeToTray: false, closeToTray: false }),
        checkForUpdate: async () => window.__e2eUpdate,
      },
    });
  }, NEWER);
  await page.reload();
}

async function answerNext(page: Page, result: UpdateCheck): Promise<void> {
  await page.evaluate((next) => {
    window.__e2eUpdate = next;
  }, result);
}

/** A new document with a heading, so each project's editor is mounted before Settings opens */
async function startDocument(app: MarkloomApp): Promise<void> {
  await app.page.keyboard.press('ControlOrMeta+N');
  const surface = app.editorMode === 'split' ? app.page.locator('.cm-content') : app.page.locator('[data-doc-surface] .rt-document');

  // focus(), not click(): rich text's empty-document hint covers the page and would take the click
  await surface.focus();
  await expect(surface).toBeFocused();
  await app.page.keyboard.type('# Update check\n');
  await expect(app.rendered()).toContainText('Update check');
}

async function openUpdates(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = page.getByRole('dialog', { name: 'Settings' });

  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Updates' }).click();

  return dialog;
}

function lastChecked(dialog: Locator): Locator {
  return dialog.locator('dt', { hasText: 'Last checked' }).locator('xpath=following-sibling::dd');
}

// Rich text has to manage without anything only the preview loads (a library, its CSS, a cache)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test.describe('browser build', () => {
  test('has no Updates section and never contacts GitHub @updates @settings', async ({ app, page }) => {
    const requests: string[] = [];

    page.on('request', (request) => requests.push(request.url()));
    await page.reload();
    await startDocument(app);
    await page.keyboard.press('ControlOrMeta+Comma');
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await expect(dialog.getByRole('tab', { name: 'History' })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Updates' })).toHaveCount(0);
    expect(requests.filter((url) => new URL(url).hostname === 'api.github.com')).toEqual([]);
  });
});

test.describe('desktop', () => {
  test.beforeEach(async ({ app, page }) => {
    await installDesktopBridge(page);
    await startDocument(app);
  });

  test('Check now shows the newer version with its download link @updates @settings', async ({ page }) => {
    const dialog = await openUpdates(page);

    await expect(dialog.getByText('Installed version')).toBeVisible();
    await expect(lastChecked(dialog)).toHaveText('Never');
    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByText('Markloom 9.9.9 is available.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Download' })).toHaveAttribute('href', DOWNLOAD_URL);
    await expect(lastChecked(dialog)).not.toHaveText('Never');
  });

  test('says when the installed version is the latest @updates @settings', async ({ page }) => {
    await answerNext(page, { ...NEWER, latest: '0.7.0', newer: false });
    const dialog = await openUpdates(page);

    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByText('You have the latest version.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Download' })).toHaveCount(0);
  });

  test('a failed check explains itself and keeps the last good time @updates @settings', async ({ page }) => {
    const dialog = await openUpdates(page);

    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByText('Markloom 9.9.9 is available.')).toBeVisible();
    const checkedAt = await lastChecked(dialog).textContent();

    await answerNext(page, { ok: false, error: 'offline' });
    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByRole('alert')).toHaveText("Couldn't reach GitHub. Are you offline?");
    await expect(lastChecked(dialog)).toHaveText(checkedAt ?? '');
    await expect(lastChecked(dialog)).not.toHaveText('Never');
  });

  test('the last check time survives a reload @updates @settings', async ({ app, page }) => {
    const dialog = await openUpdates(page);

    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByText('Markloom 9.9.9 is available.')).toBeVisible();

    await page.reload();
    await startDocument(app);
    const reopened = await openUpdates(page);

    await expect(lastChecked(reopened)).not.toHaveText('Never');
  });

  test('closing Settings leaves the document as it was @updates @settings', async ({ app, page }) => {
    const dialog = await openUpdates(page);

    await dialog.getByRole('button', { name: 'Check now' }).click();
    await expect(dialog.getByText('Markloom 9.9.9 is available.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.type('still here');
    await expect(app.rendered()).toContainText('still here');
  });
});
