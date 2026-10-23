// GitHub callouts (#13, #211): "> [!NOTE]" and the four other types show as a coloured box with an
// icon and a title in the Markdown preview and in rich text opened on its own. Rich text does it with
// decorations, so the marker stays editable and the saved Markdown stays as written.
import { test, expect, expectNoPreviewInRichText, seedText } from './fixtures';

/** Each type's title and the colour of its box's left border (lib/callouts.ts, globals.css) */
const CALLOUTS = [
  { kind: 'note', title: 'Note', body: 'Note body.', border: 'rgb(9, 105, 218)' },
  { kind: 'tip', title: 'Tip', body: 'Tip body.', border: 'rgb(26, 127, 55)' },
  { kind: 'important', title: 'Important', body: 'Important body.', border: 'rgb(130, 80, 223)' },
  { kind: 'warning', title: 'Warning', body: 'Warning body.', border: 'rgb(154, 103, 0)' },
  { kind: 'caution', title: 'Caution', body: 'Caution body, the marker on a paragraph of its own.', border: 'rgb(207, 34, 46)' },
];

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('callouts.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('each callout type shows its colour, icon and title @parity @rich-text', async ({ app }) => {
  const rendered = app.rendered();

  for (const { kind, title, body, border } of CALLOUTS) {
    const box = rendered.locator(`blockquote[data-callout="${kind}"]`);

    await expect(box).toContainText(body);
    await expect(box.locator('.callout-title')).toHaveText(title);
    await expect(box.locator('.callout-title svg.callout-icon')).toBeVisible();
    expect(await box.evaluate((quote) => getComputedStyle(quote).borderLeftColor)).toBe(border);
    expect(await box.locator('.callout-title').evaluate((row) => getComputedStyle(row).color)).toBe(border);
  }

  // The marker is not shown as text while the caret is elsewhere
  for (const box of await rendered.locator('blockquote[data-callout]').all()) {
    await expect(box).not.toContainText('[!', { useInnerText: true });
  }
});

test('a quote that starts with a heading or a code block is not a callout @parity @rich-text', async ({ app }) => {
  const rendered = app.rendered();
  const headingQuote = rendered.locator('blockquote', { hasText: 'A heading holding the marker' });
  const codeQuote = rendered.locator('blockquote', { hasText: 'A code block holding the marker' });

  // Same as the preview: a plain quote, with the heading and the code block shown as written
  await expect(headingQuote).not.toHaveAttribute('data-callout');
  await expect(headingQuote.locator('h2')).toHaveText('[!TIP]');
  await expect(headingQuote.locator('h2')).toBeVisible();
  await expect(codeQuote).not.toHaveAttribute('data-callout');
  await expect(codeQuote.locator('pre')).toContainText('[!WARNING]');
  await expect(codeQuote.locator('pre')).toBeVisible();
  await expect(rendered.locator('[data-callout]')).toHaveCount(CALLOUTS.length);
});

test('a marker in a code span, in bold or escaped is not a callout @parity @rich-text', async ({ app }) => {
  const rendered = app.rendered();

  // As in the preview, which reads the marker from the source: only plain text makes a callout
  for (const { body, marker } of [
    { body: 'A marker in a code span is not a callout.', marker: '[!TIP]' },
    { body: 'A bold marker is not a callout.', marker: '[!NOTE]' },
    { body: 'An escaped marker is not a callout.', marker: '[!NOTE]' },
  ]) {
    const quote = rendered.locator('blockquote', { hasText: body });

    await expect(quote).not.toHaveAttribute('data-callout');
    await expect(quote).toContainText(marker, { useInnerText: true });
  }

  await expect(rendered.locator('[data-callout]')).toHaveCount(CALLOUTS.length);
});

