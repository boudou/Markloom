// Footnotes (#203): the preview numbers [^1] references and lists the notes at the end with links
// back, exports and Copy as rich text carry them styled, and rich text styles its own footnote
// nodes. folder/footnotes.md has a definition mid-document, references in a paragraph, a callout's
// first line, a list and a table, and a "## fn1" heading that must keep its id.
import type { Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText } from './fixtures';

declare global {
  interface Window {
    __e2ePrinted?: string;
  }
}

/** Every footnote, in the order its first reference appears */
const NOTES = ['First.', 'Second, defined mid-document.', 'From the callout.', 'From the table.'];

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('footnotes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('references show as superscripts and notes as a styled block', async ({ app }) => {
  const rendered = app.rendered();

  await expect(rendered).not.toContainText('[^');

  if (app.editorMode === 'wysiwyg') {
    // Rich text shows each reference's label and keeps each definition where it is written
    const references = rendered.locator('sup[data-type="footnote_reference"]');
    const definitions = rendered.locator('dl[data-type="footnote_definition"]');

    await expect(references).toHaveText(['1', 'note', 'c', '1', 't']);
    await expect(definitions).toHaveCount(NOTES.length);
    await expect(definitions.first()).toContainText('Second, defined mid-document.');

    // Styled by the app's own CSS, which loads without the preview
    expect(await definitions.first().evaluate((dl) => getComputedStyle(dl).display)).toBe('flex');
    expect(await references.first().evaluate((sup) => getComputedStyle(sup).fontWeight)).toBe('600');

    return;
  }

  await expect(rendered.locator('sup.footnote-ref')).toHaveText(['1', '2', '3', '1', '4']);
  await expect(rendered.locator('section.footnotes li')).toHaveCount(NOTES.length);

  for (const [index, note] of NOTES.entries()) {
    await expect(rendered.locator(`section.footnotes li#fn-${index + 1}`)).toContainText(note);
  }
});

test('a callout marker with text after it on its line stays a plain quote', async ({ app }) => {
  // GitHub only makes a callout of a marker alone on its line; the text after it keeps its markup
  const quote = app.rendered().locator('blockquote', { hasText: 'Inline marker' });

  await expect(quote).toHaveText('[!NOTE] Inline marker stays a plain quote.');
  await expect(quote.locator('strong')).toHaveText('Inline marker');
  await expect(quote).not.toHaveAttribute('data-callout');
});

test.describe('preview links', () => {
  test.beforeEach(async ({ app }) => {
    test.skip(app.editorMode !== 'split', 'Rich text shows labels, not links');
  });

  test('a reference jumps to its note and the back-link returns', async ({ app }) => {
    const rendered = app.rendered();
    const first = rendered.locator('sup.footnote-ref a').first();

    await first.click();
    await expect(rendered.locator('li#fn-1')).toBeInViewport();
    await expect(first).not.toBeInViewport();

    await rendered.locator('li#fn-1 a.footnote-backref').first().click();
    await expect(first).toBeInViewport();
  });

  test('ids are unique: a "fn1" heading and a callout reference keep their own', async ({ app }) => {
    const rendered = app.rendered();
    const ids = await rendered.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id));

    expect(new Set(ids).size, ids.join(', ')).toBe(ids.length);
    await expect(rendered.getByRole('heading', { name: 'fn1' })).toHaveAttribute('id', 'fn1');

    // The callout's reference sits on its first line, which the callout rule rewrites
    const calloutRef = rendered.locator('[data-callout="note"] sup.footnote-ref a');

    await expect(calloutRef).toHaveAttribute('id', 'fnref-3');
    await expect(calloutRef).toHaveAttribute('href', '#fn-3');
    await expect(rendered.locator('li#fn-3 a.footnote-backref')).toHaveAttribute('href', '#fnref-3');

    // The second reference to note 1 gets its own back-link
    await expect(rendered.locator('li#fn-1 a.footnote-backref')).toHaveCount(2);
    await expect(rendered.locator('[id="fnref-1:1"]')).toHaveText('1');
  });

  test('scroll sync keeps working past a mid-document definition', async ({ app }) => {
    await app.placeCursorAfter('Paragraph 40 of');
    await expect(app.rendered().getByText('Paragraph 40 of', { exact: false })).toBeInViewport();
  });
});

async function exportedWebPage(page: Page): Promise<string> {
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());

  return file.bytes.toString('utf8');
}

test('Web page and PDF exports carry the footnotes, styled', async ({ page }) => {
  const html = await exportedWebPage(page);

  expect(html).toContain('<section class="footnotes">');
  expect(html).toMatch(/<li id="fn-2" class="footnote-item">[\s\S]*Second, defined mid-document\./);
  expect(html).toContain('href="#fn-1"');
  expect(html).toContain('sup.footnote-ref {');

  // PDF prints the same body: keep what the print frame prints instead of opening the dialog
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
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'PDF' }).click();
  await expect(dialog.getByText(/^Page 1 of \d+$/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__e2ePrinted ?? null)).not.toBeNull();

  const printed = (await page.evaluate(() => window.__e2ePrinted)) ?? '';

  expect(printed).toContain('class="footnotes"');
  expect(printed).toContain('From the table.');
  expect(printed).toContain('.footnote-item { break-inside: avoid; }');
});

test('Copy as rich text pastes the notes without dead links', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: 'Copy as rich text' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied as rich text' })).toBeVisible({ timeout: 15_000 });

  const html = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();

    return (await item.getType('text/html')).text();
  });

  for (const note of NOTES) expect(html).toContain(note);

  expect(html).toMatch(/<sup class="footnote-ref"[^>]*>1<\/sup>/);
  expect(html).not.toContain('footnote-backref');
  expect(html).not.toContain('href="#fn');
});
