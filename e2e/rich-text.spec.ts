// Rich-text specifics: rendered raw HTML (#183, #184) and minimal-diff saving. Callouts (#211),
// code highlighting (#212), math (#200) and footnotes (#203) render in parity.spec.ts, in both editors.
import { test, expect, expectNoPreviewInRichText, seedText, FOLDER_NAME, WEB_IMAGE_ORIGIN } from './fixtures';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __e2eSelectionMoved?: Promise<void>;
  }
}

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

  // The HTML plugin's own Enter handler opens a selected node's source; it must see the click first
  test('Enter after clicking away from a selected HTML block splits the clicked paragraph (#220) @rich-text', async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Raw HTML is a node of its own only in rich text');
    await app.openFile('html.md');
    await app.rendered().locator('.rt-html').filter({ hasText: 'More' }).click();

    const source = app.rendered().locator('textarea.rt-html-source');

    await expect(source).toBeFocused();
    // Closes the source and leaves the HTML block selected, where Enter would reopen it
    await source.press('Escape');
    await expect(source).toBeHidden();
    await expect(app.rendered().locator('.rt-html.ProseMirror-selectednode')).toHaveCount(1);

    const paragraph = app.rendered().locator('p', { hasText: 'After the HTML.' });
    const box = await paragraph.boundingBox();

    if (!box) throw new Error('The paragraph is not laid out');
    await paragraph.click({ position: { x: box.width - 2, y: box.height / 2 } });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');
    await expect(source).toBeHidden();
    await app.save();
    expect(await app.readFile('html.md')).toBe(seedText('html.md').replace('After the HTML.\n', 'After the HTML.\n\nNext\n'));
  });

  // The math plugin turns `$$` alone in a paragraph into a display formula on Enter, reading the caret
  test('Enter right after clicking at the end of a lone `$$` makes a display formula (#220) @rich-text @math', async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'Only rich text turns `$$` and Enter into a formula');
    await app.openFile('math.md');
    // Formulas above draw once KaTeX loads, which moves the paragraph
    await expect(app.rendered().locator('.rt-math .katex').first()).toBeVisible();
    // The caret in the paragraph before, where the editor knows it (End syncs it)
    await app.placeCursorAfter('A lone');

    const paragraph = app.rendered().locator('p').filter({ hasText: /^\$\$$/ });
    const box = await paragraph.boundingBox();

    if (!box) throw new Error('The paragraph is not laid out');

    // At the end of the text, not the line: the paragraph spans the page and `$$` is two characters
    const textEnd = await paragraph.evaluate((element) => {
      const range = document.createRange();

      range.selectNodeContents(element);

      return range.getBoundingClientRect().right - element.getBoundingClientRect().left;
    });

    await paragraph.click({ position: { x: textEnd + 1, y: box.height / 2 } });
    await page.keyboard.press('Enter');

    const source = page.getByRole('textbox', { name: 'Math TeX source' });

    await expect(source).toBeFocused();
    await source.fill('z^2');
    await source.press('ControlOrMeta+Enter');
    await expect(source).toBeHidden();
    await app.save();
    // A function, since `$$` in a replacement string writes one `$`
    expect(await app.readFile('math.md')).toBe(seedText('math.md').replace('A lone\n\n$$\n\nstays text.', () => 'A lone\n\n$$\nz^2\n$$\n\nstays text.'));
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

// Ctrl (Cmd on macOS) held a moment before the key, as a person presses it: Chrome moves its hidden
// selection on the modifier's keydown already. Waits for the selectionchange of that move (the
// listener is added after ProseMirror's, so ProseMirror has read it), or a second when none comes.
async function pressWithModHeld(page: Page, key: string) {
  await page.evaluate(() => {
    window.__e2eSelectionMoved = new Promise<void>((resolve) => {
      document.addEventListener('selectionchange', () => setTimeout(resolve), { once: true });
      setTimeout(resolve, 1000);
    });
  });
  await page.keyboard.down('ControlOrMeta');
  await page.evaluate(() => window.__e2eSelectionMoved);
  await page.keyboard.press(key);
  await page.keyboard.up('ControlOrMeta');
}

/** With Ctrl (Cmd on macOS), the keys that go to the start and the end of the document */
const DOCUMENT_START_KEY = process.platform === 'darwin' ? 'ArrowUp' : 'Home';

