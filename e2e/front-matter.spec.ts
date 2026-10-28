// YAML front matter (#3): a `---` block on the first line shows as one collapsed "Front matter" block
// listing its keys, in the preview and in rich text opened on its own, instead of a rule and a heading.
// Rich text shows it read-only and saves it byte for byte; exports leave it out. folder/front-matter.md
// has trailing spaces after the opening fence, which remark would drop if the block were rewritten.
import JSZip from 'jszip';
import type { Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText, seedText, type SavedFile } from './fixtures';

const FILE = 'front-matter.md';

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile(FILE);
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('front matter shows as one collapsed block with its keys @parity @rich-text', async ({ app }) => {
  const rendered = app.rendered();
  const block = rendered.locator('details.front-matter');

  await expect(block).toHaveCount(1);
  await expect(block.locator('summary')).toHaveText('Front mattertitle, date, tags');
  await expect(block).not.toHaveAttribute('open');
  await expect(block.locator('pre')).toBeHidden();

  // Not a rule and a setext heading made from the last YAML line
  await expect(rendered.locator('hr')).toHaveCount(0);
  await expect(rendered.locator('h2')).toHaveCount(0);
  await expect(rendered.locator('h1')).toHaveText('Front matter heading');

  await block.locator('summary').click();
  await expect(block).toHaveAttribute('open');
  await expect(block.locator('pre')).toContainText('title: Front matter fixture');
  await expect(block.locator('pre')).toContainText('# a YAML comment');

  if (app.editorMode === 'wysiwyg') await expect(block).toContainText('Edit front matter in Markdown mode.');
});

test('the Contents panel lists only the real headings @parity', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Shift+L');

  const sections = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');

  await expect(sections).toHaveCount(1);
  await expect(sections).toHaveText('Front matter heading');
});

test('an open block stays open while the document is edited @parity @rich-text', async ({ app, page }) => {
  const block = app.rendered().locator('details.front-matter');

  await block.locator('summary').click();
  await expect(block).toHaveAttribute('open');

  await app.placeCursorAfter('A paragraph after the front matter.');
  await page.keyboard.type(' More.');
  await expect(app.rendered()).toContainText('A paragraph after the front matter. More.');
  await expect(block).toHaveAttribute('open');
});

test('editing below the front matter keeps it byte for byte @parity @rich-text', async ({ app, page }) => {
  await app.placeCursorAfter('A paragraph after the front matter.');
  await page.keyboard.type(' More.');
  await expect(app.rendered()).toContainText('A paragraph after the front matter. More.');

  await app.save();
  expect(await app.readFile(FILE)).toBe(seedText(FILE).replace('A paragraph after the front matter.', 'A paragraph after the front matter. More.'));
});

test('saving without edits leaves the file byte-identical @rich-text', async ({ app, page }) => {
  const before = await app.fileModified(FILE);

  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => app.fileModified(FILE)).toBeGreaterThan(before);
  expect(await app.readFile(FILE)).toBe(seedText(FILE));
});

async function exported(page: Page, format: string): Promise<SavedFile> {
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: format }).click();

  return downloadOf(page, () => dialog.getByRole('button', { name: `Export ${format}` }).click());
}

test('Web page and Word exports leave the front matter out @export', async ({ page }) => {
  const html = (await exported(page, 'Web page')).bytes.toString('utf8');

  expect(html).toContain('<title>Front matter heading</title>');
  expect(html).not.toContain('<details');
  expect(html).not.toContain('title: Front matter fixture');

  const zip = await JSZip.loadAsync((await exported(page, 'Word')).bytes);
  const body = (await zip.file('word/document.xml')?.async('string')) ?? '';

  expect(body).toContain('Front matter heading');
  expect(body).not.toContain('title: Front matter fixture');
});
