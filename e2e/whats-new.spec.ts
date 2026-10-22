// What's new (#156): the current version's changelog section shows once after an update; a first
// launch and a downgrade only record the version. Runs in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';

const CHANGELOG_URL = 'https://github.com/boudou/Markloom/blob/main/CHANGELOG.md';

const VERSION = /^\d+\.\d+\.\d+$/;

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

function whatsNewDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^What's new in Markloom \d+\.\d+\.\d+/ });
}

/** Stores `state` as the settings save once per tab (later reloads keep what the app wrote), then reloads */
async function seedSettings(page: Page, state: Record<string, string>): Promise<void> {
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('e2e-settings-seeded')) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: saved, version: 1 }));
    sessionStorage.setItem('e2e-settings-seeded', '1');
  }, state);
  await page.reload();
}

async function lastSeenVersion(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const saved: { state?: { lastSeenVersion?: string | null } } = JSON.parse(localStorage.getItem('markloom-settings') ?? '{}');

    return saved.state?.lastSeenVersion ?? null;
  });
}

test('shows the release notes once after an update', async ({ app, page }) => {
  await seedSettings(page, { lastSeenVersion: '0.0.1' });

  const dialog = whatsNewDialog(page);
  await expect(dialog).toBeVisible();

  const notes = dialog.getByRole('region', { name: 'Release notes' });
  await expect(notes.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await expect(notes.getByRole('listitem').first()).toBeVisible();
  await expect(notes.locator('code').first()).toBeVisible();
  await expect(dialog.locator('a[href]:not([target="_blank"])')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Full changelog' })).toHaveAttribute('href', CHANGELOG_URL);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const seen = await lastSeenVersion(page);
  expect(seen).toMatch(VERSION);
  expect(seen).not.toBe('0.0.1');

  await page.reload();
  await app.openFolder();
  await app.openFile('fixture.md');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a first launch only records the version', async ({ app, page }) => {
  await app.openFolder();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await lastSeenVersion(page)).toMatch(VERSION);
});

test('a newer stored version is replaced without the dialog', async ({ app, page }) => {
  await seedSettings(page, { lastSeenVersion: '999.0.0' });
  await app.openFolder();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const seen = await lastSeenVersion(page);
  expect(seen).toMatch(VERSION);
  expect(seen).not.toBe('999.0.0');
});
