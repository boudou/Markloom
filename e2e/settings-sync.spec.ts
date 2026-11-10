// Choosing the theme (#233): Settings > Appearance switches it at once and keeps it, the palette
// cycles it, and a theme or page width chosen in one tab reaches the other tabs (#239).
import type { Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';
import { bodyBackground, colorScheme, DARK_CANVAS, isDark, openAppearance, themeSelect } from './colours';

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('Settings > Appearance switches the theme at once and keeps it @appearance @settings', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();

  const select = await openAppearance(page);

  await expect(select).toHaveValue('system');
  await select.selectOption({ label: 'Dark' });
  await expect.poll(() => isDark(page)).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

  await page.reload();
  expect(await isDark(page)).toBe(true);
  await expect(await openAppearance(page)).toHaveValue('dark');

  // Light no longer follows the OS
  await themeSelect(page).selectOption({ label: 'Light' });
  await expect.poll(() => isDark(page)).toBe(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => colorScheme(page)).toBe('light');
  expect(await isDark(page)).toBe(false);
});

// #239: another tab of the same app picks up a settings change without a reload
test('a theme or page width chosen in one tab reaches the other tabs at once @appearance @settings', async ({ app, context }) => {
  const { page } = app;
  const other = await context.newPage();

  await page.emulateMedia({ colorScheme: 'light' });
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('/');

  for (const tab of [page, other]) {
    await tab.keyboard.press('Alt+N');
    await expect(tab.locator('[data-page-width]')).toBeVisible();
  }

  expect(await isDark(other)).toBe(false);

  await (await openAppearance(page)).selectOption({ label: 'Dark' });
  await expect.poll(() => isDark(page)).toBe(true);
  await expect.poll(() => isDark(other)).toBe(true);
  expect(await bodyBackground(other)).toBe(DARK_CANVAS);

  const dialog = page.getByRole('dialog', { name: 'Settings' });

  await dialog.getByRole('tab', { name: 'Editor' }).click();
  await dialog.getByRole('combobox', { name: 'Page width' }).selectOption({ label: 'Wide' });
  await expect(other.locator('[data-page-width="wide"]')).toBeVisible();

  // The other tab's own change comes back the same way, and the first tab keeps it
  await (await openAppearance(other)).selectOption({ label: 'Light' });
  await expect.poll(() => isDark(page)).toBe(false);
  await expect.poll(() => storedAppearance(page)).toBe('light');
  expect(await isDark(other)).toBe(false);

  await other.close();
});

async function storedAppearance(page: Page): Promise<string | undefined> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('markloom-settings') ?? '{}').state?.appearance);
}

/** Runs the palette's theme command, checking that its label names `next` first */
async function runThemeCommand(page: Page, next: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill('Theme:');

  const option = page.getByRole('listbox', { name: 'Commands' }).getByRole('option');

  await expect(option).toHaveCount(1);
  await expect(option).toContainText(`Theme: ${next}`);
  await page.keyboard.press('Enter');
}

test('the palette cycles the theme and names the next one @appearance @palette', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();

  await runThemeCommand(page, 'Light');
  await expect.poll(() => storedAppearance(page)).toBe('light');
  expect(await isDark(page)).toBe(false);

  await runThemeCommand(page, 'Dark');
  await expect.poll(() => storedAppearance(page)).toBe('dark');
  await expect.poll(() => isDark(page)).toBe(true);

  await runThemeCommand(page, 'System');
  await expect.poll(() => storedAppearance(page)).toBe('system');
  await expect.poll(() => isDark(page)).toBe(false);
});