const DOCUMENT_END_KEY = process.platform === 'darwin' ? 'ArrowDown' : 'End';

// What a busy page can leave for the next key: ProseMirror refused a read of the jumped selection
// and put the browser's selection back around the selected node, and Chrome has not moved it again
// before the key acts. Chrome then sends Cut and Copy to the page body, not to the editor (#252).
async function browserKeepsNodeRangeForNextKey(page: Page) {
  await page.evaluate(() => {
    window.addEventListener(
      'keydown',
      () => {
        const node = document.querySelector('[data-doc-surface] .ProseMirror-selectednode');

        if (!node) throw new Error('No node is selected');

        const range = document.createRange();

        range.selectNode(node);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      },
      { capture: true, once: true }
    );
  });
}

/** The plain text on the clipboard */
async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
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
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await pressWithModHeld(page, 'x');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('.rt-definition', { hasText: '[d]:' })).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveText('References');
    expect(await clipboardText(page)).toContain('https://example.com/docs');
  });

  test('Ctrl+X cuts a clicked definition when the browser keeps its selection around it (#252) @rich-text @editing', async ({ app, page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await page.keyboard.down('ControlOrMeta');
    await browserKeepsNodeRangeForNextKey(page);
    await page.keyboard.press('x');
    await page.keyboard.up('ControlOrMeta');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('.rt-definition', { hasText: '[d]:' })).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveText('References');
    expect(await clipboardText(page)).toContain('https://example.com/docs');
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

  test('Ctrl+Home from a clicked definition moves the caret to the top (#246) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await pressWithModHeld(page, DOCUMENT_START_KEY);
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveCount(0);
    await page.keyboard.type('X');
    await expect(app.rendered().locator('h1')).toHaveText('XReferences');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(5);
  });

  test('Ctrl+End from a clicked definition moves the caret to the end (#246) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await pressWithModHeld(page, DOCUMENT_END_KEY);
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveCount(0);
    await page.keyboard.type('X');
    // The document ends with a definition, followed by the empty paragraph rich text keeps last
    await expect(app.rendered().locator(':scope > :last-child')).toHaveText('X');
    await expect(app.rendered().locator('h1')).toHaveText('References');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(5);
  });

  test('Shift+Ctrl+End from a clicked definition selects to the end (#267) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[js]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[js\]:/);
    await pressWithModHeld(page, `Shift+${DOCUMENT_END_KEY}`);
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('.rt-definition', { hasText: '[js]:' })).toHaveCount(0);
    await expect(app.rendered().locator('p', { hasText: 'Last paragraph.' })).toHaveText('Last paragraph.');
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('Shift+Ctrl+Home from a clicked definition selects to the start (#267) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[img]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[img\]:/);
    await pressWithModHeld(page, `Shift+${DOCUMENT_START_KEY}`);
    await page.keyboard.press('Delete');
    // One end of the selection stays in text: the start of "A bad link.", the first text after the
    // definition, so the definitions before it go too
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(1);
    await expect(app.rendered().locator('.rt-definition')).toHaveText(/^\[js\]:/);
    await expect(app.rendered().locator(':scope > :first-child')).toHaveText(/^A bad/);
  });

  test('Shift+Ctrl+End from front matter selects the whole document (#267) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('front-matter.md');

    const block = app.rendered().locator('details.front-matter');

    await block.locator('summary').click();
    await block.locator('pre').click();
    // No text before the front matter to anchor a text selection: the whole document is selected
    await pressWithModHeld(page, `Shift+${DOCUMENT_END_KEY}`);
    await page.keyboard.press('Delete');
    await expect(block).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveCount(0);
    await expect(app.rendered()).not.toContainText('A paragraph after the front matter.');
  });

  test('Ctrl+X keeps the next definition selected when the browser jumps to the top (#267) @rich-text @editing', async ({ app, page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await pressWithModHeld(page, 'x');
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[guide\]:/);
    await browserJumpsToTop(page);
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(3);
    await expect(app.rendered().locator('.rt-definition', { hasText: '[guide]:' })).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('a browser jump right after a modifier and a handled key is refused (#267) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    // All in one evaluate: ProseMirror takes a read within 50 ms of a key it left alone (Shift) as
    // that key's own, and separate round trips would take longer
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const editor = document.querySelector('[data-doc-surface] .ProseMirror');
          const heading = document.querySelector('[data-doc-surface] .rt-document h1')?.firstChild;

          if (!editor || !heading) throw new Error('The editor has no heading text');

          const send = (type: string, init: KeyboardEventInit, keyCode: number) => {
            const event = new KeyboardEvent(type, { ...init, bubbles: true, cancelable: true });

            // ProseMirror reads keyCode, which the constructor does not take
            Object.defineProperty(event, 'keyCode', { value: keyCode });
            editor.dispatchEvent(event);
          };

          send('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true }, 16);
          send('keyup', { key: 'Shift', code: 'ShiftLeft' }, 16);
          send('keydown', { key: 'ArrowDown', code: 'ArrowDown' }, 40);
          document.addEventListener('selectionchange', () => setTimeout(resolve), { once: true });
          getSelection()?.collapse(heading, 0);
        })
    );
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[guide\]:/);
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('Ctrl+C keeps a clicked definition selected for Delete (#246) @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await page.keyboard.press('ControlOrMeta+c');
    await browserJumpsToTop(page);
    await page.keyboard.press('Delete');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(4);
    await expect(app.rendered().locator('.rt-definition', { hasText: '[d]:' })).toHaveCount(0);
    await expect(app.rendered().locator('h1')).toHaveText('References');
  });

  test('after a click back into text, Ctrl+Home still moves the caret to the top @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');
    await app.rendered().locator('.rt-definition', { hasText: '[d]:' }).click();
    await expect(app.rendered().locator('.ProseMirror-selectednode')).toHaveText(/^\[d\]:/);
    await app.placeCursorAfter('Last paragraph.');
    await page.keyboard.press(`ControlOrMeta+${DOCUMENT_START_KEY}`);
    await page.keyboard.type('X');
    await expect(app.rendered().locator('h1')).toHaveText('XReferences');
    await expect(app.rendered().locator('.rt-definition')).toHaveCount(5);
  });

  test('a click inside a Ctrl+clicked paragraph places the caret there @rich-text @editing', async ({ app, page }) => {
    await app.openFile('references.md');

    const paragraph = app.rendered().locator('p', { hasText: 'Last paragraph.' });

    // Ctrl+click (Cmd+click on macOS) selects the whole paragraph as a node
    await paragraph.click({ modifiers: ['ControlOrMeta'] });
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

test.describe('missing images (#236, #250)', () => {
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

  test('an image edited to a missing path and back shows again @rich-text @images', async ({ app, page }) => {
    // Markdown mode only: switching shows the preview, which rich text alone must never mount
    test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

    const document = page.locator('[data-doc-surface] .rt-document');
    const image = document.getByRole('img', { name: 'Gone lantern', exact: true });
    const box = document.getByRole('img', { name: 'Image not found: Gone lantern', exact: true });

    for (const [from, to] of [
      ['assets/gone-lantern.png', 'assets/pic.png'],
      ['assets/pic.png', 'assets/pic-typo.png'],
      ['assets/pic-typo.png', 'assets/pic.png'],
    ] as const) {
      await test.step(`${from} to ${to}`, async () => {
        await app.selectLine(`![Gone lantern](${from})`);
        await page.keyboard.type(`![Gone lantern](${to})`);
        await page.keyboard.press('ControlOrMeta+Shift+M');

        if (to === 'assets/pic-typo.png') await expect(box).toBeVisible();
        else await expect(image).toBeVisible();

        await page.keyboard.press('ControlOrMeta+Shift+M');
      });
    }

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(box).toHaveCount(0);
  });

  test('a missing image shows once its file is added and the window regains focus @rich-text @images', async ({ app, page }) => {
    const rendered = app.rendered();

    for (const [alt, fileName] of [
      ['Gone lantern', 'gone-lantern.png'],
      ['Gone HTML lantern', 'gone-html.png'],
    ] as const) {
      await expect(rendered.getByRole('img', { name: `Image not found: ${alt}`, exact: true })).toBeVisible();
      await copyFolderFile(page, 'assets/pic.png', `assets/${fileName}`);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));

      const image = rendered.getByRole('img', { name: alt, exact: true });

      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(rendered.getByRole('img', { name: `Image not found: ${alt}`, exact: true })).toHaveCount(0);
    }
  });

  test('an image file that will not decode keeps its box when the window regains focus @rich-text @images', async ({ app, page }) => {
    const rendered = app.rendered();
    const box = rendered.getByRole('img', { name: 'Image not found: Gone lantern', exact: true });
    const image = rendered.locator('img[alt="Gone lantern"]');

    await expect(box).toBeVisible();
    // A text file saved as .png: it reads, but won't decode
    await copyFolderFile(page, 'missing-image.md', 'assets/gone-lantern.png');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.src.startsWith('blob:'))).toBe(true);
    await expect(box).toBeVisible();
    await expect(image).not.toBeVisible();

    // Flags any moment the box is gone or the img (its broken-image icon) shows
    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[data-doc-surface]');

      if (!surface) throw new Error('no document surface');

      new MutationObserver(() => {
        const img = surface.querySelector<HTMLImageElement>('img[alt="Gone lantern"]');

        if (!surface.querySelector('.missing-image') || (img && !img.hidden)) document.documentElement.dataset.e2eBoxGone = '';
      }).observe(surface, { subtree: true, childList: true, attributes: true });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    // The unchanged file's check settles within a few frames
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

    await expect(box).toBeVisible();
    await expect(image).not.toBeVisible();
    expect(await page.evaluate(() => 'e2eBoxGone' in document.documentElement.dataset)).toBe(false);
  });

  test('a web image that fails to load shows the Image not found box @rich-text @images', async ({ app, page }) => {
    // Registered after the fixture's catch-all, so it wins for this address
    await page.route(`${WEB_IMAGE_ORIGIN}/web.png`, (route) => route.fulfill({ status: 404 }));
    await app.openFile('fixture.md');

    const rendered = app.rendered();

    await expect(rendered.getByRole('img', { name: 'Image not found: Web image', exact: true })).toBeVisible();
    await expect(rendered.locator('img[alt="Web image"]')).not.toBeVisible();
  });

  test('a failed web image edited to another failing address names its new alt text (#269) @rich-text @images', async ({ app, page }) => {
    // Markdown mode only: the image is edited in the source, then the document switches to rich text
    test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

    await page.route(`${WEB_IMAGE_ORIGIN}/web.png`, (route) => route.fulfill({ status: 404 }));
    await page.route(`${WEB_IMAGE_ORIGIN}/other.png`, (route) => route.fulfill({ status: 404 }));
    await app.openFile('fixture.md');

    const richText = page.locator('[data-doc-surface] .rt-document');

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await expect(richText.getByRole('img', { name: 'Image not found: Web image', exact: true })).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await app.selectLine('![Web image](https://images.e2e.test/web.png)');
    await page.keyboard.type('![Other web image](https://images.e2e.test/other.png)');
    await page.keyboard.press('ControlOrMeta+Shift+M');

    // The failed load names the label of the latest render, not the first one
    await expect(richText.getByRole('img', { name: 'Image not found: Other web image', exact: true })).toBeVisible();
    await expect(richText.getByRole('img', { name: 'Image not found: Web image', exact: true })).toHaveCount(0);
  });

  test('editing a missing image to another missing path keeps its box @rich-text @images', async ({ app, page }) => {
    // Markdown mode only: switching shows the preview, which rich text alone must never mount
    test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

    const richText = page.locator('[data-doc-surface] .rt-document');

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await expect(richText.getByRole('img', { name: 'Image not found: Gone lantern', exact: true })).toBeVisible();

    // Flags any moment the box is gone or the img shows its alt text instead
    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>('[data-doc-surface] .rt-document');

      if (!surface) throw new Error('no rich-text document');

      surface.dataset.e2eWatched = '';

      new MutationObserver(() => {
        const img = surface.querySelector<HTMLImageElement>('img[alt="Gone lantern"]');

        if (!surface.querySelector('.missing-image') || (img && !img.hidden)) document.documentElement.dataset.e2eBoxGone = '';
      }).observe(surface, { subtree: true, childList: true, attributes: true });
    });

    await page.keyboard.press('ControlOrMeta+Shift+M');
    await app.selectLine('![Gone lantern](assets/gone-lantern.png)');
    await page.keyboard.type('![Gone lantern](assets/still-gone.png)');
    await page.keyboard.press('ControlOrMeta+Shift+M');

    await expect(richText.getByRole('img', { name: 'Image not found: Gone lantern', exact: true })).toBeVisible();
    // The watched surface is the one on screen (rich text stays mounted while Markdown mode shows)
    await expect(richText).toHaveAttribute('data-e2e-watched', '');
    expect(await page.evaluate(() => 'e2eBoxGone' in document.documentElement.dataset)).toBe(false);
  });

  test('a relative image in an unsaved document shows the box with the folder hint @rich-text @images', async ({ app, page }) => {
    // Markdown mode only: the image is typed in the source, then the document switches to rich text
    test.skip(app.editorMode !== 'split', 'starts in Markdown mode');

    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { selected: true })).toHaveText(/^Untitled/);
    await page.getByLabel('Markdown source').click();
    await page.keyboard.type('![Loose](assets/pic.png)');
    await page.keyboard.press('ControlOrMeta+Shift+M');

    const document = page.locator('[data-doc-surface] .rt-document');

    await expect(document.getByRole('img', { name: /^Image not found: Loose\. open the document from its folder/ })).toBeVisible();
    await expect(document.locator('img[alt="Loose"]')).not.toBeVisible();
  });
});

