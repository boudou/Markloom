// Documents: new, open, edit, save, close with the unsaved-changes prompt, tabs, Quick open,
// folder search and where its results land, Contents clicks, the file tree, recent files and
// folders, and session restore, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, seedText, FOLDER_NAME } from './fixtures';

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

test('new document opens an empty Untitled tab @documents', async ({ app, page }) => {
  await app.openFile('notes.md');
  const before = await tabs(page).count();

  await page.keyboard.press('Alt+n');
  await expect(tabs(page)).toHaveCount(before + 1);
  await expect(tabs(page).and(page.getByRole('tab', { selected: true }))).toHaveText(/^Untitled/);
  await expect(page.getByRole('heading', { name: 'A blank page' })).toBeVisible();
});

test('edit and save writes the file @documents', async ({ app, page }) => {
  await app.openFile('notes.md');
  await app.placeCursorAfter('The last paragraph of notes.');
  await page.keyboard.type(' Saved words.');
  await expect(titleBar(page).getByText('Edited', { exact: true })).toBeVisible();

  await app.save();
  expect(await app.readFile('notes.md')).toBe(seedText('notes.md').replace('notes.', 'notes. Saved words.'));
});

test('closing an edited tab asks first; Cancel keeps it and focus stays off the close button (#187) @documents', async ({ app, page }) => {
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

test('tabs switch by click and arrow keys; Delete closes a clean tab @documents', async ({ app, page }) => {
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

test('Quick open (Ctrl+P) opens a file by name @documents @palette', async ({ app, page }) => {
  await page.keyboard.press('ControlOrMeta+p');

  const input = page.getByRole('combobox', { name: 'File name' });

  await expect(input).toBeFocused();
  await page.keyboard.type('pages');
  await expect(page.getByRole('listbox', { name: 'Files' }).getByRole('option').first()).toContainText('pages.md');
  await page.keyboard.press('Enter');
  await expect(app.tab('pages.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.rendered()).toContainText('Paragraph 1.1.');
});

/** Where the rich-text caret is: the text of its paragraph, list item or table row, or its line of code */
function caretText(page: Page, holder: 'p' | 'li' | 'tr' | 'code'): Promise<string | null> {
  return page.evaluate((selector) => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const container = element?.closest(selector);

    if (!selection || !node || !container) return null;

    if (selector !== 'code') return container.textContent;

    // The code block's text, cut at the caret's line
    const text = container.textContent ?? '';
    const range = document.createRange();

    range.setStart(container, 0);
    range.setEnd(node, selection.anchorOffset);

    const offset = range.toString().length;
    const start = text.lastIndexOf('\n', offset - 1) + 1;
    const end = text.indexOf('\n', offset);

    return text.slice(start, end === -1 ? undefined : end);
  }, holder);
}

test('folder search (Ctrl+Shift+F) finds a line and opens its file @documents', async ({ app, page }) => {
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

  // The result lands on its line in Markdown, and on its block in rich text (#189)
  if (app.editorMode === 'split') {
    await expect(page.locator('.cm-activeLine')).toHaveText('Bravo charlie delta.');

    return;
  }

  await expect(app.rendered()).toBeFocused();
  await expect.poll(() => caretText(page, 'p')).toBe('Bravo charlie delta.');
});

// Each search lands below something rich text keeps as its own block (definitions, a raw HTML
// block, a diagram) or inside a list, a table or a code block
const LANDINGS = [
  { query: 'Last paragraph', file: 'references.md', holder: 'p', caret: /^Last paragraph\.$/ },
  { query: 'Paragraph 12 of', file: 'footnotes.md', holder: 'p', caret: /^Paragraph 12 of the footnotes fixture/ },
  { query: 'After the HTML', file: 'html.md', holder: 'p', caret: /^After the HTML\.$/ },
  { query: 'Open task', file: 'fixture.md', holder: 'li', caret: /^(?!.*Done task).*Open task/ },
  { query: 'Loom 5', file: 'pages.md', holder: 'tr', caret: /Loom 5/ },
  { query: 'warp 7', file: 'pages.md', holder: 'code', caret: /^ {2}threads\.push\('warp 7'\);$/ },
] as const;

test('a search result lands on its line, in rich text on its block (#189) @documents @rich-text', async ({ app, page }) => {
  const input = page.getByRole('textbox', { name: 'Search in folder' });
  const results = page.getByRole('region', { name: 'Search results' });

  for (const { query, file, holder, caret } of LANDINGS) {
    await page.keyboard.press('ControlOrMeta+Shift+f');
    await expect(input).toBeFocused();
    await input.fill(query);
    await results.getByRole('button', { name: new RegExp(query) }).first().click();
    await expect(app.tab(file)).toHaveAttribute('aria-selected', 'true');

    if (app.editorMode === 'split') {
      await expect(page.locator('.cm-activeLine')).toContainText(query);
      continue;
    }

    await expect(app.rendered()).toBeFocused();
    await expect.poll(() => caretText(page, holder), { message: query }).toMatch(caret);
  }
});

test('a search result in rich text shows its block, and Markdown mode does not jump there afterwards (#189) @documents', async ({ app, page }) => {
  test.skip(app.editorMode !== 'split', 'switching to Markdown mounts the preview, which rich text alone must never do');

  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(page.locator('[data-doc-surface] .rt-document')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+f');
  await expect(page.getByRole('textbox', { name: 'Search in folder' })).toBeFocused();
  await page.keyboard.type('Paragraph 4.4');
  await page.getByRole('region', { name: 'Search results' }).getByRole('button', { name: /Paragraph 4\.4/ }).click();

  await expect(app.tab('pages.md')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-doc-surface] .rt-document p', { hasText: 'Paragraph 4.4.' })).toBeInViewport();

  await page.getByRole('group', { name: 'Editing mode' }).getByRole('button', { name: 'Markdown' }).click();
  await expect(page.locator('.cm-activeLine')).toHaveText('# Pages fixture');
  expect(await page.locator('.cm-scroller').evaluate((scroller) => scroller.scrollTop)).toBe(0);
});

test('a Contents click puts the cursor on the heading (#189) @documents', async ({ app, page }) => {
  await app.openFile('pages.md');
  await page.keyboard.press('ControlOrMeta+Shift+L');

  const section = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Section 4' });

  await section.click();
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toContainText('H2');
  await expect(section).toBeFocused();
});

test('a relative image shows when reading it is slow @documents @images', async ({ app, page }) => {
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

test('the file tree shows only documents (#198) @documents', async ({ app }) => {
  for (const name of ['fixture.md', 'notes.md', 'flow.mmd', 'assets']) await expect(app.treeItem(name)).toBeVisible();

  await expect(app.treeItem('ignored.txt')).toHaveCount(0);

  await app.treeItem('assets').click();
  await expect(app.treeItem('pic.png')).toHaveCount(0);
});

test('the start screen lists recent folders and files (#17), and they reopen @documents', async ({ app, page }) => {
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

test('a reload brings back the folder and documents @documents', async ({ app, page }) => {
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

/** The names of the unsaved drafts kept in IndexedDB (written about a second after typing stops) */
function draftNames(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('markloom-drafts');

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains('drafts')) {
            db.close();
            resolve([]);

            return;
          }

          const all = db.transaction('drafts').objectStore('drafts').getAll();

          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result.map((draft: { name: string }) => draft.name));
          };
        };
      })
  );
}

test('new documents are numbered and a restored draft keeps its name (#171) @documents', async ({ app, page }) => {
  await app.openFile('notes.md');
  await page.keyboard.press('Alt+n');
  await page.keyboard.press('Alt+n');
  await expect(app.tab('Untitled')).toBeVisible();
  await expect(app.tab('Untitled 2')).toHaveAttribute('aria-selected', 'true');

  // Focus, not a click: the blank page's start-screen hints lie over an empty document
  await app.editingSurface().focus();
  await page.keyboard.type('Draft words.');
  await expect.poll(() => draftNames(page)).toEqual(['Untitled 2']);
  await sessionSaved(page, (session) => session.paths.length === 1);
  await page.reload();

  await expect(app.tab('Untitled 2')).toHaveAttribute('aria-selected', 'true');
  await expect(app.tab('notes.md')).toBeVisible();
  await expect(app.rendered()).toContainText('Draft words.');
});

test('a template opens under its own name (#171) @documents', async ({ app, page }) => {
  await titleBar(page).getByRole('button', { name: /^New from template/ }).click();
  await page.getByRole('combobox', { name: 'Search templates' }).fill('Meeting notes');
  await expect(page.getByRole('option', { name: /^Meeting notes/, selected: true })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(app.tab('Meeting notes')).toHaveAttribute('aria-selected', 'true');
});

test('Export and Copy as rich text read the command table (#171) @documents @export @palette', async ({ app, page }) => {
  await expect(titleBar(page).getByRole('button', { name: /^Export to Word, PDF, Web page, Markdown or images \(.+E\)$/ })).toBeVisible();

  const copy = titleBar(page).getByRole('button', { name: /^Copy as rich text/ });

  await app.openFile('notes.md');
  await expect(copy).toBeEnabled();

  // A diagram file publishes no editor commands: the button and the palette row go together
  await app.treeItem('flow.mmd').click();
  await expect(app.tab('flow.mmd')).toHaveAttribute('aria-selected', 'true');
  await expect(copy).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill('Copy as rich text');
  await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option', { name: /^Copy as rich text/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await app.tab('notes.md').click();
  await expect(copy).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill('Copy as rich text');
  await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option', { name: /^Copy as rich text/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
});
