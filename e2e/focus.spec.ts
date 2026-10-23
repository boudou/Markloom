// Keyboard focus on the writing surface (#164): the ring that shows the editor has focus, and
// focus landing in the new document after a template is applied, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';

/** The element that draws the ring: the source editor in Markdown mode, the page's scroll area in rich text */
function ringOf(app: MarkloomApp): Locator {
  return app.editorMode === 'split' ? app.page.locator('.cm-editor') : app.page.locator('[data-doc-surface]:has(.rt-document)');
}

function templatesButton(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: /^New from template/ });
}

function templatesDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /template/i });
}

/** Picks "Meeting notes" in the open template dialog and checks the new tab's editor has the focus */
async function useMeetingNotes(app: MarkloomApp): Promise<void> {
  const { page } = app;

  await expect(templatesDialog(page)).toBeVisible();
  await page.getByRole('combobox', { name: 'Search templates' }).fill('Meeting notes');
  await expect(page.getByRole('option', { name: /^Meeting notes/, selected: true })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(templatesDialog(page)).toBeHidden();
  await expect(app.tab('Meeting notes')).toHaveAttribute('aria-selected', 'true');
  await expect(app.editingSurface()).toBeFocused();

  await page.keyboard.type('ZZQ');
  await expect(app.rendered()).toContainText('ZZQ');
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('notes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('the writing surface shows a ring while it has focus, and none in focus mode @editing', async ({ app, page }) => {
  const ring = ringOf(app);

  await app.placeCursorAfter('Alpha');
  await expect(ring).toHaveCSS('outline-style', 'solid');
  await expect(ring).toHaveCSS('outline-color', 'rgb(37, 99, 235)');
  await expect(ring).toHaveCSS('outline-width', '2px');
  await expect(ring).toHaveCSS('outline-offset', '-2px');

  await templatesButton(page).focus();
  await expect(ring).toHaveCSS('outline-style', 'none');

  await app.placeCursorAfter('Alpha');
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(app.editingSurface()).toBeFocused();
  await expect(ring).toHaveCSS('outline-style', 'none');
});

test('a template from the title bar takes the focus, so typing goes into it @documents', async ({ app, page }) => {
  await templatesButton(page).click();
  await useMeetingNotes(app);
});

test('a template from the palette takes the focus, so typing goes into it @documents @palette', async ({ app, page }) => {
  await app.placeCursorAfter('Alpha');
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill('New from template');
  await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option').first()).toContainText('New from template', { timeout: 3_000 });
  await page.keyboard.press('Enter');
  await useMeetingNotes(app);
});

test('Escape on the template dialog returns focus to the title bar button @documents', async ({ page }) => {
  await templatesButton(page).click();
  await expect(templatesDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(templatesDialog(page)).toBeHidden();
  await expect(templatesButton(page)).toBeFocused();
});
