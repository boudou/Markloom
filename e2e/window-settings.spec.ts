// Settings > Window (#158, #160): the tray toggles and, on Windows, "Open with Markloom" in the
// Explorer menu. The desktop bridge is faked; the main process half has its own harness.
import type { Locator, Page } from '@playwright/test';
import { test, expect, type MarkloomApp } from './fixtures';

interface BridgeOptions {
  platform: string;
  portable: boolean;
  explorerFails: boolean;
}

const CALLS_KEY = 'e2e-desktop-calls';

/** Fakes the desktop bridge from the first script on; calls are recorded in localStorage */
async function installDesktopBridge(page: Page, options: BridgeOptions): Promise<void> {
  await page.addInitScript(
    ([{ platform, portable, explorerFails }, callsKey]) => {
      if (window !== window.top) return;

      const record = (call: string, arg: boolean | { minimizeToTray?: boolean; closeToTray?: boolean } | null) => {
        const calls = JSON.parse(localStorage.getItem(callsKey) ?? '[]');
        localStorage.setItem(callsKey, JSON.stringify([...calls, { call, arg }]));
      };

      const prefs = { minimizeToTray: true, closeToTray: false };
      let explorerMenu = false;

      Object.defineProperty(window, 'markloomDesktop', {
        value: {
          isDesktop: true,
          platform,
          takePendingFiles: async () => ({ files: [], folder: null }),
          onOpenFiles: () => () => {},
          onOpenFolder: () => () => {},
          listFolder: async () => [],
          readFile: async () => {
            throw new Error('No files here');
          },
          statFile: async () => {
            throw new Error('No files here');
          },
          writeFile: async () => {},
          printToPdf: async () => new Uint8Array(),
          updateWindowPrefs: async (changes: { minimizeToTray?: boolean; closeToTray?: boolean }) => {
            record('updateWindowPrefs', changes);
            Object.assign(prefs, changes);

            return { ...prefs };
          },
          setExplorerMenu: async (enabled?: boolean) => {
            record('setExplorerMenu', enabled ?? null);

            if (enabled !== undefined) {
              if (explorerFails) throw new Error("Markloom couldn't add the Explorer menu");

              explorerMenu = enabled;
            }

            return { enabled: explorerMenu, portable };
          },
        },
      });
    },
    [options, CALLS_KEY] as const
  );
  await page.reload();
}

async function recordedCalls(page: Page): Promise<{ call: string; arg: boolean | { minimizeToTray?: boolean; closeToTray?: boolean } | null }[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), CALLS_KEY);
}

async function openSettings(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  return dialog;
}

async function openWindowSection(page: Page): Promise<Locator> {
  const dialog = await openSettings(page);
  await dialog.getByRole('tab', { name: 'Window' }).click();

  return dialog;
}

const EXPLORER = 'Add "Open with Markloom" to the Explorer menu';

/** Settings closed, the open document is still there in the current editor */
async function expectDocumentKept(app: MarkloomApp): Promise<void> {
  await app.page.keyboard.press('Escape');
  await expect(app.page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  await expect(app.rendered().getByRole('heading', { name: 'Parity fixture' })).toBeVisible();
}

async function setUp(app: MarkloomApp, options?: BridgeOptions): Promise<void> {
  if (options) await installDesktopBridge(app.page, options);

  await app.openFolder();
  await app.openFile('fixture.md');
}

// Rich text has to manage without anything only the preview loads (a library, its CSS, a cache)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test('the browser build has no Window section @window @settings @desktop', async ({ app, page }) => {
  await setUp(app);
  const dialog = await openSettings(page);

  await expect(dialog.getByRole('tab', { name: 'Editor' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Window' })).toHaveCount(0);
});

test('Windows: the tray toggles and the Explorer menu @window @settings @desktop', async ({ app, page }) => {
  await setUp(app, { platform: 'win32', portable: false, explorerFails: false });
  const dialog = await openWindowSection(page);

  await expect(dialog.getByRole('checkbox', { name: 'Minimize to tray' })).toBeChecked();
  const closeToTray = dialog.getByRole('checkbox', { name: 'Close to tray' });
  await expect(closeToTray).not.toBeChecked();
  await closeToTray.check();
  await expect(closeToTray).toBeChecked();

  const explorer = dialog.getByRole('checkbox', { name: EXPLORER });
  await expect(explorer).not.toBeChecked();
  await expect(explorer).toHaveAccessibleDescription(/Show more options/);
  await expect(explorer).not.toHaveAccessibleDescription(/Turn this off/);
  await explorer.check();
  await expect(explorer).toBeChecked();
  await expect(explorer).toBeEnabled();

  const calls = await recordedCalls(page);
  expect(calls).toContainEqual({ call: 'updateWindowPrefs', arg: { closeToTray: true } });
  expect(calls).toContainEqual({ call: 'setExplorerMenu', arg: true });

  await expectDocumentKept(app);
});

test('Windows portable: the Explorer menu says to turn it off first @window @settings @desktop', async ({ app, page }) => {
  await setUp(app, { platform: 'win32', portable: true, explorerFails: false });
  const dialog = await openWindowSection(page);

  await expect(dialog.getByRole('checkbox', { name: EXPLORER })).toHaveAccessibleDescription(/Turn this off before deleting Markloom\./);
  await expectDocumentKept(app);
});

test('Windows: a failed Explorer change shows an error and the real state @window @settings @desktop', async ({ app, page }) => {
  await setUp(app, { platform: 'win32', portable: false, explorerFails: true });
  const dialog = await openWindowSection(page);
  const explorer = dialog.getByRole('checkbox', { name: EXPLORER });

  await expect(explorer).toBeEnabled();
  await explorer.click();
  await expect(dialog.getByRole('alert')).toHaveText("Couldn't change the Explorer menu.");
  await expect(explorer).not.toBeChecked();
  await expect(explorer).toBeEnabled();
  await expectDocumentKept(app);
});

test('macOS: the tray toggles only @window @settings @desktop', async ({ app, page }) => {
  await setUp(app, { platform: 'darwin', portable: false, explorerFails: false });
  const dialog = await openWindowSection(page);

  await expect(dialog.getByRole('checkbox', { name: 'Minimize to tray' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Close to tray' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Explorer/ })).toHaveCount(0);
  expect((await recordedCalls(page)).some(({ call }) => call === 'setExplorerMenu')).toBe(false);
  await expectDocumentKept(app);
});
