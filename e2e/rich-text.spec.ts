// Rich-text specifics: rendered raw HTML (#183, #184) and minimal-diff saving. Callouts (#211),
// code highlighting (#212), math (#200) and footnotes (#203) render in parity.spec.ts, in both editors.
import { test, expect, expectNoPreviewInRichText, seedText } from './fixtures';
import type { Page } from '@playwright/test';

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

// What Chrome does when a key arrives while the editor shows a selected node: it moves its hidden
// selection to the first caret position in the document and reports it. The listener is added after
// ProseMirror's, so ProseMirror has read the moved selection when this resolves.
async function browserJumpsToTop(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        document.addEventListener('selectionchange', () => setTimeout(resolve), { once: true });

        const heading = document.querySelector('[data-doc-surface] .rt-document h1');
        const text = heading?.firstChild;

        if (!text) throw new Error('The document has no heading text');
        getSelection()?.collapse(text, 0);
      })
  );
}

test.describe('keys after the editor selects a node (#234)', () => {
  test.beforeEach(async ({ app }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Only rich text selects a block as a whole');
  });

  test('ArrowDown from a clicked definition selects the next one @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await page.keyboard.press('ArrowDown');
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[guide\]:/);
  });

  test('Delete removes a clicked definition and selects the next one @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[guide\]:/);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('Delete removes a formula selected by Escape @rich-text @editing @math', async ({ app, page }) => {
    await app.openFile('math.md');

    const blocks = app.rendered().locator('.rt-math-block');
    const before = await blocks.count();

    await blocks.first().click();

    const source = page.getByRole('textbox', { name: 'Display math TeX source' });

    await expect(source).toBeFocused();
    await source.press('Escape');
    await expect(source).toBeHidden();
    await page.keyboard.press('Delete');
    await expect(blocks).toHaveCount(before - 1);
    await expect(app.rendered().locator('h1')).toHaveText('Math');
    await app.save();

    const saved = await app.readFile('math.md');

    expect(saved).not.toContain('\\int_0^1');
    expect(saved).toContain('$$F=ma$$');
  });

  test('Delete removes a clicked front matter block @rich-text @editing', async ({ app, page }) => {
    await app.openFile('front-matter.md');

    const block = app.rendered().locator('details.front-matter');

    await block.locator('summary').click();
    await block.locator('pre').click();
    await page.keyboard.press('Delete');
    await expect(block).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveText('Front matter heading');
  });

  test('a key acts on the selected node when the browser jumps to the top first @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await browserJumpsToTop(page);
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('the caret stays where a deleted definition was when the browser jumps to the top @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[img]:' }).click();
    await page.keyboard.press('Delete');
    await browserJumpsToTop(page);
    await page.keyboard.type('X');
    await expect(app.rendered().locator('p', { hasText: 'bad' })).toHaveText(/^XA bad/);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('Ctrl held a moment before X cuts a clicked definition @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await page.keyboard.down('Control');
    await page.waitForTimeout(120);
    await page.keyboard.press('x');
    await page.keyboard.up('Control');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('a modifier pressed and released alone keeps a clicked definition selected @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await page.keyboard.down('Shift');
    await page.waitForTimeout(150);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('after a click back into text, Ctrl+Home still moves the caret to the top @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await app.placeCursorAfter('Last paragraph.');
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('X');
    await expect(app.rendered().locator('h1')).toHaveText('XReferences');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(5);
  });

  test('a click inside a Ctrl+clicked paragraph places the caret there @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');

    const paragraph = app.rendered().locator('p', { hasText: 'Last paragraph.' });

    // Ctrl+click selects the whole paragraph as a node
    await paragraph.click({ modifiers: ['Control'] });
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText('Last paragraph.');

    const box = await paragraph.boundingBox();

    if (!box) throw new Error('The paragraph is not laid out');

    // Right after "Last", the first four letters of the text
    const x = await paragraph.evaluate((element) => {
      const text = element.firstChild;

      if (!text) throw new Error('The paragraph has no text');

      const range = document.createRange();

      range.setStart(text, 4);
      range.setEnd(text, 4);

      return range.getBoundingClientRect().left - element.getBoundingClientRect().left;
    });

    await paragraph.click({ position: { x, y: box.height / 2 } });
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveCount(0);
    await page.keyboard.type('X');
    await expect(app.rendered().locator('p', { hasText: 'paragraph.' })).toHaveText('LastX paragraph.');
  });
});

test.describe('missing images (#236)', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('missing-image.md');
  });

  test('a missing image shows the Image not found box @rich-text @images', async ({ app }) => {
    const rendered = app.rendered();

    await expect(rendered.getByRole('img', { name: 'Image not found: Gone lantern', exact: true })).toBeVisible();
    await expect(rendered.getByRole('img', { name: 'Image not found: Gone HTML lantern', exact: true })).toBeVisible();
    await expect(rendered.locator('img[alt="Gone lantern"]')).not.toBeVisible();

    const svgSources = await rendered.locator('img').evaluateAll((images) =>
      images.flatMap((img) => (img.getAttribute('src')?.startsWith('data:image/svg+xml') ? [img.getAttribute('src')] : []))
    );

    expect(svgSources).toEqual([]);
  });

  test('clicking a missing image selects it and Delete removes it @rich-text @images', async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Only rich text selects an image as a node');

    const box = app.rendered().getByRole('img', { name: 'Image not found: Gone lantern', exact: true });

    await expect(box).toBeVisible();
    await expect(page.getByText('(unsaved changes)')).toHaveCount(0);
    await box.click();
    await expect(app.rendered().locator('.rt-image.ProseMirror-selectednode')).toHaveCount(1);
    await expect(page.getByText('(unsaved changes)')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(box).toHaveCount(0);
    await app.save();

    const saved = await app.readFile('missing-image.md');

    expect(saved).not.toContain('gone-lantern.png');
    expect(saved).toContain('Before the lantern.');
    expect(saved).toContain('<img src="assets/gone-html.png" alt="Gone HTML lantern">');
    expect(saved).toContain('After the lantern.');
  });

  test('a missing image shows once its source is fixed @rich-text @images', async ({ app, page }) => {
    // Markdown mode only: switching shows the preview, which rich text alone must never mount
    test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

    const document = page.locator('[data-doc-surface] .rt-document');

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await expect(document.getByRole('img', { name: 'Image not found: Gone lantern', exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+M');
    await app.selectLine('![Gone lantern](assets/gone-lantern.png)');
    await page.keyboard.type('![Gone lantern](assets/pic.png)');
    await page.keyboard.press('ControlOrMeta+Shift+M');

    const image = document.getByRole('img', { name: 'Gone lantern', exact: true });

    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(document.getByRole('img', { name: 'Image not found: Gone lantern', exact: true })).toHaveCount(0);
  });
});
