// The appearance setting (#228): a stored 'dark' marks <html> dark before first paint, 'system'
// follows the OS live, the default stays light, and exports stay light whatever the app shows.
// Dialogs, menus and toasts take their edges, backdrops and status colours from the theme (#229).
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText } from './fixtures';

type Appearance = 'system' | 'light' | 'dark';

interface FirstPaint {
  dark: boolean;
  colorScheme: string;
}

declare global {
  interface Window {
    __e2eFirstPaint?: FirstPaint;
  }
}

const DARK_CANVAS = 'rgb(23, 25, 28)';

const WHITE = 'rgb(255, 255, 255)';

/** Stores `appearance` in markloom-settings and reloads, so the app starts with it */
async function startWith(page: Page, appearance: Appearance): Promise<void> {
  await page.addInitScript((value) => {
    if (window !== window.top) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: { appearance: value }, version: 1 }));
  }, appearance);
  await page.reload();
}

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}

async function colorScheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.style.colorScheme);
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

const WINDOW_CALLS_KEY = 'e2e-window-prefs-calls';

/** The appearances the fake desktop bridge was sent, oldest first */
async function windowAppearances(page: Page): Promise<(Appearance | undefined)[]> {
  return page.evaluate((key) => {
    const calls: { appearance?: Appearance }[] = JSON.parse(localStorage.getItem(key) ?? '[]');

    return calls.map((call) => call.appearance);
  }, WINDOW_CALLS_KEY);
}

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('a stored dark appearance is on <html> before first paint @appearance', async ({ app }) => {
  const { page } = app;

  // Records <html> the moment <body> exists, before any app script has run
  await page.addInitScript(() => {
    if (window !== window.top) return;

    new MutationObserver((_records, observer) => {
      if (!document.body) return;

      const root = document.documentElement;

      window.__e2eFirstPaint = { dark: root.classList.contains('dark'), colorScheme: root.style.colorScheme };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await startWith(page, 'dark');

  expect(await page.evaluate(() => window.__e2eFirstPaint)).toEqual({ dark: true, colorScheme: 'dark' });
  await expect.poll(() => bodyBackground(page)).toBe(DARK_CANVAS);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E2024');
});

test('system follows the OS without a reload @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await startWith(page, 'system');
  expect(await isDark(page)).toBe(false);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await colorScheme(page)).toBe('dark');
  expect(await bodyBackground(page)).toBe(DARK_CANVAS);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => isDark(page)).toBe(false);
  expect(await colorScheme(page)).toBe('light');
  expect(await bodyBackground(page)).toBe(WHITE);
});

test('the default is light, even on a dark OS @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();

  expect(await isDark(page)).toBe(false);
  expect(await colorScheme(page)).toBe('light');
  expect(await bodyBackground(page)).toBe(WHITE);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F8F9FA');
});

test('the desktop window is told the stored appearance at startup @appearance @desktop', async ({ app }) => {
  const { page } = app;

  // A fake desktop bridge that records what updateWindowPrefs receives
  await page.addInitScript((callsKey) => {
    if (window !== window.top) return;

    Object.defineProperty(window, 'markloomDesktop', {
      value: {
        isDesktop: true,
        platform: 'win32',
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
        updateWindowPrefs: async (changes: { appearance?: Appearance }) => {
          const calls = JSON.parse(localStorage.getItem(callsKey) ?? '[]');

          localStorage.setItem(callsKey, JSON.stringify([...calls, changes]));

          return { minimizeToTray: false, closeToTray: false };
        },
        setExplorerMenu: async () => ({ enabled: false, portable: false }),
      },
    });
  }, WINDOW_CALLS_KEY);

  await startWith(page, 'dark');
  expect(await windowAppearances(page)).toContain('dark');

  // Init scripts run in the order added, so this stored value replaces 'dark'
  await startWith(page, 'system');
  expect((await windowAppearances(page)).at(-1)).toBe('system');
});

test('a Web page exported in dark mode stays light @appearance @export', async ({ app, context }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('fixture.md');
  expect(await isDark(page)).toBe(true);

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const viewer = await context.newPage();

  await viewer.emulateMedia({ colorScheme: 'dark' });
  await viewer.setContent(file.bytes.toString('utf8'));
  expect(await bodyBackground(viewer)).toBe(WHITE);
  await viewer.close();
});

/** What covers the window's top-left corner: a dialog's backdrop while one is open */
async function backdropColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const top = document.elementFromPoint(4, 4);

    return top ? getComputedStyle(top).backgroundColor : '';
  });
}

/** Black at `alpha`, as Chrome reports a colour-mixed scrim */
function blackAt(alpha: number): RegExp {
  return new RegExp(String.raw`^(rgba\(0, 0, 0, ${alpha}\)|oklab\(0 0 0 / ${alpha}\))$`);
}

async function boxShadow(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).boxShadow);
}

/** Copies the open document as rich text and returns the success toast's icon colour */
async function successToastIconColor(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: 'Copy as rich text' }).click();

  const icon = page.getByRole('status').filter({ hasText: 'Copied as rich text' }).locator('svg').first();

  await expect(icon).toBeVisible({ timeout: 15_000 });

  return icon.evaluate((element) => getComputedStyle(element).color);
}

test('floating surfaces get a light edge and a black backdrop in dark mode (#229) @appearance @palette @export @documents', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('fixture.md');

  await page.keyboard.press('ControlOrMeta+Shift+P');

  const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Command' }) });

  await expect(palette).toBeVisible();
  expect(await boxShadow(palette)).toContain('rgba(255, 255, 255, 0.12)');
  await expect.poll(() => backdropColor(page)).toMatch(blackAt(0.25));
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await page.keyboard.press('ControlOrMeta+e');

  const exportDialog = page.getByRole('dialog', { name: 'Export' });

  await expect(exportDialog).toBeVisible();
  expect(await boxShadow(exportDialog)).toContain('rgba(255, 255, 255, 0.12)');
  await expect.poll(() => backdropColor(page)).toMatch(blackAt(0.4));
  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();

  await app.tab('fixture.md').click({ button: 'right' });

  const menu = page.getByRole('menu');

  await expect(menu).toBeVisible();
  expect(await boxShadow(menu)).toContain('rgba(255, 255, 255, 0.1)');
  await page.keyboard.press('Escape');

  expect(await successToastIconColor(page)).toBe('rgb(74, 222, 128)');
});

test('floating surfaces keep their light colours by default (#229) @appearance @palette @export', async ({ app }) => {
  const { page } = app;

  await app.openFolder();
  await app.openFile('fixture.md');

  await page.keyboard.press('ControlOrMeta+Shift+P');

  const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Command' }) });

  await expect(palette).toBeVisible();
  expect(await boxShadow(palette)).toContain('rgba(26, 26, 26, 0.12)');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  expect(await successToastIconColor(page)).toBe('rgb(21, 128, 61)');
});
