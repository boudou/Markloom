// Export: PDF prints the pages the export preview shows (#196), and Web page stays one flowing
// page. The browser's print dialog is replaced by a stub that keeps the printed document, which
// is then printed for real by the same engine to count its sheets.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, type MarkloomApp } from './fixtures';

const EDIT = 'Edited right before export';

/** The last paragraph of pages.md */
const LAST_PARAGRAPH = 'The last paragraph of the fixture.';

declare global {
  interface Window {
    __e2ePrinted?: string;
  }
}

/** Adds a paragraph at the end of the document in the active editor, as a user would. */
async function appendParagraph(app: MarkloomApp, text: string): Promise<void> {
  if (app.editorMode === 'split') {
    await app.page.locator('.cm-content').click();
    await app.page.keyboard.press('ControlOrMeta+End');
    await app.page.keyboard.press('Enter');
  } else {
    await app.rendered().getByText(LAST_PARAGRAPH).click();
    await app.page.keyboard.press('End');
  }

  await app.page.keyboard.press('Enter');
  await app.page.keyboard.type(text);
  await expect(app.rendered().locator('p').last()).toHaveText(text);
}

/** The pages of the export preview: the start of each page's text, read from its frame. */
async function previewPages(page: Page): Promise<string[]> {
  return page
    .getByRole('dialog')
    .locator('iframe[title^="Page "]')
    .evaluate((frame) => {
      // SAFETY: the locator matches only the preview's <iframe>, which is same-origin (srcdoc)
      const sections = (frame as HTMLIFrameElement).contentDocument?.querySelectorAll('section.page') ?? [];

      return Array.from(sections, (section) => (section.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
    });
}

async function pageCount(page: Page): Promise<number> {
  const label = page.getByRole('dialog').getByText(/^Page 1 of \d+$/);

  await expect(label).toBeVisible({ timeout: 30_000 });

  return Number((await label.textContent())?.match(/of (\d+)/)?.[1]);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('pages.md');
});

test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test('PDF prints the previewed pages, page for page', async ({ app, page, context }) => {
  // The print iframe is a child frame: keep what it prints instead of opening the dialog
  await page.addInitScript(() => {
    if (window === window.top) return;

    window.print = () => {
      // SAFETY: the print frame is same-origin with the app, so its top window is the app's
      (window.top as Window).__e2ePrinted = `<!doctype html>\n${document.documentElement.outerHTML}`;
    };
  });

  await appendParagraph(app, EDIT);
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog');

  await dialog.getByRole('radio', { name: 'PDF' }).click();

  const count = await pageCount(page);

  expect(count).toBeGreaterThan(2);

  const preview = await previewPages(page);

  expect(preview).toHaveLength(count);

  // Image shows the same layout
  await dialog.getByRole('radio', { name: 'Image' }).click();
  expect(await pageCount(page)).toBe(count);
  await dialog.getByRole('radio', { name: 'PDF' }).click();

  await dialog.getByRole('button', { name: 'Export PDF' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__e2ePrinted ?? null)).not.toBeNull();

  const printed = (await page.evaluate(() => window.__e2ePrinted)) ?? '';

  expect(printed).toContain('@page { size: A4 portrait; margin: 0; }');
  // The edit made just before opening the dialog ends the last page
  expect(printed).toMatch(/<p[^>]*>Edited right before export<\/p>\s*<\/section>\s*<\/body>/);

  const printedPages = await page.evaluate((html) => {
    const sections = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section.page');

    return Array.from(sections, (section) => (section.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
  }, printed);

  expect(printedPages).toEqual(preview);

  // Print the same document: one sheet per page, no blank page at the end
  const printer = await context.newPage();

  await printer.setContent(printed);
  await printer.evaluate(() => document.fonts.ready);

  const pdf = (await printer.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');

  expect(pdf.match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(count);
  await printer.close();
});

test('Web page export stays one flowing page', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog');

  await dialog.getByRole('radio', { name: 'Web page' }).click();
  await expect(dialog.getByText(/^Page 1 of/)).toHaveCount(0);

  const download = page.waitForEvent('download');

  await dialog.getByRole('button', { name: 'Export Web page' }).click();

  const path = await (await download).path();
  const html = readFileSync(path, 'utf8');

  expect(html).toContain('<main class="document">');
  expect(html).not.toContain('class="page"');
  expect(html).toContain('Paragraph 6.5.');
});
