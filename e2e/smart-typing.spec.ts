// Smart typing (#12): brackets close as you type and, when switched on, quotes turn curly in the
// document text, the same in both editors. Smart typography (render only) is in typography.spec.ts.
import type { Locator, Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';

const LAST_LINE = 'The last paragraph of notes.';

async function openSettings(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  return dialog;
}

async function setOption(page: Page, label: string, on: boolean): Promise<void> {
  const dialog = await openSettings(page);

  await dialog.getByRole('checkbox', { name: label }).setChecked(on);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/** Starts a new line (Markdown) or paragraph (rich text) after the document's last one */
async function newLine(app: MarkloomApp): Promise<void> {
  await app.placeCursorAfter(LAST_LINE);
  await app.page.keyboard.press('Enter');
}

/** Saves and returns the lines of notes.md as written */
async function savedLines(app: MarkloomApp): Promise<string[]> {
  await app.save();

  return (await app.readFile('notes.md')).split(/\r?\n/);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('notes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('an opening bracket gets its closer, and typing the closer steps over it @editing @rich-text', async ({ app, page }) => {
  await newLine(app);
  await page.keyboard.type('(a');
  await expect(app.editingSurface()).toContainText('(a)');

  await page.keyboard.type(')');
  await expect(app.editingSurface()).not.toContainText('(a))');

  const lines = await savedLines(app);

  expect(lines).toContain('(a)');
});

test('Backspace in an empty pair deletes both brackets @editing @rich-text', async ({ app, page }) => {
  await newLine(app);
  await page.keyboard.type('zq(');
  await page.keyboard.press('Backspace');

  const lines = await savedLines(app);

  expect(lines).toContain('zq');
  expect(lines.join('\n')).not.toMatch(/zq[()]/);
});

test('an opening bracket wraps the selection and keeps it selected @editing @rich-text', async ({ app, page }) => {
  await newLine(app);
  await page.keyboard.type('word');
  await expect(app.editingSurface()).toContainText('word');
  // One keystroke for the whole word: four Shift+ArrowLeft presses sometimes left a letter out in rich text
  await page.keyboard.press('Shift+Home');

  await expect(page.getByRole('contentinfo').getByText('1 word, 4 characters selected')).toBeVisible();
  await page.keyboard.type('[');
  // Typing replaces what is still selected: the word, not the brackets
  await page.keyboard.type('X');

  // Rich text escapes a typed bracket
  expect(await savedLines(app)).toContain(app.editorMode === 'split' ? '[X]' : '\\[X]');
});

test('with Close brackets as you type off, brackets are typed alone @editing @rich-text @settings', async ({ app, page }) => {
  await setOption(page, 'Close brackets as you type', false);
  await newLine(app);
  await page.keyboard.type('(a');

  expect(await savedLines(app)).toContain('(a');
});

test('quotes stay straight by default @editing @rich-text', async ({ app, page }) => {
  await newLine(app);
  await page.keyboard.type(`"Hi" it's`);

  expect(await savedLines(app)).toContain(`"Hi" it's`);
});

test('with Curly quotes as you type on, quotes turn curly and Backspace straightens one @editing @rich-text @settings', async ({ app, page }) => {
  await setOption(page, 'Curly quotes as you type', true);
  await newLine(app);
  await page.keyboard.type(`"Hi" it's don'`);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('t');

  expect(await savedLines(app)).toContain(`“Hi” it’s don't`);
});

test('curly quotes skip inline code, math and link destinations @editing @rich-text @settings', async ({ app, page }) => {
  await setOption(page, 'Curly quotes as you type', true);
  await newLine(app);
  await page.keyboard.type("`it's`");

  if (app.editorMode === 'wysiwyg') {
    await expect(app.rendered().locator('code', { hasText: "it's" })).toBeVisible();
    expect(await savedLines(app)).toContain("`it's`");

    return;
  }

  await page.keyboard.type(` $f'$ [a](b "t")`);

  expect(await savedLines(app)).toContain(`\`it's\` $f'$ [a](b "t")`);
});

test('both settings are remembered after a reload @settings', async ({ page }) => {
  await setOption(page, 'Close brackets as you type', false);
  await setOption(page, 'Curly quotes as you type', true);
  await page.reload();

  const dialog = await openSettings(page);

  await expect(dialog.getByRole('checkbox', { name: 'Close brackets as you type' })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Curly quotes as you type' })).toBeChecked();
});
