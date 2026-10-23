// Reference-style links (#186): folder/references.md resolves the same in the preview and in rich
// text opened on its own; in rich text an edit keeps `[docs][d]`, `[Guide]`, `[guide][]`,
// `![logo][img]` and every definition as written (#178), and deleting a definition turns its
// references into inline links. Also the emptied heading (#169) and no `<br />` (#152).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, FOLDER_NAME, type MarkloomApp } from './fixtures';

const FILE = 'references.md';

const ORIGINAL = readFileSync(join(import.meta.dirname, 'folder', FILE), 'utf8');

/** The file as saved in the test folder, or null while a save is writing it */
function savedFile(page: Page): Promise<string | null> {
  return page.evaluate(
    async ([folderName, fileName]) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);

      try {
        return await (await (await folder.getFileHandle(fileName)).getFile()).text();
      } catch {
        return null;
      }
    },
    [FOLDER_NAME, FILE] as const
  );
}

/** Saves, then waits until the file holds `expected` */
async function expectSaved(app: MarkloomApp, expected: string): Promise<void> {
  await app.page.keyboard.press('ControlOrMeta+S');
  await expect.poll(() => savedFile(app.page)).toBe(expected);
}

function richTextOnly(app: MarkloomApp): void {
  test.skip(app.editorMode !== 'wysiwyg', 'editing around references is rich text only');
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile(FILE);
});

// Rich text has to manage without anything only the preview loads
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test('resolves reference links in both editors @rich-text', async ({ app }) => {
  const rendered = app.rendered();

  const docs = rendered.getByRole('link', { name: 'docs', exact: true });
  await expect(docs).toHaveAttribute('href', 'https://example.com/docs');
  await expect(docs).toHaveAttribute('title', 'The docs');
  await expect(rendered.getByRole('link', { name: 'Guide', exact: true })).toHaveAttribute('href', 'https://example.com/guide');
  await expect(rendered.getByRole('link', { name: 'guide', exact: true })).toHaveAttribute('href', 'https://example.com/guide');
  await expect(rendered.getByRole('link', { name: 'nested', exact: true })).toHaveAttribute('href', 'https://example.com/nested');
  // An image either way; under load the preview can still show its "Image not found: logo" stand-in
  await expect(rendered.getByRole('img', { name: /logo$/ })).toHaveCount(1);
  await expect(rendered.locator('a[href^="javascript:"]')).toHaveCount(0);

  if (app.editorMode === 'wysiwyg') {
    const definitions = rendered.locator('.rt-definition');
    await expect(definitions).toHaveCount(5);
    await expect(definitions.filter({ hasText: '[d]:' })).toHaveText('[d]: https://example.com/docs "The docs"');
  } else {
    await expect(rendered).not.toContainText('[d]:');
  }
});

test('editing a paragraph keeps its reference links @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.placeCursorAfter('See the docs and the Guide for details.');
  await page.keyboard.type(' More.');

  await expectSaved(app, ORIGINAL.replace('for details.', 'for details. More.'));
});

test('editing a paragraph with an image reference keeps it @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.placeCursorAfter('A collapsed guide link and a picture.');
  await page.keyboard.type(' Nice.');

  await expectSaved(app, ORIGINAL.replace('[img] picture.', '[img] picture. Nice.'));
});

test('a nested definition stays in its list item @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.placeCursorAfter('Item with a nested link');
  await page.keyboard.type(' here');

  await expectSaved(app, ORIGINAL.replace('[nested][n] link', '[nested][n] link here'));
});

test('deleting a definition turns its references into inline links @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
  await page.keyboard.press('Delete');
  await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
  await expect(app.rendered().getByRole('link', { name: 'docs', exact: true })).toHaveAttribute('href', 'https://example.com/docs');

  await expectSaved(
    app,
    ORIGINAL.replace('[docs][d]', '[docs](https://example.com/docs "The docs")').replace('[d]: https://example.com/docs "The docs"\n', '')
  );

  await app.rendered().click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(app.rendered().locator('.rt-definition')).toHaveCount(5);
  await expectSaved(app, ORIGINAL);
});

test('an emptied heading saves as "# " (#169) @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.placeCursorAfter('References');

  for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');

  await expectSaved(app, ORIGINAL.replace('# References', '# '));
});

test('empty paragraphs add no <br /> (#152) @rich-text', async ({ app, page }) => {
  richTextOnly(app);

  await app.placeCursorAfter('Last paragraph.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tail');
  await page.keyboard.press('ControlOrMeta+S');

  await expect.poll(() => savedFile(page)).toContain('Tail');
  expect(await savedFile(page)).not.toContain('<br');
});
