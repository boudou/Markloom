// Changed on disk: another program rewrites an open file. A clean tab reloads (on focus, or by the
// poll of the active tab); a tab with unsaved changes asks (Reload from disk, Compare, Keep my
// version), and a save never writes over the other program's change without asking. Both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, seedText, FOLDER_NAME } from './fixtures';

const REWRITTEN = seedText('notes.md').replace('Bravo charlie delta.', 'Bravo rewritten elsewhere.');

const TYPED = ' Typed words.';

const TYPED_VERSION = seedText('notes.md').replace('notes.', `notes.${TYPED}`);

function titleBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Document actions' });
}

function diskDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: '“notes.md” changed on disk' });
}

/** Writes a file of the test folder, as another program would */
async function writeFolderFile(page: Page, path: string, text: string): Promise<void> {
  await page.evaluate(
    async ([folderName, filePath, content]) => {
      const parts = filePath.split('/');
      const fileName = parts.pop() ?? '';
      let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);

      for (const part of parts) directory = await directory.getDirectoryHandle(part);

      const writable = await (await directory.getFileHandle(fileName)).createWritable();

      await writable.write(content);
      await writable.close();
    },
    [FOLDER_NAME, path, text] as const
  );
}

async function focusWindow(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('notes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('a clean tab reloads when the window regains focus @documents @disk-changes', async ({ app, page }) => {
  await writeFolderFile(page, 'notes.md', REWRITTEN);
  await focusWindow(page);

  await expect(app.rendered()).toContainText('Bravo rewritten elsewhere.');
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeHidden();
  await expect(diskDialog(page)).toBeHidden();
});

test('a clean active tab reloads without a focus event @documents @disk-changes', async ({ app, page }) => {
  await writeFolderFile(page, 'notes.md', REWRITTEN);

  await expect(app.rendered()).toContainText('Bravo rewritten elsewhere.', { timeout: 5000 });
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeHidden();
});

test('a tab with unsaved changes asks; Compare shows the change, Reload from disk drops the edit @documents @disk-changes', async ({ app, page }) => {
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(TYPED);
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeVisible();

  await writeFolderFile(page, 'notes.md', REWRITTEN);
  await focusWindow(page);

  const dialog = diskDialog(page);

  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(dialog.getByText('Bravo rewritten elsewhere.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Hide comparison', exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Reload from disk', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(app.rendered()).toContainText('Bravo rewritten elsewhere.');
  await expect(app.rendered()).not.toContainText('Typed words.');
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeHidden();
});

test('Keep my version keeps the edit unsaved; the next save replaces the file @documents @disk-changes', async ({ app, page }) => {
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(TYPED);
  await writeFolderFile(page, 'notes.md', REWRITTEN);
  await focusWindow(page);

  const dialog = diskDialog(page);

  await dialog.getByRole('button', { name: 'Keep my version', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(app.rendered()).toContainText('Typed words.');
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeVisible();

  await app.save();
  await expect(dialog).toBeHidden();
  expect(await app.readFile('notes.md')).toBe(TYPED_VERSION);
});

test('saving over a file changed on disk asks and writes nothing @documents @disk-changes', async ({ app, page }) => {
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(TYPED);
  await writeFolderFile(page, 'notes.md', REWRITTEN);
  await page.keyboard.press('ControlOrMeta+s');

  const dialog = diskDialog(page);

  await expect(dialog).toBeVisible();
  expect(await app.readFile('notes.md')).toBe(REWRITTEN);

  // Escape decides nothing: the edit stays unsaved, and the next save asks again
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(dialog).toBeVisible();
  expect(await app.readFile('notes.md')).toBe(REWRITTEN);
});

test('the app’s own save is not taken for a change on disk @documents @disk-changes', async ({ app, page }) => {
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(TYPED);
  await app.save();
  await focusWindow(page);
  // Longer than the poll of the active tab
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)));

  await expect(diskDialog(page)).toBeHidden();
  await expect(app.rendered()).toContainText('The last paragraph of notes. Typed words.');
  await expect(titleBar(page).getByText('Saved', { exact: true })).toBeVisible();
});
