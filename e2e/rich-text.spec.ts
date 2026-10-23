// Rich-text specifics: rendered raw HTML (#183, #184) and minimal-diff saving. Callouts (#211),
// code highlighting (#212), math (#200) and footnotes (#203) render in parity.spec.ts, in both editors.
import { test, expect, expectNoPreviewInRichText, seedText } from './fixtures';

test.beforeEach(async ({ app }) => {
  await app.openFolder();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test.describe('raw HTML', () => {
  test.beforeEach(async ({ app }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Markdown mode renders raw HTML only in the preview, which takes no input');
    await app.openFile('html.md');
  });

  test('controls inside rendered HTML are no Tab stops (#183) @rich-text', async ({ app, page }) => {
    const rendered = app.rendered().locator('.rt-html-render');

    // Inside a closed <details>, so attached but not shown
    await expect(rendered.locator('a[href]')).toBeAttached();

    const tabbable = await rendered.evaluateAll((elements) =>
      elements.flatMap((element) =>
        Array.from(element.querySelectorAll<HTMLElement>('a[href], button, input, summary'), (control) => control.tabIndex)
      )
    );

    expect(tabbable.length).toBeGreaterThanOrEqual(4);
    expect(tabbable.every((index) => index === -1), `tab indexes ${tabbable.join(', ')}`).toBe(true);

    // Keys pressed on a rendered control never reach the document (a click would open the source)
    await rendered.locator('summary').focus();
    await expect(rendered.locator('summary')).toBeFocused();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('x');
    await expect(app.tab('html.md')).toHaveAccessibleName('html.md');
  });

  test('an emptied HTML source survives the window losing focus (#184) @rich-text', async ({ app, page }) => {
    await app.rendered().locator('.rt-html').filter({ hasText: 'More' }).click();

    const source = app.rendered().locator('textarea.rt-html-source');

    await expect(source).toBeFocused();
    await source.fill('');

    // What the browser does when another window takes focus: a blur while the document has none
    await page.evaluate(() => {
      const focused = document.activeElement;

      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });

      if (focused instanceof HTMLElement) focused.blur();

      Reflect.deleteProperty(document, 'hasFocus');
    });

    await expect(source).toBeVisible();
    await source.fill('<p>Replaced HTML</p>');
    await page.keyboard.press('Escape');
    await expect(app.rendered()).toContainText('Replaced HTML');
  });
});

test.describe('saving keeps untouched Markdown', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('fixture.md');
  });

  test('saving without edits leaves the file byte-identical @rich-text', async ({ app, page }) => {
    const before = await app.fileModified('fixture.md');

    await app.editingSurface().click();
    await page.keyboard.press('ControlOrMeta+s');
    // Saving an unchanged document still writes it
    await expect.poll(() => app.fileModified('fixture.md')).toBeGreaterThan(before);
    expect(await app.readFile('fixture.md')).toBe(seedText('fixture.md'));
  });

  test('an edit changes only its own line @rich-text', async ({ app, page }) => {
    await app.placeCursorAfter('A claim with a footnote.');
    await page.keyboard.type(' Edited');
    await app.save();

    const expected = seedText('fixture.md').replace('[^1]\n', '[^1] Edited\n');

    expect(expected).not.toBe(seedText('fixture.md'));
    expect(await app.readFile('fixture.md')).toBe(expected);
  });
});

test.describe('keys right after a click', () => {
  // A busy page runs input before the click's queued selectionchange event, which is the only way
  // ProseMirror hears of the click's caret. Holding the browser's own events back makes that
  // deterministic: the keys must still act on the caret the user sees.
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      document.addEventListener('selectionchange', (event) => event.isTrusted && event.stopImmediatePropagation(), true);
    });
  });

  test('act where the click put the caret, before the browser reports it (#217) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.placeCursorAfter('References');

    for (let i = 0; i < 'References'.length; i++) await page.keyboard.press('Backspace');

    await page.keyboard.type('Sources');
    await app.save();
    expect(await app.readFile('references.md')).toBe(seedText('references.md').replace('# References', '# Sources'));
  });

  test('Enter after clicking away from a selected formula splits the clicked paragraph (#217) @rich-text @math', async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Formulas are selected as a whole only in rich text');
    await app.openFile('math.md');
    await app.rendered().locator('.rt-math').first().click();

    const source = page.getByRole('textbox', { name: 'Math TeX source' });

    await expect(source).toBeFocused();
    // Closes the source and leaves the formula selected, where Enter would reopen it
    await source.press('Escape');
    await expect(source).toBeHidden();

    // Enter straight after the click, at the end of the one-line paragraph (End would sync first)
    const paragraph = app.rendered().locator('p', { hasText: 'Escaped' });
    const box = await paragraph.boundingBox();

    if (!box) throw new Error('The paragraph is not laid out');
    await paragraph.click({ position: { x: box.width - 2, y: box.height / 2 } });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');
    await expect(source).toBeHidden();
    await app.save();
    expect(await app.readFile('math.md')).toBe(seedText('math.md').replace('Escaped \\$y$ stays text.\n', 'Escaped \\$y$ stays text.\n\nNext\n'));
  });
});
