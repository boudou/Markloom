// Paste as Markdown (#7): HTML from Google Docs, Word and web pages goes into the Markdown source
// as Markdown. Rich text parses pasted HTML with Milkdown's own clipboard plugin.
import type { Page } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';

const GOOGLE_DOCS_HTML =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-e2e">' +
  '<p dir="ltr"><span style="font-weight:700;">bold words</span><span style="font-weight:400;"> and </span>' +
  '<a href="https://example.com/"><span>a link</span></a></p>' +
  '<div dir="ltr"><table><tbody>' +
  '<tr><td><p><span>Fruit</span></p></td><td><p><span>Colour</span></p></td></tr>' +
  '<tr><td><p><span>Lime</span></p></td><td><p><span>Green</span></p></td></tr>' +
  '<tr><td><p><span>Plum</span></p></td><td><p><span>Purple</span></p></td></tr>' +
  '</tbody></table></div></b>';

const GOOGLE_DOCS_TEXT = 'bold words and a link\nFruit\tColour\nLime\tGreen\nPlum\tPurple';

const GOOGLE_DOCS_MARKDOWN = [
  '**bold words** and [a link](https://example.com/)',
  '',
  '| Fruit | Colour |',
  '| --- | --- |',
  '| Lime | Green |',
  '| Plum | Purple |',
].join('\n');

function wordListParagraph(level: number, marker: string, text: string): string {
  return (
    `<p class=MsoListParagraph style='text-indent:-.25in;mso-list:l0 level${level} lfo1'><![if !supportLists]>` +
    `<span style='font-family:Symbol'><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span>` +
    `<![endif]>${text}<o:p></o:p></p>`
  );
}

const WORD_HTML =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body><!--StartFragment-->' +
  wordListParagraph(1, '·', 'First point') +
  wordListParagraph(2, 'o', 'Sub point') +
  wordListParagraph(1, '·', 'Second point') +
  '<p class=MsoNormal><b>Bold</b> text<o:p></o:p></p><!--EndFragment--></body></html>';

const WORD_TEXT = 'First point\nSub point\nSecond point\nBold text';

interface Clipboard {
  html: string;
  text: string;
  withImage?: boolean;
}

/** A paste on the focused editor; a synthetic event keeps parallel workers off the shared OS clipboard */
async function paste(page: Page, { html, text, withImage = false }: Clipboard): Promise<void> {
  await page.evaluate(
    ({ html, text, withImage }) => {
      const data = new DataTransfer();

      data.setData('text/html', html);
      data.setData('text/plain', text);

      if (withImage) data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }));

      document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    },
    { html, text, withImage }
  );
}

/** A new paragraph after the last one of notes.md */
async function startNewParagraph(app: MarkloomApp): Promise<void> {
  await app.placeCursorAfter('The last paragraph of notes.');
  await app.page.keyboard.press('Enter');

  if (app.editorMode === 'split') await app.page.keyboard.press('Enter');
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('notes.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('Google Docs content pastes as Markdown with bold, a link and a table @editing', async ({ app, page }) => {
  await startNewParagraph(app);
  await paste(page, { html: GOOGLE_DOCS_HTML, text: GOOGLE_DOCS_TEXT });

  await expect(app.rendered().locator('th')).toHaveText(['Fruit', 'Colour']);
  await expect(app.rendered().locator('strong', { hasText: 'bold words' })).toBeVisible();
  await expect(app.rendered().locator('a[href="https://example.com/"]')).toHaveText('a link');

  if (app.editorMode === 'split') {
    await app.save();
    expect(await app.readFile('notes.md')).toContain(`The last paragraph of notes.\n\n${GOOGLE_DOCS_MARKDOWN}`);
  }
});

test('Word content pastes as nested lists and bold text, without its picture @editing @images', async ({ app, page }) => {
  test.skip(app.editorMode !== 'split', "Rich text parses pasted HTML with Milkdown's own clipboard plugin");

  await startNewParagraph(app);
  await paste(page, { html: WORD_HTML, text: WORD_TEXT, withImage: true });
  await expect(app.rendered().locator('ul ul li')).toHaveText('Sub point');
  await app.save();

  const saved = await app.readFile('notes.md');

  expect(saved).toContain('- First point\n  - Sub point\n- Second point');
  expect(saved).toContain('**Bold** text');
  expect(saved).not.toContain('Pasted image');
  expect(saved).not.toContain('·');
});

test('HTML without formatting, a Rich text copy, Shift and code blocks paste plain text @editing', async ({ app, page }) => {
  test.skip(app.editorMode !== 'split', "Rich text parses pasted HTML with Milkdown's own clipboard plugin");

  const source = app.editingSurface();

  await startNewParagraph(app);
  await paste(page, { html: '<span style="color:red">snake_case_name</span>', text: 'snake_case_name' });
  await expect(source).toContainText('snake_case_name');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await paste(page, { html: '<p data-pm-slice="1 1 []"><strong>kept</strong></p>', text: '**kept**' });
  await expect(source).toContainText('**kept**');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.down('Shift');
  await paste(page, { html: GOOGLE_DOCS_HTML, text: GOOGLE_DOCS_TEXT });
  await page.keyboard.up('Shift');
  await expect(source).toContainText('Plum');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```');
  await page.keyboard.press('Enter');
  await paste(page, { html: GOOGLE_DOCS_HTML, text: GOOGLE_DOCS_TEXT });
  await expect(source.locator('.cm-line', { hasText: 'Plum' })).toHaveCount(2);
  await app.save();

  const saved = await app.readFile('notes.md');

  expect(saved).toContain('snake_case_name');
  expect(saved).not.toContain('\\_');
  expect(saved).toContain('**kept**');
  expect(saved).not.toContain('|');
  expect(saved).toContain(`\`\`\`\n${GOOGLE_DOCS_TEXT}`);
});
