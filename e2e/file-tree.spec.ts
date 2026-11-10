// File tree actions (#15): New file and New folder from the Files header and a row's context menu,
// on the test folder in the origin-private file system. The desktop half is in desktop-folder.spec.ts.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, seedText } from './fixtures';

function filesHeader(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Sidebar' });
}

function nameDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/** Fills the name dialog and presses Create */
async function createNamed(page: Page, name: string): Promise<void> {
  await nameDialog(page).getByRole('textbox', { name: 'Name' }).fill(name);
  await nameDialog(page).getByRole('button', { name: 'Create', exact: true }).click();
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('New file creates an empty document, opens it and saves into it @documents', async ({ app, page }) => {
  await filesHeader(page).getByRole('button', { name: 'New file', exact: true }).click();
  await expect(nameDialog(page)).toContainText('In e2e-folder');
  await nameDialog(page).getByRole('textbox', { name: 'Name' }).fill('plan');
  await expect(nameDialog(page)).toContainText('Creates plan.md');
  await nameDialog(page).getByRole('button', { name: 'Create', exact: true }).click();

  await expect(nameDialog(page)).toBeHidden();
  await expect(app.tab('plan.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.treeItem('plan.md')).toBeVisible();
  expect(await app.readFile('plan.md')).toBe('');

  // Focus, not a click: the blank page's start-screen hints lie over an empty document
  await app.editingSurface().focus();
  await page.keyboard.type('Hello');
  await app.save();
  expect(await app.readFile('plan.md')).toContain('Hello');
});

test('the context menu creates a folder inside a folder, and a file inside that @documents', async ({ app, page }) => {
  await app.treeItem('assets').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder…' }).click();
  await expect(nameDialog(page)).toContainText('In assets');
  await createNamed(page, 'drafts');

  await expect(nameDialog(page)).toBeHidden();
  await expect(app.treeItem('drafts')).toBeVisible();
  // Inside assets: indented below it
  await expect(app.treeItem('assets').locator('xpath=following-sibling::*').getByRole('button', { name: 'drafts' })).toBeVisible();

  await app.treeItem('drafts').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New file…' }).click();
  await createNamed(page, 'inside.md');

  await expect(app.tab('inside.md')).toHaveAttribute('aria-selected', 'true');
  await expect(app.treeItem('inside.md')).toBeVisible();
  expect(await app.readFile('assets/drafts/inside.md')).toBe('');
});

test('a file row creates beside the file @documents', async ({ app, page }) => {
  await app.treeItem('notes.md').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New file…' }).click();
  await expect(nameDialog(page)).toContainText('In e2e-folder');
  await createNamed(page, 'beside');

  await expect(app.tab('beside.md')).toBeVisible();
  expect(await app.readFile('beside.md')).toBe('');
});

test('an existing name is refused and the file is left as it was @documents', async ({ app, page }) => {
  await filesHeader(page).getByRole('button', { name: 'New file', exact: true }).click();
  await createNamed(page, 'notes');

  await expect(nameDialog(page).getByRole('alert')).toHaveText('notes.md already exists in e2e-folder');
  expect(await app.readFile('notes.md')).toBe(seedText('notes.md'));

  // A folder's name is taken too
  await nameDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await filesHeader(page).getByRole('button', { name: 'New folder', exact: true }).click();
  await createNamed(page, 'assets');
  await expect(nameDialog(page).getByRole('alert')).toHaveText('assets already exists in e2e-folder');
});

test('a name with a slash cannot be created @documents', async ({ page }) => {
  await filesHeader(page).getByRole('button', { name: 'New file', exact: true }).click();
  await nameDialog(page).getByRole('textbox', { name: 'Name' }).fill('a/b');

  await expect(nameDialog(page).getByRole('alert')).toHaveText("A name can't contain / or \\");
  await expect(nameDialog(page).getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
});