test.describe('images after Save As (#273)', () => {
  test.beforeEach(async ({ page }) => {
    // Save As picks a file outside the open folder: a document on its own, whose relative images can't be read
    await page.evaluate(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => (await navigator.storage.getDirectory()).getFileHandle('saved-elsewhere.md', { create: true }),
      });
    });
  });

  /** Saves the active document as saved-elsewhere.md and waits for its tab to take the new name */
  async function saveElsewhere(page: Page): Promise<void> {
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name: 'saved-elsewhere.md', exact: true })).toBeVisible();
  }

  test('an image shown before Save As outside the folder shows the box with the folder hint @rich-text @images', async ({ app, page }) => {
    await app.openFile('fixture.md');

    const rendered = app.rendered();

    for (const alt of ['Relative image', 'HTML image']) {
      const image = rendered.getByRole('img', { name: alt, exact: true });

      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
    }

    await saveElsewhere(page);

    for (const alt of ['Relative image', 'HTML image']) {
      await expect(rendered.getByRole('img', { name: new RegExp(`^Image not found: ${alt}\\. open the document from its folder`) })).toBeVisible();
      await expect(rendered.locator(`img[alt="${alt}"]`)).not.toBeVisible();
    }
  });

  test('a missing image resolves again after Save As and names the folder hint @rich-text @images', async ({ app, page }) => {
    await app.openFile('missing-image.md');

    const rendered = app.rendered();

    for (const alt of ['Gone lantern', 'Gone HTML lantern']) {
      await expect(rendered.getByRole('img', { name: `Image not found: ${alt}`, exact: true })).toBeVisible();
    }

    await saveElsewhere(page);

    for (const alt of ['Gone lantern', 'Gone HTML lantern']) {
      await expect(rendered.getByRole('img', { name: new RegExp(`^Image not found: ${alt}\\. open the document from its folder`) })).toBeVisible();
      await expect(rendered.getByRole('img', { name: `Image not found: ${alt}`, exact: true })).toHaveCount(0);
    }
  });
});

/** Copies a file of the test folder to another path in it, as another app would */
async function copyFolderFile(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    async ([folderName, fromPath, toPath]) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);

      const directoryOf = async (parts: string[]) => {
        let directory = folder;

        for (const part of parts) directory = await directory.getDirectoryHandle(part);

        return directory;
      };

      const fromParts = fromPath.split('/');
      const toParts = toPath.split('/');
      const file = await (await (await directoryOf(fromParts.slice(0, -1))).getFileHandle(fromParts.at(-1) ?? '')).getFile();
      const target = await (await directoryOf(toParts.slice(0, -1))).getFileHandle(toParts.at(-1) ?? '', { create: true });
      const writable = await target.createWritable();

      await writable.write(await file.arrayBuffer());
      await writable.close();
    },
    [FOLDER_NAME, from, to] as const
  );
}
