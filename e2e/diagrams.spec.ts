// Mermaid diagrams: they render, re-render after an edit, and an error names its document line,
// where "Show line N" puts the cursor (#166, #189), in both editors.
import { test, expect, expectNoPreviewInRichText, knownGap, type MarkloomApp } from './fixtures';

/** Where Mermaid notices the unclosed bracket: line 9 of broken.md, line 4 of flow.mmd */
const BROKEN_LINE = '  C --> D';

/** Where the cursor is: the text of the source line (Markdown) or of the code block's line (rich text) */
async function caretLine(app: MarkloomApp): Promise<string> {
  return app.page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;

    if (!selection || !node) return '';

    const line = node.parentElement?.closest('.cm-line');

    if (line) return line.textContent ?? '';

    // Rich text: the code block's text, cut at the caret's line
    const code = node.parentElement?.closest('code') ?? (node instanceof HTMLElement ? node.closest('code') : null);
    const text = code?.textContent ?? '';
    const range = document.createRange();

    if (!code) return '';
    range.setStart(code, 0);
    range.setEnd(node, selection.anchorOffset);

    const offset = range.toString().length;
    const start = text.lastIndexOf('\n', offset - 1) + 1;
    const end = text.indexOf('\n', offset);

    return text.slice(start, end === -1 ? undefined : end);
  });
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('a diagram renders and follows an edit @diagrams', async ({ app, page }) => {
  await app.openFile('fixture.md');

  const diagram = app.rendered().getByRole('img', { name: 'Diagram: graph TD' }).locator('svg');

  await expect(diagram).toContainText('Finish');

  if (app.editorMode === 'split') {
    await app.placeCursorAfter('Start --> Finish');
  } else {
    await app.rendered().getByRole('button', { name: 'Edit source' }).click();
    const code = app.rendered().locator('.rt-mermaid code');

    await code.click();
    // The caret to the end of the diagram's source
    await code.evaluate((element) => {
      const range = document.createRange();

      range.selectNodeContents(element);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  }

  await page.keyboard.type('\n  Finish --> Encore');
  await expect(diagram).toContainText('Encore');
});

test('an error names its document line and Show line goes there @diagrams', async ({ app }) => {
  await app.openFile('broken.md');

  const card = app.rendered().getByRole('status').filter({ hasText: 'Diagram error' });

  await expect(card).toContainText(/^Diagram errorLine 9: /);
  await card.getByRole('button', { name: 'Show line 9' }).click();

  await expect.poll(() => caretLine(app)).toBe(BROKEN_LINE);
});

test('Show line in a .mmd diagram moves the source cursor (#218) @diagrams', async ({ app }) => {
  test.skip(app.editorMode !== 'split', 'A .mmd file opens in its own diagram editor, whatever the mode');
  knownGap(app, 'split', 218,'the .mmd preview offers no Show line');
  await app.treeItem('flow.mmd').click();

  const card = app.page.getByRole('status').filter({ hasText: 'Diagram error' });

  await expect(card).toContainText('Line 4');
  await card.getByRole('button', { name: 'Show line 4' }).click({ timeout: 3_000 });
  await expect.poll(() => caretLine(app)).toBe(BROKEN_LINE);
});
