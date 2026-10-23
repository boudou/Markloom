// Smart typography (#208): on by default, the preview and every export turn "a" -- b (c) into
// “a” – b ©; the palette turns it off, after which the preview re-renders at once and Web page,
// PDF, Word and Copy as rich text carry the text as typed. Heading ids come from the text as
// written either way, and the choice survives a reload. Rich text never applies typography.
import JSZip from 'jszip';
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText } from './fixtures';

declare global {
  interface Window {
    __e2ePrinted?: string;
  }
}

const TYPED = '"a" -- b (c)';

const SMART = '“a” – b ©';

/** The heading "A -- B (c)": its id, which folder/typography.md also links to */
const HEADING_ID = 'a----b-c';

/** Turns the entities an exporter may write back into the characters they stand for */
function unescape(text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&#34;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
}

/** Runs a command palette entry by its exact label */
async function runCommand(page: Page, label: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill(label);
  await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option').first()).toContainText(label, { timeout: 3_000 });
  await page.keyboard.press('Enter');
}

/** Opens the Export dialog on a format, once the previous export has closed it */
async function openExport(page: Page, format: string): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Export' });

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('ControlOrMeta+e');

  await dialog.getByRole('radio', { name: format }).click();

  return dialog;
}

async function webPage(page: Page): Promise<string> {
  const dialog = await openExport(page, 'Web page');
  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());

  return unescape(file.bytes.toString('utf8'));
}

/** What the PDF export prints: the print frame's document, kept instead of opening the dialog */
async function printed(page: Page): Promise<string> {
  await page.evaluate(() => {
    window.__e2ePrinted = undefined;
  });
  await page.addInitScript(() => {
    if (window === window.top) return;

    window.print = () => {
      // SAFETY: the print frame is same-origin with the app, so its top window is the app's
      (window.top as Window).__e2ePrinted = document.documentElement.outerHTML;
    };
  });

  const dialog = await openExport(page, 'PDF');

  await expect(dialog.getByText(/^Page 1 of \d+$/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__e2ePrinted ?? null)).not.toBeNull();

  return unescape((await page.evaluate(() => window.__e2ePrinted)) ?? '');
}

/** The text of the Word document's runs */
async function word(page: Page): Promise<string> {
  const dialog = await openExport(page, 'Word');
  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Word' }).click());
  const xml = (await (await JSZip.loadAsync(file.bytes)).file('word/document.xml')?.async('string')) ?? '';

  return unescape(Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (match) => match[1]).join(''));
}

async function copiedHtml(page: Page): Promise<string> {
  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: 'Copy as rich text' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied as rich text' }).last()).toBeVisible({ timeout: 15_000 });

  const html = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();

    return (await item.getType('text/html')).text();
  });

  return unescape(html);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('typography.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('smart typography is on by default and keeps heading ids from the typed text (#208) @editing @export', async ({ app, page }) => {
  // Rich text shows the text as typed; the preview typesets it
  await expect(app.rendered().locator('p').first()).toHaveText(app.editorMode === 'split' ? SMART : TYPED);
  await expect(app.rendered().locator(`[id="${HEADING_ID}"]`)).toBeVisible();

  const html = await webPage(page);

  expect(html).toContain(SMART);
  expect(html).toContain(`id="${HEADING_ID}"`);
  expect(html).toContain(`href="#${HEADING_ID}"`);
});

test('turning smart typography off renders the preview and every export as typed, and is remembered (#208) @editing @export @palette', async ({ app, page, context }) => {
  // Builds the PDF pages and a Word file next to other busy workers
  test.slow();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await runCommand(page, 'Smart typography: off');

  // The preview re-renders at once, without an edit
  await expect(app.rendered().locator('p').first()).toHaveText(TYPED);
  await expect(app.rendered().locator(`[id="${HEADING_ID}"]`)).toBeVisible();

  const html = await webPage(page);

  expect(html).toContain(TYPED);
  expect(html).not.toContain(SMART);
  expect(html).toContain(`id="${HEADING_ID}"`);

  const docx = await word(page);

  expect(docx).toContain(TYPED);
  expect(docx).not.toContain(SMART);

  const copied = await copiedHtml(page);

  expect(copied).toContain(TYPED);
  expect(copied).not.toContain(SMART);

  // Last before the reload: printing leaves the keyboard focus in the print frame
  const pdf = await printed(page);

  expect(pdf).toContain(TYPED);
  expect(pdf).not.toContain(SMART);

  // Still off after a restart: the reopened document renders as typed from its first render
  await page.reload();
  await expect(app.rendered().locator('p').first()).toHaveText(TYPED);
  expect(await webPage(page)).toContain(TYPED);

  // And the palette offers to turn it back on, which typesets the preview again
  await page.keyboard.press('Escape');
  await runCommand(page, 'Smart typography: on');

  if (app.editorMode === 'split') await expect(app.rendered().locator('p').first()).toHaveText(SMART);

  expect(await webPage(page)).toContain(SMART);
});
