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
