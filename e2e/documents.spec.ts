// Documents: new, open, edit, save, close with the unsaved-changes prompt, tabs, Quick open,
// folder search, the file tree, recent files and folders, and session restore, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, knownGap, seedText, FOLDER_NAME } from './fixtures';

function tabs(page: Page): Locator {
  return page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab');
}

function titleBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Document actions' });
}

interface LastSession {
  rootName: string | null;
  paths: string[];
}

/** Waits until the settings remember a session that passes `check` (they are written shortly after a change) */
async function sessionSaved(page: Page, check: (session: LastSession) => boolean): Promise<void> {
  await expect
    .poll(async () => {
      const session = await page.evaluate((): LastSession | null => {
        const stored = localStorage.getItem('markloom-settings');

        return stored ? JSON.parse(stored).state.lastSession : null;
      });

      return !!session && check(session);
    })
    .toBe(true);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('new document opens an empty Untitled tab', async ({ app, page }) => {
  await app.openFile('notes.md');
  const before = await tabs(page).count();

  await page.keyboard.press('Alt+n');
  await expect(tabs(page)).toHaveCount(before + 1);
  await expect(tabs(page).and(page.getByRole('tab', { selected: true }))).toHaveText(/^Untitled/);
  await expect(page.getByRole('heading', { name: 'A blank page' })).toBeVisible();
});

test('edit and save writes the file', async ({ app, page }) => {
  await app.openFile('notes.md');
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(' Saved words.');
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeVisible();

  await app.save();
  expect(await app.readFile('notes.md')).toBe(seedText('notes.md').replace('notes.', 'notes. Saved words.'));
});

test('closing an edited tab asks first; Cancel keeps it and focus stays off the close button (#187)', async ({ app, page }) => {
  await app.openFile('notes.md');
  await app.placeCursorAfter('Alpha');
  await page.keyboard.type(' unsaved');

  const tab = app.tab('notes.md');
  // Hidden from assistive tech (Delete closes a focused tab); a mouse user clicks the cross
  const closeButton = tab.locator('xpath=..').locator('button[aria-hidden="true"]');

  await closeButton.click();

  const prompt = page.getByRole('dialog', { name: 'Save changes to “notes.md”?' });

  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toBeHidden();
  await expect(tab).toBeVisible();
  expect(await closeButton.evaluate((button) => button === document.activeElement), 'focus is on the hidden close button').toBe(false);
  await expect(app.editingSurface()).toBeFocused();

  await closeButton.click();
  await prompt.getByRole('button', { name: 'Don’t save' }).or(prompt.getByRole('button', { name: "Don't save" })).click();
  await expect(tab).toBeHidden();
  expect(await app.readFile('notes.md')).toBe(seedText('notes.md'));
});

test('tabs switch by click and arrow keys; Delete closes a clean tab', async ({ app, page }) => {
  await app.openFile('notes.md');
  await app.openFile('pages.md');
  await expect(app.tab('pages.md')).toHaveAttribute('aria-selected', 'true');

  await app.tab('notes.md').click();
  await expect(app.tab('notes.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.rendered()).toContainText('Bravo charlie delta.');

  await page.keyboard.press('ArrowRight');
  await expect(app.tab('pages.md')).toBeFocused();
  await expect(app.rendered()).toContainText('Paragraph 1.1.');

  await page.keyboard.press('Delete');
  await expect(app.tab('pages.md')).toBeHidden();
  await expect(app.tab('notes.md')).toHaveAttribute('aria-selected', 'true');
});

test('Quick open (Ctrl+P) opens a file by name', async ({ app, page }) => {
  await page.keyboard.press('ControlOrMeta+p');

  const input = page.getByRole('combobox', { name: 'File name' });

  await expect(input).toBeFocused();
  await page.keyboard.type('pages');
  await expect(page.getByRole('listbox', { name: 'Files' }).getByRole('option').first()).toContainText('pages.md');
  await page.keyboard.press('Enter');
  await expect(app.tab('pages.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.rendered()).toContainText('Paragraph 1.1.');
});

test('folder search (Ctrl+Shift+F) finds a line and opens its file', async ({ app, page }) => {
  knownGap(app, 'wysiwyg', 189, 'a search result switches rich text to the Markdown view instead of showing the block');

  await page.keyboard.press('ControlOrMeta+Shift+f');

  const search = page.getByRole('search', { name: 'Search in folder' });

  await expect(search.getByRole('textbox', { name: 'Search in folder' })).toBeFocused();
  await page.keyboard.type('charlie delta');

  const results = page.getByRole('region', { name: 'Search results' });

  await expect(results.getByRole('heading', { name: /notes\.md/ })).toBeVisible();
  await expect(results.getByRole('heading')).toHaveCount(1);
  await results.getByRole('button', { name: /charlie delta/ }).click();
  await expect(app.tab('notes.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.rendered()).toContainText('Bravo charlie delta.');
});

test('a relative image shows when reading it is slow', async ({ app, page }) => {
  // A busy disk: the image file takes a while, so the browser's own failed load of the
  // relative address comes first
  await page.evaluate(() => {
    const getFile = FileSystemFileHandle.prototype.getFile;

    FileSystemFileHandle.prototype.getFile = async function slowGetFile(this: FileSystemFileHandle) {
      if (this.name.endsWith('.png')) await new Promise((resolve) => setTimeout(resolve, 1_500));

      return getFile.call(this);
    };
  });
  await app.openFile('fixture.md');

  for (const name of ['Relative image', 'HTML image']) {
    const image = app.rendered().getByRole('img', { name, exact: true });

    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
  }
});

test('the file tree shows only documents (#198)', async ({ app }) => {
  for (const name of ['fixture.md', 'notes.md', 'flow.mmd', 'assets']) await expect(app.treeItem(name)).toBeVisible();

  await expect(app.treeItem('ignored.txt')).toHaveCount(0);

  await app.treeItem('assets').click();
  await expect(app.treeItem('pic.png')).toHaveCount(0);
});

test('the start screen lists recent folders and files (#17), and they reopen', async ({ app, page }) => {
  await app.openFile('notes.md');
  await page.keyboard.press('Alt+w');
  await expect(app.tab('notes.md')).toBeHidden();
  await sessionSaved(page, (session) => session.paths.length === 0);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'A blank page' })).toBeVisible();

  const folders = page.getByRole('region', { name: 'Recent folders' });
  const files = page.getByRole('region', { name: 'Recent files' });

  await expect(folders.getByRole('button', { name: FOLDER_NAME, exact: true })).toBeVisible();
  await files.getByRole('button', { name: 'notes.md', exact: true }).click();
  await expect(app.tab('notes.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.rendered()).toContainText('Bravo charlie delta.');
});

test('a reload brings back the folder and documents', async ({ app, page }) => {
  await app.openFile('notes.md');
  await app.openFile('pages.md');
  await sessionSaved(page, (session) => session.paths.length === 2);
  await page.reload();

  // The test folder's handle needs no permission prompt, so the session comes back without the offer
  await expect(app.tab('notes.md')).toBeVisible();
  await expect(app.tab('pages.md')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: FOLDER_NAME, exact: true })).toBeVisible();
  await expect(app.rendered()).toContainText('Paragraph 1.1.');
});