test('editing a quote with an escaped marker keeps the escape @parity @rich-text', async ({ app, page }) => {
  await app.placeCursorAfter('An escaped marker is not a callout.');
  await page.keyboard.type(' X');

  await expect(app.rendered().locator('blockquote', { hasText: 'An escaped marker is not a callout. X' })).not.toHaveAttribute('data-callout');

  await app.save();
  expect(await app.readFile('callouts.md')).toBe(seedText('callouts.md').replace('An escaped marker is not a callout.', 'An escaped marker is not a callout. X'));
});

test('typing in a callout keeps the box and changes only that line @parity @rich-text', async ({ app, page }) => {
  await app.placeCursorAfter('Note body.');
  await page.keyboard.type(' More.');

  await expect(app.rendered().locator('blockquote[data-callout="note"]')).toContainText('Note body. More.');
  await expect(app.rendered().locator('blockquote[data-callout="note"] .callout-title')).toHaveText('Note');

  await app.save();
  expect(await app.readFile('callouts.md')).toBe(seedText('callouts.md').replace('Note body.', 'Note body. More.'));
});

test('changing [!NOTE] to [!TIP] turns the box into a tip @parity @rich-text', async ({ app, page }) => {
  const rendered = app.rendered();

  if (app.editorMode === 'wysiwyg') {
    // The title stands in for the marker; clicking it shows the marker as text to edit
    await rendered.locator('blockquote[data-callout="note"] .callout-title').click();
    await expect(rendered.locator('blockquote').first()).toContainText('[!NOTE]', { useInnerText: true });
  } else {
    await app.placeCursorAfter('[!NOTE]');
  }

  for (let i = 0; i < 'NOTE]'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('TIP]');

  // Both quotes are tips now; the edited one keeps its own body
  await expect(rendered.locator('blockquote[data-callout="tip"]')).toHaveCount(2);
  await expect(rendered.locator('blockquote[data-callout="note"]')).toHaveCount(0);
  await expect(rendered.locator('blockquote[data-callout="tip"]').first()).toContainText('Note body.');

  await app.save();
  expect(await app.readFile('callouts.md')).toBe(seedText('callouts.md').replace('> [!NOTE]', '> [!TIP]'));
});

test('saving callouts without edits leaves the file byte-identical @rich-text', async ({ app, page }) => {
  const before = await app.fileModified('callouts.md');

  await app.editingSurface().click();
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => app.fileModified('callouts.md')).toBeGreaterThan(before);
  expect(await app.readFile('callouts.md')).toBe(seedText('callouts.md'));
});

for (const { kind, marker, body } of [
  { kind: 'note', marker: '[!NOTE]', body: 'Note body.' },
  { kind: 'caution', marker: '[!CAUTION]', body: 'Caution body, the marker on a paragraph of its own.' },
]) {
  test(`Backspace at the start of a ${kind} body shows the marker instead of deleting it @rich-text`, async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'the marker is hidden only in rich text; in Markdown Backspace joins two visible lines');
    const box = app.rendered().locator(`blockquote[data-callout="${kind}"]`);
    const before = await app.fileModified('callouts.md');
    // The browser's caret at the start of the body, then Backspace at once: the editor takes the
    // caret from the browser a moment later, and Backspace must not act on the old one
    await app.placeCursorAfter(body);
    // Two frames for the editor to finish writing the click/End caret back, or it overwrites the one set below
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await box.evaluate((quote, text) => {
      const walker = document.createTreeWalker(quote, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.startsWith(text)) {
          document.getSelection()?.collapse(node, 0);

          return;
        }
      }

      throw new Error(`no text starts with "${text}"`);
    }, body);
    await page.keyboard.press('Backspace');

    // The hidden marker and its line break are still there, now shown as text with the box in place
    // Body first: a Backspace on a stale caret at the end of the body shows up here as a lost last character
    await expect(box).toContainText(body);
    await expect(box).toContainText(marker, { useInnerText: true });
    await expect(box).toHaveCount(1);

    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => app.fileModified('callouts.md')).toBeGreaterThan(before);
    expect(await app.readFile('callouts.md')).toBe(seedText('callouts.md'));
  });
}
