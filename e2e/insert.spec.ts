// Block inserts (#162): a table, code block or divider goes after the block that holds the cursor,
// never inside it, and leaves the cursor where the next thing typed is its own paragraph. The Link
// button fills in the link text first and the address second, with no placeholder left over.
import type { Locator } from '@playwright/test';
import { test, expect, type MarkloomApp } from './fixtures';

const NEW_TABLE_HEADER = '| Column | Column | Column |';

function markdownOnly(reason: string): void {
  test.skip(test.info().project.name === 'rich-text', reason);
}

/** Whether `later` comes after `earlier` in document order */
async function follows(later: Locator, earlier: Locator): Promise<boolean> {
  const earlierElement = await earlier.elementHandle();

  return later.evaluate(
    (element, other) => other !== null && (other.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    earlierElement
  );
}

function fruitTable(app: MarkloomApp): Locator {
  return app.rendered().locator('table', { has: app.page.locator('th', { hasText: /^\s*Fruit\s*$/ }) });
}

function paragraph(app: MarkloomApp, text: string): Locator {
  return app.rendered().locator('p', { hasText: text }).first();
}

async function expectFruitTableIntact(app: MarkloomApp): Promise<void> {
  await expect(fruitTable(app).locator('th')).toHaveText(['Fruit', 'Colour']);
  await expect(fruitTable(app).locator('td').first()).toHaveText('Lime');
}

async function expectNotInCell(app: MarkloomApp, text: string): Promise<void> {
  await expect(app.rendered().locator('td, th', { hasText: text })).toHaveCount(0);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('insert.md');
});

// Rich text has to manage without anything only the preview loads (a library, its CSS, a cache)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test('Insert > Table twice gives two separate tables, then a paragraph', async ({ app, page }) => {
  await app.placeCursorAfter('Intro paragraph.');
  await app.insert('Table');
  await app.insert('Table');
  await page.keyboard.type('After tables');

  const tables = app.rendered().locator('table');
  const after = paragraph(app, 'After tables');

  await expect(tables).toHaveCount(3);
  await expect(after).toBeVisible();
  await expectNotInCell(app, 'After tables');
  await expect.poll(() => follows(after, tables.nth(1))).toBe(true);
  await expect.poll(() => follows(fruitTable(app), after)).toBe(true);
  await expectFruitTableIntact(app);

  if (app.editorMode !== 'split') return;

  const lines = await app.sourceLines();
  const first = lines.indexOf(NEW_TABLE_HEADER);
  const second = lines.indexOf(NEW_TABLE_HEADER, first + 1);

  expect(second - first, 'one empty line between the two tables').toBe(4);
  expect(lines[first + 3]).toBe('');
});

test('Insert > Code block from a table header row lands after the table', async ({ app, page }) => {
  markdownOnly('rich-text code block placement is not part of #162');

  await app.placeCursorAfter('Fruit');
  await app.insert('Code block');
  await page.keyboard.type('x = 1');

  const code = app.rendered().locator('pre', { hasText: 'x = 1' });

  await expect(code).toBeVisible();
  await expectFruitTableIntact(app);
  await expect.poll(() => follows(code, fruitTable(app))).toBe(true);
  await expect.poll(() => follows(paragraph(app, 'Closing paragraph.'), code)).toBe(true);
});

test('Insert > Table from a table header row lands after the table', async ({ app, page }) => {
  await app.placeCursorAfter('Fruit');
  await app.insert('Table');
  await page.keyboard.type('Below');

  const tables = app.rendered().locator('table');
  const below = paragraph(app, 'Below');

  await expect(tables).toHaveCount(2);
  await expect(below).toBeVisible();
  await expectFruitTableIntact(app);
  await expectNotInCell(app, 'Below');
  await expect.poll(() => follows(tables.nth(1), fruitTable(app))).toBe(true);
  await expect.poll(() => follows(below, tables.nth(1))).toBe(true);
});

test('Insert > Table at the end of the document leaves the cursor below it', async ({ app, page }) => {
  await app.placeCursorAfter('Closing paragraph.');
  await app.insert('Table');
  await page.keyboard.type('End text');

  const end = paragraph(app, 'End text');

  await expect(end).toBeVisible();
  await expectNotInCell(app, 'End text');
  await expect.poll(() => follows(end, app.rendered().locator('table').last())).toBe(true);
});

test('One undo takes back one inserted table', async ({ app, page }) => {
  await app.placeCursorAfter('Intro paragraph.');
  await app.insert('Table');
  await app.insert('Table');
  await expect(app.rendered().locator('table')).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(app.rendered().locator('table')).toHaveCount(2);
});

test('Insert from inside a code block lands after the fence', async ({ app, page }) => {
  markdownOnly('rich-text code block placement is not part of #162');

  await app.placeCursorAfter('Intro paragraph.');
  await app.insert('Code block');
  await page.keyboard.type('x = 1');
  await app.insert('Divider');

  const code = app.rendered().locator('pre', { hasText: 'x = 1' });
  const divider = app.rendered().locator('hr');

  await expect(code).not.toContainText('---');
  await expect(divider).toHaveCount(1);
  await expect.poll(() => follows(divider, code)).toBe(true);
});

test('Insert > Divider adds exactly one empty line on each side', async ({ app }) => {
  markdownOnly('source lines exist only in Markdown mode');

  await app.placeCursorAfter('Intro paragraph.');
  await app.insert('Divider');

  await expect
    .poll(() => app.sourceLines())
    .toEqual([
      '# Insert fixture',
      '',
      'Intro paragraph.',
      '',
      '---',
      '',
      '| Fruit | Colour |',
      '| ----- | ------ |',
      '| Lime  | Green  |',
      '',
      'Closing paragraph.',
      '',
    ]);
});

test('Link button fills in the text first, then the address', async ({ app, page }) => {
  await app.placeCursorAfter('Closing paragraph.');
  await page.keyboard.type(' ');
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: /^Link/ }).click();

  if (app.editorMode === 'split') {
    await page.keyboard.type('Docs');
    await page.keyboard.press('Tab');
    await page.keyboard.type('https://example.com');
  } else {
    await page.getByLabel('Address').fill('https://example.com');
    await page.getByLabel('Text to show').fill('Docs');
    await page.getByRole('button', { name: 'Insert link' }).click();
  }

  await expect(app.rendered().getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com');
  await expect(app.rendered()).not.toContainText('link text');
  await expect(app.rendered()).not.toContainText('https://https');
});

test('Ctrl+K takes the same two steps, and Tab indents again afterwards', async ({ app, page }) => {
  markdownOnly('rich text asks for a link in a dialog');

  await app.placeCursorAfter('Intro paragraph.');
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('Docs');
  await page.keyboard.press('Tab');
  await page.keyboard.type('https://example.com');
  await expect.poll(() => app.sourceLines()).toContain('Intro paragraph. [Docs](https://example.com)');

  // No link step pending: Tab indents the line as before
  await app.placeCursorAfter('Closing paragraph.');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await app.sourceLines()).some((line) => /^\s+Closing paragraph\.$/.test(line))).toBe(true);
});
