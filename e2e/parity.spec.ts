// Editor parity: every construct in folder/fixture.md renders in the Markdown preview and in rich
// text opened on its own. A known gap is marked with knownGap(), so the test is expected to fail in
// that project; once the gap is fixed the test passes, which turns it red until the marker goes.
import type { Locator } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, knownGap } from './fixtures';

async function expectImageShown(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('fixture.md');
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test.describe('images', () => {
  test('relative image @parity @images', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Relative image', exact: true }));
  });

  test('web image @parity @images', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Web image', exact: true }));
  });

  test('data-URL image @parity @images', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Data image', exact: true }));
  });

  test('raw HTML image @parity @images', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'HTML image', exact: true }));
  });

  // A relative srcset candidate wins over the resolved src unless it is resolved too (#185)
  test('picture source @parity @images', async ({ app }) => {
    const image = app.rendered().getByRole('img', { name: 'Picture image', exact: true });

    await expectImageShown(image);
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.currentSrc.startsWith('blob:'))).toBe(true);
  });

  test('srcset image @parity @images', async ({ app }) => {
    const image = app.rendered().getByRole('img', { name: 'Srcset image', exact: true });

    await expectImageShown(image);
    await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.currentSrc.startsWith('blob:'))).toBe(true);
  });

  test('relative audio @parity @images', async ({ app }) => {
    const audio = app.rendered().locator('audio');

    await expect.poll(() => audio.evaluate((media) => media instanceof HTMLMediaElement && media.src.startsWith('blob:') && media.readyState >= 1)).toBe(true);
  });
});

test('Mermaid diagram @parity @diagrams', async ({ app }) => {
  const diagram = app.rendered().getByRole('img', { name: 'Diagram: graph TD' }).locator('svg');

  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('Start');
  await expect(diagram).toContainText('Finish');
});

test('table @parity', async ({ app }) => {
  const table = app.rendered().locator('table');

  await expect(table.locator('th').first()).toHaveText('Fruit');
  await expect(table.locator('td').first()).toHaveText('Lime');
});

test('task list @parity', async ({ app }) => {
  const rendered = app.rendered();
  // The preview draws a checkbox; rich text marks the item and draws the box in CSS
  const done = rendered.locator(':is(li:has(> input[type="checkbox"]:checked), li[data-checked="true"])');
  const open = rendered.locator(':is(li:has(> input[type="checkbox"]:not(:checked)), li[data-checked="false"])');

  await expect(done).toContainText('Done task');
  await expect(open).toContainText('Open task');
  await expect(rendered).not.toContainText('[x]');
});

test('strikethrough @parity', async ({ app }) => {
  await expect(app.rendered().locator(':is(del, s)')).toHaveText('struck out');
});

test('callout @parity', async ({ app }) => {
  await expect(app.rendered().locator('[data-callout="note"]')).toContainText('Callout body text.');
  // Rich text keeps the marker in the document, hidden while the title stands in for it
  await expect(app.rendered()).not.toContainText('[!NOTE]', { useInnerText: true });
});

test('highlighted code @parity @code', async ({ app }) => {
  knownGap(app, 'wysiwyg', 212, 'rich text code blocks have no syntax highlighting');

  await expect(app.rendered().locator('pre .hljs-keyword')).toHaveText('const');
});

test('math @parity @math', async ({ app }) => {
  await expect(app.rendered().locator('.katex')).toHaveCount(2);
  await expect(app.rendered()).not.toContainText('$a^2');
});

test('footnotes @parity', async ({ app }) => {
  await expect(app.rendered().locator('sup')).toHaveText('1');
  await expect(app.rendered()).toContainText('The footnote text.');
  await expect(app.rendered()).not.toContainText('[^1]');
});
