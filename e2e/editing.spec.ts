// Editing: toolbar formatting and its pressed state, find and replace, the command palette,
// focus mode, page width and smart typography, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText, knownGap, type MarkloomApp } from './fixtures';

function formatting(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Formatting' });
}

/** Runs a command palette entry by its exact label */
async function runCommand(page: Page, label: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill(label);
  await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option').first()).toContainText(label, { timeout: 3_000 });
  await page.keyboard.press('Enter');
}

/** The source line (Markdown) or block (rich text) that shows `text` */
function block(app: MarkloomApp, text: string): Locator {
  return app.editorMode === 'split'
    ? app.editingSurface().locator('.cm-line', { hasText: text })
    : app.rendered().locator('p', { hasText: text });
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('notes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('Bold formats the selection and shows as pressed', async ({ app, page }) => {
  const bold = formatting(page).getByRole('button', { name: /^Bold/ });

  await app.selectLine('Alpha');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await bold.click();

  await expect(app.rendered().locator('strong')).toHaveText('Alpha');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');

  await app.placeCursorAfter('Bravo charlie');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
});

test('Strikethrough shows as pressed inside struck text (#207)', async ({ app, page }) => {
  knownGap(app, 'split', 207, 'the Markdown source parses no GFM, so Strikethrough never shows as pressed');

  if (app.editorMode === 'split') {
    await app.placeCursorAfter('Some');
    await page.keyboard.press('Home');

    // Into "struck", past "Some ~~st"
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  } else {
    // The middle of the struck word
    await app.rendered().locator(':is(del, s)', { hasText: 'struck' }).click();
  }

  await expect(formatting(page).getByRole('button', { name: /^Strikethrough/ })).toHaveAttribute('aria-pressed', 'true');
});

test('find and replace', async ({ app, page }) => {
  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+h');

  const bar = page.getByRole('search', { name: 'Find in document' });

  await expect(bar.getByRole('textbox', { name: 'Find' })).toBeFocused();
  await page.keyboard.type('charlie');
  await expect(bar).toContainText('1 of 1');

  await bar.getByRole('textbox', { name: 'Replace with' }).fill('echo');
  await bar.getByRole('button', { name: 'Replace all' }).click();
  await expect(app.rendered()).toContainText('Bravo echo delta.');
  await expect(bar).toContainText('No matches');

  await bar.getByRole('textbox', { name: 'Find' }).press('Escape');
  await expect(bar).toBeHidden();
});

test('the command palette runs a command', async ({ page }) => {
  await runCommand(page, 'Show contents');

  const sections = page.getByRole('navigation', { name: 'Sections' });

  await expect(sections).toBeVisible();
  await expect(sections.getByRole('button', { name: 'Notes' })).toBeVisible();
});

test('page width from the palette', async ({ page }) => {
  await runCommand(page, 'Page width: Wide');
  await expect(page.locator('[data-page-width="wide"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Page width: Wide/ })).toBeVisible();
});

test('focus mode hides the chrome and Escape brings it back (#205)', async ({ app, page }) => {
  const chrome = [
    page.getByRole('toolbar', { name: 'Document actions' }),
    page.getByRole('tablist', { name: 'Open documents' }),
    formatting(page),
    page.getByRole('complementary', { name: 'Sidebar' }),
  ];

  await app.placeCursorAfter('Alpha');
  await page.keyboard.press('ControlOrMeta+Shift+Enter');

  for (const part of chrome) await expect(part).toBeHidden();
  await expect(app.editingSurface()).toBeVisible();
  await page.keyboard.type(' typed in focus');
  // Markdown mode shows the source alone, without the preview
  await expect(app.editingSurface()).toContainText('Alpha typed in focus');

  await page.keyboard.press('Escape');

  for (const part of chrome) await expect(part).toBeVisible();
});

test('focus mode dims every block but the current one (#206)', async ({ app, page }) => {
  knownGap(app, 'both', 206, 'focus mode has no paragraph dimming yet');

  await app.placeCursorAfter('Alpha');
  await page.keyboard.press('ControlOrMeta+Shift+Enter');

  const opacity = (locator: Locator) => locator.evaluate((element) => Number(getComputedStyle(element).opacity));

  await expect.poll(() => opacity(block(app, 'Bravo charlie')), { timeout: 3_000 }).toBeLessThan(1);
  expect(await opacity(block(app, 'Alpha'))).toBe(1);
});

test('smart typography can be turned off (#208)', async ({ app, page }) => {
  knownGap(app, 'both', 208, 'there is no Smart typography setting yet');

  await runCommand(page, 'Smart typography');
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const html = file.bytes.toString('utf8');

  expect(html).toContain('-- dash (c)');
  expect(html).not.toContain('“quoted”');
});
