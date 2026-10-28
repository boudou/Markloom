// The appearance setting (#228): a stored 'dark' marks <html> dark before first paint, 'system'
// follows the OS live, the default stays light, and exports stay light whatever the app shows.
import type { Page } from '@playwright/test';
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
