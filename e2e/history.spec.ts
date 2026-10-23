// Settings > History (#155): how many versions each file keeps, what the history takes, and
// Clear all history, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' });
}

async function openSettingsHistory(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = settingsDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'History' }).click();
  await expect(dialog.getByRole('tab', { name: 'History', selected: true })).toBeVisible();

  return dialog;
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(settingsDialog(page)).toBeHidden();
}

async function openHistory(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Shift+H');
  const panel = page.getByRole('dialog').filter({ hasText: 'Version history' });
  await expect(panel).toBeVisible();

  return panel;
}

async function closeHistory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close version history' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Version history' })).toBeHidden();
}

function versionRows(panel: Locator): Locator {
  return panel.getByRole('button', { name: /^Delete version from/ });
}

function readout(dialog: Locator, term: 'Storage used' | 'Files with history'): Locator {
  return dialog.locator(`dt:text-is("${term}") + dd`);
}

/** Rows in each IndexedDB store of the history database */
async function storedCounts(page: Page): Promise<{ versions: number; meta: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('markloom-history');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const count = (store: 'versions' | 'meta') =>
      new Promise<number>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const counts = { versions: await count('versions'), meta: await count('meta') };
    db.close();

    return counts;
  });
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('fixture.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('keeps the chosen number of versions @history', async ({ page }) => {
  const dialog = await openSettingsHistory(page);
  await dialog.getByRole('combobox', { name: 'Versions to keep per file' }).selectOption('10');
  await closeSettings(page);

  const panel = await openHistory(page);
  await panel.getByRole('button', { name: 'Save this version' }).click();
  await expect(versionRows(panel)).toHaveCount(1);

  for (let saved = 2; saved <= 11; saved++) {
    await panel.getByRole('button', { name: 'Save version', exact: true }).click();
    await expect(versionRows(panel)).toHaveCount(Math.min(saved, 10));
  }

  expect(await storedCounts(page)).toEqual({ versions: 10, meta: 10 });
});

test('lowering the limit trims every file at once @history', async ({ page }) => {
  const panel = await openHistory(page);
  await panel.getByRole('button', { name: 'Save this version' }).click();
  await expect(versionRows(panel)).toHaveCount(1);
  await closeHistory(page);

  // 29 older copies of the saved version, so the file has 30
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('markloom-history');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction(['versions', 'meta'], 'readwrite');
    const versions = tx.objectStore('versions');
    const meta = tx.objectStore('meta');

    const rows = await new Promise<{ id: string; filePath: string; timestamp: number; content: string }[]>((resolve, reject) => {
      const request = versions.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const [saved] = rows;

    for (let n = 1; n <= 29; n++) {
      const copy = { id: `seed-${n}`, filePath: saved.filePath, timestamp: saved.timestamp - n * 1000 };
      versions.put({ ...copy, content: saved.content });
      meta.put(copy);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  expect(await storedCounts(page)).toEqual({ versions: 30, meta: 30 });

  const dialog = await openSettingsHistory(page);
  await expect(readout(dialog, 'Files with history')).toHaveText('1');
  await dialog.getByRole('combobox', { name: 'Versions to keep per file' }).selectOption('10');
  await expect.poll(() => storedCounts(page)).toEqual({ versions: 10, meta: 10 });
  await closeSettings(page);

  await expect(versionRows(await openHistory(page))).toHaveCount(10);
});

test('Clear all history asks first @history', async ({ page }) => {
  const panel = await openHistory(page);
  await panel.getByRole('button', { name: 'Save this version' }).click();
  await expect(versionRows(panel)).toHaveCount(1);
  await closeHistory(page);

  const dialog = await openSettingsHistory(page);
  const clear = dialog.getByRole('button', { name: 'Clear all history…' });
  const confirm = dialog.getByRole('group', { name: 'Confirm clear all history' });

  await expect(readout(dialog, 'Files with history')).toHaveText('1');
  await expect(readout(dialog, 'Storage used')).not.toHaveText('0 bytes');
  await clear.click();
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Delete all 1 version of 1 file?');
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(clear).toBeFocused();
  await expect(readout(dialog, 'Files with history')).toHaveText('1');
  expect(await storedCounts(page)).toEqual({ versions: 1, meta: 1 });

  await clear.click();
  await confirm.getByRole('button', { name: 'Delete all' }).click();
  await expect(readout(dialog, 'Storage used')).toHaveText('0 bytes');
  await expect(readout(dialog, 'Files with history')).toHaveText('0');
  await expect(clear).toBeDisabled();
  expect(await storedCounts(page)).toEqual({ versions: 0, meta: 0 });
  await closeSettings(page);

  await expect(await openHistory(page)).toContainText('No versions yet');
});

test('an older settings save keeps 50 versions @history', async ({ page }) => {
  // Once per tab, so the choice made below survives the second reload
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-old-settings')) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: { autoSave: false }, version: 1 }));
    sessionStorage.setItem('e2e-old-settings', '1');
  });
  await page.reload();

  const select = (await openSettingsHistory(page)).getByRole('combobox', { name: 'Versions to keep per file' });
  await expect(select).toHaveValue('50');
  await select.selectOption('25');
  await page.reload();

  await expect((await openSettingsHistory(page)).getByRole('combobox', { name: 'Versions to keep per file' })).toHaveValue('25');
});
