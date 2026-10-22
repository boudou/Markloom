// Editor parity: every construct in folder/fixture.md renders in the Markdown preview and in rich
// text opened on its own. A known gap is marked with knownGap(), so the test is expected to fail in
// that project; once the gap is fixed the test passes, which turns it red until the marker goes.
import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';

type ProjectName = 'markdown' | 'rich-text';

function knownGap(project: ProjectName, issue: number, gap: string): void {
  test.fail(test.info().project.name === project, `#${issue}: ${gap}`);
}

async function expectImageShown(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
  await app.openFile('fixture.md');
});

// Rich text has to manage without anything only the preview loads (a library, its CSS, a cache)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test.describe('images', () => {
  test('relative image', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Relative image', exact: true }));
  });

  test('web image', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Web image', exact: true }));
  });

  test('data-URL image', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'Data image', exact: true }));
  });

  test('raw HTML image', async ({ app }) => {
    await expectImageShown(app.rendered().getByRole('img', { name: 'HTML image', exact: true }));
  });
});

test('Mermaid diagram', async ({ app }) => {
  const diagram = app.rendered().getByRole('img', { name: 'Diagram: graph TD' }).locator('svg');

  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('Start');
  await expect(diagram).toContainText('Finish');
});

test('table', async ({ app }) => {
  const table = app.rendered().locator('table');

  await expect(table.locator('th').first()).toHaveText('Fruit');
  await expect(table.locator('td').first()).toHaveText('Lime');
});

test('task list', async ({ app }) => {
  const rendered = app.rendered();
  // The preview draws a checkbox; rich text marks the item and draws the box in CSS
  const done = rendered.locator(':is(li:has(> input[type="checkbox"]:checked), li[data-checked="true"])');
  const open = rendered.locator(':is(li:has(> input[type="checkbox"]:not(:checked)), li[data-checked="false"])');

  await expect(done).toContainText('Done task');
  await expect(open).toContainText('Open task');
  await expect(rendered).not.toContainText('[x]');
});

test('strikethrough', async ({ app }) => {
  await expect(app.rendered().locator(':is(del, s)')).toHaveText('struck out');
});

test('callout', async ({ app }) => {
  knownGap('rich-text', 211, 'rich text shows callouts as a plain quote with a literal [!NOTE]');

  await expect(app.rendered().locator('[data-callout="note"]')).toContainText('Callout body text.');
  await expect(app.rendered()).not.toContainText('[!NOTE]');
});

test('highlighted code', async ({ app }) => {
  knownGap('rich-text', 212, 'rich text code blocks have no syntax highlighting');

  await expect(app.rendered().locator('pre .hljs-keyword')).toHaveText('const');
});

test('math', async ({ app }) => {
  await expect(app.rendered().locator('.katex')).toHaveCount(2);
  await expect(app.rendered()).not.toContainText('$a^2');
});

test('footnotes', async ({ app }) => {
  knownGap('markdown', 203, 'the preview shows footnotes as literal [^1] text');

  await expect(app.rendered().locator('sup')).toHaveText('1');
  await expect(app.rendered()).toContainText('The footnote text.');
  await expect(app.rendered()).not.toContainText('[^1]');
});
