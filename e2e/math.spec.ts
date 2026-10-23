// Math (#199, #200): folder/math.md typesets the same in the preview and in rich text opened on its
// own; in rich text a formula's TeX can be edited and typed, and the file keeps every line the user
// didn't change, prices included.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, FOLDER_NAME, type MarkloomApp } from './fixtures';

const FILE = 'math.md';

const ORIGINAL = readFileSync(join(import.meta.dirname, 'folder', FILE), 'utf8');

/** The file as saved in the test folder, or null while a save is writing it */
function savedFile(page: Page): Promise<string | null> {
  return page.evaluate(
    async ([folderName, fileName]) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);

      try {
        return await (await (await folder.getFileHandle(fileName)).getFile()).text();
      } catch {
        return null;
      }
    },
    [FOLDER_NAME, FILE] as const
  );
}

/** Saves, then waits until the file holds `expected` */
async function expectSaved(app: MarkloomApp, expected: string): Promise<void> {
  await app.page.keyboard.press('ControlOrMeta+S');
  await expect.poll(() => savedFile(app.page)).toBe(expected);
}

function richTextOnly(app: MarkloomApp): void {
  test.skip(app.editorMode !== 'wysiwyg', 'editing formulas is rich text only');
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile(FILE);
});

// Rich text has to manage without anything only the preview loads (KaTeX, its CSS)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test('typesets inline and display math; prices and escapes stay text @math', async ({ app }) => {
  const rendered = app.rendered();

  // x^2, a+b, the heading's and six display blocks (one alone on a line, two next to a text line
  // with no blank line between, one in a quote, one in a list)
  await expect(rendered.locator('.katex')).toHaveCount(9);
  // The heading's id spells the formula as written, in both editors
  await expect(rendered.locator('h2#energy-emc2')).toHaveCount(1);
  await expect(rendered.locator('.katex-display')).toHaveCount(6);
  await expect(rendered.locator('p', { hasText: 'Text above' })).toHaveText('Text above');
  await expect(rendered.locator('p', { hasText: 'text below' })).toHaveText('text below');
  await expect(rendered.locator('blockquote .katex-display')).toHaveCount(1);
  await expect(rendered.locator('li .katex-display')).toHaveCount(1);
  await expect(rendered.locator('.katex-error')).toHaveCount(1);
  await expect(rendered).toContainText('costs $5 and $10 today.');
  await expect(rendered).toContainText('$y$ stays text.');
  // `$$` in running text (code spans here) is neither display math nor a reason to fail opening
  const codeDollars = rendered.locator('p', { hasText: 'for display math' });
  await expect(codeDollars).toHaveText('Use $$ for display math and a $$x$$ c inline.');
  await expect(codeDollars.locator('code')).toHaveText(['$$', 'a $$x$$ c']);
  // Markup between two price dollars stays markup
  const styled = rendered.locator('p', { hasText: 'Styled:' });
  await expect(styled).toHaveText('Styled: costs $5 with bold, a link, code and & then $10 later.');
  await expect(styled.locator('em')).toHaveText('bold');
  await expect(styled.locator('a')).toHaveText('a link');
  await expect(styled.locator('code')).toHaveText('code');
  await expect(rendered).toContainText('stays text.');
  // KaTeX's fonts, not a fallback serif
  await expect.poll(() => rendered.locator('.katex').first().evaluate((node) => getComputedStyle(node).fontFamily)).toContain('KaTeX_Main');
});

test('editing a formula re-renders it, undoes in one step and saves the new TeX @math', async ({ app, page }) => {
  richTextOnly(app);

  const formula = app.rendered().locator('.rt-math').first();
  const tex = formula.locator('annotation');

  await expect(tex).toHaveText('x^2');
  await formula.click();

  const source = page.getByRole('textbox', { name: 'Math TeX source' });

  await expect(source).toBeFocused();
  await expect(source).toHaveValue('x^2');
  await source.press('End');
  await source.press('Backspace');
  await source.pressSequentially('3');
  await source.press('Enter');
  await expect(source).toBeHidden();
  await expect(tex).toHaveText('x^3');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(tex).toHaveText('x^2');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(tex).toHaveText('x^3');

  await expectSaved(app, ORIGINAL.replace('Inline $x^2$ math', 'Inline $x^3$ math'));
});

test('typing in a paragraph with prices adds no backslashes, and keeps the one math needs @math', async ({ app, page }) => {
  richTextOnly(app);

  await app.rendered().getByText('costs $5 and $10 today.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Really.');
  await app.rendered().getByText('$y$ stays text.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Yes.');
  await app.rendered().locator('p', { hasText: 'for display math' }).click({ position: { x: 2, y: 8 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' Ok.');
  // At the start of the line: End on a wrapped line stops before the paragraph's end
  await app.rendered().locator('p', { hasText: 'Styled:' }).click({ position: { x: 2, y: 8 } });
  await page.keyboard.press('Home');
  await page.keyboard.type('Now ');
  await expect(app.rendered().locator('.katex')).toHaveCount(9);
  await expect(app.rendered().locator('p', { hasText: 'Styled:' }).locator('em')).toHaveText('bold');

  // Emphasis, link and code between the prices stay markup (the edited line writes its entity as
  // the character), and the display lines next to text lines are saved as they were
  await expectSaved(
    app,
    ORIGINAL.replace('costs $5 and $10 today.', 'costs $5 and $10 today. Really.')
      .replace('\\$y$ stays text.', '\\$y$ stays text. Yes.')
      // A function, since `$$` in a replacement string stands for one `$`
      .replace('`a $$x$$ c` inline.', (line) => `${line} Ok.`)
      .replace('Styled: costs', 'Now Styled: costs')
      .replace('&amp; then', '& then')
  );
});

test('typing $…$ and a space, or $$ and Enter, makes math @math', async ({ app, page }) => {
  richTextOnly(app);

  await app.rendered().getByText('formula.').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sum $c+d$ done');
  await expect(app.rendered().locator('.katex')).toHaveCount(10);
  await expect(app.rendered()).toContainText('Sum');
  await expect(app.rendered()).not.toContainText('$c+d$');
  // The preview pairs dollars left to right: in $a$b$ the formula would be a, not b
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pair $a$b$ done');
  await expect(app.rendered().locator('.katex')).toHaveCount(10);
  await expect(app.rendered()).toContainText('Pair $a$b$ done');

  await page.keyboard.press('Enter');
  await page.keyboard.type('$$');
  await page.keyboard.press('Enter');

  const source = page.getByRole('textbox', { name: 'Display math TeX source' });

  await expect(source).toBeFocused();
  await source.pressSequentially('z^2');
  await source.press('ControlOrMeta+Enter');
  await expect(app.rendered().locator('.katex-display')).toHaveCount(7);

  // Both dollars that would open math are escaped, so the preview shows the text too
  await expectSaved(app, `${ORIGINAL}\nSum $c+d$ done\n\nPair \\$a\\$b$ done\n\n$$\nz^2\n$$\n`);
});

test('switching to rich text and back without edits leaves the file as it was @math @rich-text', async ({ app, page }) => {
  // Markdown mode only: switching shows the preview, which rich text alone must never mount
  test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(page.locator('[data-doc-surface] .rt-document .katex')).toHaveCount(9);
  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(app.rendered().locator('.katex')).toHaveCount(9);
  await expect(page.getByText('(unsaved changes)')).toHaveCount(0);
  await expectSaved(app, ORIGINAL);
});
