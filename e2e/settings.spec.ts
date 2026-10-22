// Settings window (#154): how it opens and closes, and that each Editor control drives the same
// setting as the toolbar and status bar, in both editors.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' });
}

async function openSettings(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = settingsDialog(page);
  await expect(dialog).toBeVisible();

  return dialog;
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(settingsDialog(page)).toBeHidden();
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('fixture.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('opens by key, title bar and palette; Escape returns focus', async ({ app, page }) => {
  await app.editingSurface().click();
  await openSettings(page);
  await closeSettings(page);
  await expect(app.editingSurface()).toBeFocused();

  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: /^Settings/ }).click();
  await expect(settingsDialog(page)).toBeVisible();
  await expect(settingsDialog(page).getByRole('tab', { name: 'Editor', selected: true })).toBeVisible();
  await closeSettings(page);

  await page.keyboard.press('ControlOrMeta+Shift+P');
  await page.keyboard.type('Settings');
  await page.keyboard.press('Enter');
  await expect(settingsDialog(page)).toBeVisible();
});

test('the Shortcuts window lists Settings', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Slash');
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });

  await expect(shortcuts).toContainText('Settings');
});

test('line numbers and wrap turn off at once and stay off', async ({ app, page }) => {
  // An edit made before the editor is reconfigured can still be undone after it
  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('zqx');

  const dialog = await openSettings(page);

  await dialog.getByRole('checkbox', { name: 'Line numbers' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Wrap long lines' }).uncheck();
  await closeSettings(page);
  await expect(app.editingSurface()).toContainText('zqx');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(app.editingSurface()).not.toContainText('zqx');

  const expectOff = async () => {
    if (app.editorMode === 'split') {
      await expect(page.locator('.cm-lineNumbers')).toHaveCount(0);
      await expect(app.editingSurface()).not.toHaveClass(/cm-lineWrapping/);

      return;
    }

    const reopened = await openSettings(page);
    await expect(reopened.getByRole('checkbox', { name: 'Line numbers' })).not.toBeChecked();
    await expect(reopened.getByRole('checkbox', { name: 'Wrap long lines' })).not.toBeChecked();
    await closeSettings(page);
  };

  await expectOff();
  await page.reload();
  await expect(app.editingSurface()).toBeVisible();
  await expectOff();
});

test('scroll panes together follows the toolbar', async ({ app, page }) => {
  const dialog = await openSettings(page);
  const checkbox = dialog.getByRole('checkbox', { name: 'Scroll panes together' });

  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await closeSettings(page);

  if (app.editorMode === 'split') {
    const toggle = page.getByRole('button', { name: 'Scroll panes together: off' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Scroll panes together: on' })).toBeVisible();
    await expect((await openSettings(page)).getByRole('checkbox', { name: 'Scroll panes together' })).toBeChecked();

    return;
  }

  // Rich text has no toolbar button; the choice is still kept
  await page.reload();
  await expect(app.editingSurface()).toBeVisible();
  await expect((await openSettings(page)).getByRole('checkbox', { name: 'Scroll panes together' })).not.toBeChecked();
});

test('page width', async ({ page }) => {
  const dialog = await openSettings(page);

  await dialog.getByRole('combobox', { name: 'Page width' }).selectOption({ label: 'Wide' });
  await closeSettings(page);
  await expect(page.locator('[data-page-width="wide"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Page width: Wide/ })).toBeVisible();
});

test('auto-save interval', async ({ app, page }) => {
  const dialog = await openSettings(page);

  await dialog.getByRole('checkbox', { name: 'Auto-save' }).check();
  await dialog.getByRole('combobox', { name: 'Save after' }).selectOption({ label: '10 seconds' });
  await closeSettings(page);

  await expect(page.getByRole('button', { name: /^Auto-save on, 10 seconds after you stop typing/ })).toBeVisible();

  const titleBar = page.getByRole('toolbar', { name: 'Document actions' });
  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' autosaved');
  await expect(titleBar.getByText('Edited', { exact: true })).toBeVisible();
  await expect(titleBar.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
});
