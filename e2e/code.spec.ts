// Syntax colours in code blocks (#212): rich text, opened on its own, colours the same languages
// as the preview, keeps colouring as you type, and leaves unlabelled or unknown languages plain.
import type { Locator } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';

/** The light palette's --hl-* colours in globals.css */
const KEYWORD = 'rgb(175, 0, 219)';

const STRING = 'rgb(163, 21, 21)';

const ATTRIBUTE = 'rgb(38, 127, 153)';

const SYMBOL = 'rgb(0, 16, 128)';

function block(app: MarkloomApp, text: string): Locator {
  return app.rendered().locator('pre', { hasText: text });
}

function color(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

test.beforeEach(async ({ app }) => {
  await app.page.emulateMedia({ colorScheme: 'light' });
  await app.openFolder();
  await app.openFile('code.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('ts, python and json blocks show the preview colours @code', async ({ app }) => {
  const ts = block(app, 'interface Owl').locator('.hljs-keyword');

  // The grammars load lazily; the block colours in once they arrive
  await expect(ts).toHaveText('interface');
  expect(await color(ts)).toBe(KEYWORD);

  const python = block(app, 'def hoot');

  await expect(python.locator('.hljs-keyword')).toHaveText(['def', 'return']);
  expect(await color(python.locator('.hljs-string'))).toBe(STRING);

  const json = block(app, '"owl"');

  await expect(json.locator('.hljs-attr')).toHaveText('"owl"');
  expect(await color(json.locator('.hljs-attr'))).toBe(ATTRIBUTE);
});

test('nested scopes take the innermost colour, as in the preview @code', async ({ app }) => {
  // The default value inside the parameter list is a number, not grey parameter text
  const number = block(app, 'def hoot').locator('.hljs-number');

  await expect(number).toHaveText('3');
  expect(await color(number)).toBe(STRING);

  // Inside a template interpolation: the substitution is a symbol, the number inside it a number
  const template = block(app, 'const call');

  await expect(template.locator('.hljs-number')).toHaveText('1');
  expect(await color(template.locator('.hljs-number'))).toBe(STRING);
  expect(await color(template.locator('.hljs-subst').first())).toBe(SYMBOL);

  // A string inside a preprocessor line keeps the string colour; the keyword the meta one
  const include = block(app, '#include');

  await expect(include.locator('.hljs-string')).toHaveText('<stdio.h>');
  expect(await color(include.locator('.hljs-string'))).toBe(STRING);
  expect(await color(include.locator('.hljs-keyword'))).toBe(SYMBOL);
});

test('a find match inside a nested token keeps the token colour (#277) @code @editing', async ({ app, page }) => {
  const template = block(app, 'const call');
  // `${count + ` is one run in two scopes, the substitution inside the string
  const subst = template.locator('.hljs-subst');

  await expect(subst.first()).toContainText('count');
  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+f');

  const bar = page.getByRole('search', { name: 'Find in document' });

  await expect(bar.getByRole('textbox', { name: 'Find' })).toBeFocused();
  await page.keyboard.type('count');
  await expect(bar).toContainText('1 of 1');

  const match = app.editingSurface().locator(app.editorMode === 'split' ? '.cm-searchMatch' : '.rt-find-match');

  await expect(match).toHaveText('count');

  // Every piece of the run, the match's included, keeps the substitution nested in the string
  for (const piece of await subst.all()) {
    expect(await piece.evaluate((element) => element.parentElement?.closest('.hljs-string') !== null)).toBe(true);
    expect(await color(piece)).toBe(SYMBOL);
  }

  if (app.editorMode === 'wysiwyg') {
    // The match is painted, and its word is a substitution piece of its own, in the symbol colour
    expect(await match.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

    const word = subst.filter({ hasText: /^count$/ });

    await expect(word).toHaveCount(1);
    expect(await color(word)).toBe(SYMBOL);
  }
});

test('unlabelled and unknown-language blocks stay plain @code', async ({ app }) => {
  // Wait for the grammars, so plain means "not coloured", not "not loaded yet"
  await expect(block(app, 'interface Owl').locator('.hljs-keyword')).toHaveText('interface');

  await expect(block(app, 'plain unlabelled block').locator('[class*="hljs-"]')).toHaveCount(0);
  await expect(block(app, 'plain unknown language').locator('[class*="hljs-"]')).toHaveCount(0);
});

test('typing in a code block keeps its colours and the caret @code @editing', async ({ app, page }) => {
  const typed = block(app, 'let typing');

  await expect(typed.locator('.hljs-keyword')).toHaveText('let');

  if (app.editorMode === 'split') await app.placeCursorAfter('let typing = 1;');
  else {
    await typed.click();
    await page.keyboard.press('End');
  }

  await page.keyboard.press('Enter');
  await page.keyboard.type('const added = 2; // end');

  await expect(typed.locator('.hljs-keyword')).toHaveText(['let', 'const']);
  await expect(typed.locator('.hljs-comment')).toHaveText('// end');
  await expect(typed).toContainText('let typing = 1;\nconst added = 2; // end');

  await app.save();
  expect(await app.readFile('code.md')).toContain('```ts\nlet typing = 1;\nconst added = 2; // end\n```');
});
