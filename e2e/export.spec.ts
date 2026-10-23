// Export, started from either editor: PDF prints the pages the export preview shows (#196), Web
// page stays one flowing page with fonts and images built in, Word, portable Markdown, Image (page
// PNGs and a .zip, #193-#195), the preflight warnings and Copy as rich text. The browser's print
// dialog is replaced by a stub that keeps the printed document, which is then printed for real by
// the same engine to count its sheets.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText, type MarkloomApp, type SavedFile } from './fixtures';

const EDIT = 'Edited right before export';

/** The last paragraph of pages.md */
const LAST_PARAGRAPH = 'The last paragraph of the fixture.';

/** An A4 page at 96 dpi, saved at 2x */
const A4_PNG: PngSize = { width: 1588, height: 2246 };

declare global {
  interface Window {
    __e2ePrinted?: string;
    __e2ePrintTitle?: string;
    __e2ePrintToast?: string;
  }
}

/** Adds a paragraph at the end of the document in the active editor, as a user would. */
async function appendParagraph(app: MarkloomApp, text: string): Promise<void> {
  if (app.editorMode === 'split') {
    await app.editingSurface().click();
    await app.page.keyboard.press('ControlOrMeta+End');
    await app.page.keyboard.press('Enter');
  } else {
    await app.rendered().getByText(LAST_PARAGRAPH).click();
    await app.page.keyboard.press('End');
  }

  await app.page.keyboard.press('Enter');
  await app.page.keyboard.type(text);
  await expect(app.rendered().locator('p').last()).toHaveText(text);
}

/** The pages of the export preview: the start of each page's text, read from its frame. */
async function previewPages(page: Page): Promise<string[]> {
  return page
    .getByRole('dialog')
    .locator('iframe[title^="Page "]')
    .evaluate((frame) => {
      // SAFETY: the locator matches only the preview's <iframe>, which is same-origin (srcdoc)
      const sections = (frame as HTMLIFrameElement).contentDocument?.querySelectorAll('section.page') ?? [];

      return Array.from(sections, (section) => (section.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
    });
}

async function pageCount(page: Page): Promise<number> {
  const label = page.getByRole('dialog').getByText(/^Page 1 of \d+$/);

  await expect(label).toBeVisible({ timeout: 30_000 });

  return Number((await label.textContent())?.match(/of (\d+)/)?.[1]);
}

/** Opens the Export dialog on a format */
async function openExport(page: Page, format: string): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: format }).click();

  return dialog;
}

interface PngSize {
  width: number;
  height: number;
}

/** Width and height from a PNG's header */
function pngSize(bytes: Buffer): PngSize {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function zipText(file: SavedFile, path: string): Promise<string> {
  return (await (await JSZip.loadAsync(file.bytes)).file(path)?.async('string')) ?? '';
}

/** The text of a Word document's runs */
async function docxText(file: SavedFile): Promise<string> {
  const xml = await zipText(file, 'word/document.xml');

  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (match) => match[1]).join('');
}

async function exportWord(page: Page): Promise<SavedFile> {
  const dialog = await openExport(page, 'Word');

  return downloadOf(page, () => dialog.getByRole('button', { name: 'Export Word' }).click());
}

/** A Word document's paragraphs as XML */
async function docxParagraphs(file: SavedFile): Promise<string[]> {
  return (await zipText(file, 'word/document.xml')).match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
}

/** The alt text (`descr`) of each image in some Word XML, in order */
function imageAlts(xml: string): string[] {
  return Array.from(xml.matchAll(/<wp:docPr\b[^>]*\bdescr="([^"]*)"/g), (match) => match[1]);
}

/** Clicks Copy as rich text and reads back what went on the clipboard */
async function copyRichText(page: Page): Promise<{ html: string; text: string }> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: 'Copy as rich text' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied as rich text' })).toBeVisible({ timeout: 15_000 });

  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();

    return {
      html: await (await item.getType('text/html')).text(),
      text: await (await item.getType('text/plain')).text(),
    };
  });
}

test.beforeEach(async ({ app }) => {
  await app.openFolder();
});

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test.describe('pages.md', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('pages.md');
  });

  test('PDF prints the previewed pages, page for page @export', async ({ app, page, context }) => {
    // The print iframe is a child frame: keep what it prints instead of opening the dialog
    await page.addInitScript(() => {
      if (window === window.top) return;

      window.print = () => {
        // SAFETY: the print frame is same-origin with the app, so its top window is the app's
        (window.top as Window).__e2ePrinted = `<!doctype html>\n${document.documentElement.outerHTML}`;
      };
    });

    await appendParagraph(app, EDIT);
    await page.keyboard.press('ControlOrMeta+e');

    const dialog = page.getByRole('dialog');

    await dialog.getByRole('radio', { name: 'PDF' }).click();

    const count = await pageCount(page);

    expect(count).toBeGreaterThan(2);

    const preview = await previewPages(page);

    expect(preview).toHaveLength(count);

    // Image shows the same layout
    await dialog.getByRole('radio', { name: 'Image' }).click();
    expect(await pageCount(page)).toBe(count);
    await dialog.getByRole('radio', { name: 'PDF' }).click();

    await dialog.getByRole('button', { name: 'Export PDF' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__e2ePrinted ?? null)).not.toBeNull();

    const printed = (await page.evaluate(() => window.__e2ePrinted)) ?? '';

    expect(printed).toContain('@page { size: A4 portrait; margin: 0; }');
    // The edit made just before opening the dialog ends the last page
    expect(printed).toMatch(/<p[^>]*>Edited right before export<\/p>\s*<\/section>\s*<\/body>/);

    const printedPages = await page.evaluate((html) => {
      const sections = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section.page');

      return Array.from(sections, (section) => (section.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
    }, printed);

    expect(printedPages).toEqual(preview);

    // Print the same document: one sheet per page, no blank page at the end
    const printer = await context.newPage();

    await printer.setContent(printed);
    await printer.evaluate(() => document.fonts.ready);

    const pdf = (await printer.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');

    expect(pdf.match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(count);
    await printer.close();
  });

  test('Web page export stays one flowing page @export', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+e');

    const dialog = page.getByRole('dialog');

    await dialog.getByRole('radio', { name: 'Web page' }).click();
    await expect(dialog.getByText(/^Page 1 of/)).toHaveCount(0);

    const download = page.waitForEvent('download');

    await dialog.getByRole('button', { name: 'Export Web page' }).click();

    const path = await (await download).path();
    const html = readFileSync(path, 'utf8');

    expect(html).toContain('<main class="document">');
    expect(html).not.toContain('class="page"');
    expect(html).toContain('Paragraph 6.5.');
  });

  test('Image saves one page or every page as PNG (#194) @export', async ({ page }) => {
    // Draws every page as a 2x PNG, which takes a while next to other busy workers
    test.slow();

    const dialog = await openExport(page, 'Image');
    const count = await pageCount(page);

    expect(count).toBeGreaterThan(2);

    const one = await downloadOf(page, () => dialog.getByRole('button', { name: 'Save this page' }).click());

    expect(one.name).toBe('Pages fixture-01.png');
    expect(pngSize(one.bytes)).toEqual(A4_PNG);

    await openExport(page, 'Image');
    await pageCount(page);

    const all = await downloadOf(page, () => dialog.getByRole('button', { name: 'Save all pages' }).click());
    const zip = await JSZip.loadAsync(all.bytes);
    const names = Object.keys(zip.files);

    expect(all.name).toBe('Pages fixture.zip');
    expect(names).toHaveLength(count);
    expect(names).toContain(`Pages fixture-${String(count).padStart(2, '0')}.png`);

    const second = zip.file('Pages fixture-02.png');

    expect(second).not.toBeNull();
    expect(pngSize(Buffer.from((await second?.async('uint8array')) ?? []))).toEqual(A4_PNG);
  });

  test('Image pages follow the chosen page size (#197) @export', async ({ page }) => {
    // Lays the document out twice and draws a 2x PNG
    test.slow();

    const dialog = await openExport(page, 'Image');

    await pageCount(page);
    await dialog.getByRole('radio', { name: 'Letter' }).click();
    await pageCount(page);

    const one = await downloadOf(page, () => dialog.getByRole('button', { name: 'Save this page' }).click());

    expect(pngSize(one.bytes)).toEqual({ width: 1632, height: 2112 });
  });

  test('Browser PDF names the print job after the File name field and says what to pick (#165) @export', async ({ page }) => {
    // Chrome and Edge suggest the tab's title as the PDF's name: keep what the app shows when print() runs
    await page.addInitScript(() => {
      if (window === window.top) return;

      window.print = () => {
        // SAFETY: the print frame is same-origin with the app, so its top window is the app's
        const top = window.top as Window;

        top.__e2ePrintTitle = top.document.title;
        top.__e2ePrintToast = Array.from(top.document.querySelectorAll('[role="status"]'), (el) => el.textContent ?? '').join('\n');
      };
    });

    const dialog = await openExport(page, 'PDF');

    await pageCount(page);
    await dialog.getByLabel('File name').fill('Quarterly: report');
    await dialog.getByRole('button', { name: 'Export PDF' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__e2ePrintTitle ?? null)).toBe('Quarterly- report');
    expect(await page.evaluate(() => window.__e2ePrintToast)).toContain('Save as PDF');
    await expect(page.getByRole('status').filter({ hasText: 'Save as PDF' })).toBeVisible();
    await expect(page).toHaveTitle(/^Markloom/);
    await expect(page.getByRole('status').filter({ hasText: 'Exported' })).toHaveCount(0);
  });
});

test.describe('fixture.md', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('fixture.md');
  });

  test('Word @export', async ({ page }) => {
    const file = await exportWord(page);
    const media = Object.keys((await JSZip.loadAsync(file.bytes)).files).filter((name) => name.startsWith('word/media/'));

    expect(file.name).toBe('Parity fixture.docx');
    expect(await docxText(file)).toContain('Callout body text.');
    // Images and the diagram are embedded
    expect(media.length).toBeGreaterThanOrEqual(2);
  });

  test('Word typesets math (#201) @export @math', async ({ page }) => {
    const file = await exportWord(page);

    expect(await docxText(file)).not.toContain('a^2');
    expect(imageAlts(await zipText(file, 'word/document.xml'))).toContain('a^2 + b^2 = c^2');
  });

  test('Word writes footnotes as footnotes (#204) @export', async ({ page }) => {
    const file = await exportWord(page);

    expect(await zipText(file, 'word/footnotes.xml')).toContain('The footnote text.');
    expect(await zipText(file, 'word/document.xml')).toContain('<w:footnoteReference w:id="1"/>');
    expect(await docxText(file)).not.toContain('[^1]');
    expect(await docxText(file)).not.toContain('The footnote text.');
  });

  test('Web page has its fonts, images and diagram built in @export @diagrams @images', async ({ page }) => {
    const dialog = await openExport(page, 'Web page');
    const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
    const html = file.bytes.toString('utf8');
    const relativeImage = /<img\b[^>]*\balt="Relative image"[^>]*>/.exec(html)?.[0] ?? '';

    expect(file.name).toBe('Parity fixture.html');
    expect(html).toMatch(/@font-face\s*\{[^}]*src:\s*url\(\s*["']?data:/);
    expect(relativeImage).toContain('src="data:image/png;base64,');
    expect(html).toMatch(/<svg[\s\S]*Finish/);
  });

  test('portable Markdown embeds images and diagrams @export @diagrams @images', async ({ page }) => {
    const dialog = await openExport(page, 'Markdown');
    const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Markdown' }).click());
    const text = file.bytes.toString('utf8');

    expect(file.name).toBe('Parity fixture.md');
    expect(text).toContain('![Relative image](data:image/png;base64,');
    expect(text).toContain('![Diagram](data:image/svg+xml');
    expect(text).not.toContain('```mermaid');
    // Web addresses stay as written
    expect(text).toContain('![Web image](https://images.e2e.test/web.png)');
  });

  test('Copy as rich text puts formatted HTML on the clipboard @export', async ({ page }) => {
    const clipboard = await copyRichText(page);

    expect(clipboard.html).toContain('Callout body text.');
    expect(clipboard.html).toContain('<table');
    // Diagrams go as PNG, which email clients show
    expect(clipboard.html).toMatch(/<img\b[^>]*src="data:image\/png;base64,/);
    // Plain-text targets get the Markdown itself
    expect(clipboard.text).toContain('```mermaid');
  });
});

test.describe('copy.md', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('copy.md');
  });

  /** The `<img …>` tag with this alt text, or '' */
  const imageTag = (html: string, alt: string) => new RegExp(`<img\\b[^>]*\\balt="${alt}"[^>]*>`).exec(html)?.[0] ?? '';

  test('Copy as rich text links a //host image over https, as Web page export fetches it @export @images', async ({ page }) => {
    const clipboard = await copyRichText(page);

    expect(imageTag(clipboard.html, 'Protocol-relative image')).toContain('src="https://images.e2e.test/web.png"');

    const dialog = await openExport(page, 'Web page');
    const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
    const html = file.bytes.toString('utf8');

    expect(imageTag(html, 'Protocol-relative image')).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('Image not found');
  });

  test('Copy as rich text pastes an SVG image as a PNG @export @images', async ({ page }) => {
    const image = imageTag((await copyRichText(page)).html, 'SVG image');

    expect(image).toContain('src="data:image/png;base64,');
    expect(image).toContain('width="40"');
  });

  test('a PNG conversion failure says so, not Image not found @export @images', async ({ page }) => {
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
        callback(null);
      };
    });

    const { html } = await copyRichText(page);

    expect(html).toContain('Image could not be converted');
    expect(html).toContain('data:image/svg+xml');
    expect(html).not.toContain('Image not found');
  });
});

test.describe('math.md', () => {
  /** Every formula in math.md, in order: three inline (one in a heading), then six display */
  const FORMULAS = ['x^2', 'a+b', 'E=mc^2', '\\int_0^1 x\\,dx', 'F=ma', 'E=mc^2', 'G=mc^3', 'q^2', 'l^2'];

  const BROKEN = '$\\frac{1}{$';

  test.beforeEach(async ({ app }) => {
    await app.openFile('math.md');
  });

  test('Word places every formula as a sharp image, display ones centred (#201) @export @math', async ({ page }) => {
    const file = await exportWord(page);
    const paragraphs = await docxParagraphs(file);
    const xml = paragraphs.join('');

    expect(imageAlts(xml)).toEqual(FORMULAS);
    expect(await docxText(file)).not.toContain('x^2');
    // In place: inline formulas inside their sentence, display ones on their own centred line
    const sentence = paragraphs.find((paragraph) => imageAlts(paragraph).includes('x^2')) ?? '';

    expect(imageAlts(sentence)).toEqual(['x^2', 'a+b']);
    expect(sentence).toMatch(/>Inline <\/w:t>/);
    expect(sentence).not.toContain('<w:jc ');
    expect(paragraphs.find((paragraph) => imageAlts(paragraph).includes('F=ma'))).toContain('<w:jc w:val="center"/>');

    // Sharp: every picture holds twice the pixels of its size on the page (EMU at 96 dpi)
    const zip = await JSZip.loadAsync(file.bytes);
    const pixelWidths = await Promise.all(zip.file(/^word\/media\//).map(async (png) => pngSize(Buffer.from(await png.async('uint8array'))).width));
    const pageWidths = Array.from(xml.matchAll(/<wp:extent cx="(\d+)"/g), (match) => Number(match[1]) / 9525);

    expect(pageWidths).toHaveLength(FORMULAS.length);

    for (const width of pageWidths) {
      expect(width).toBeGreaterThan(8);
      expect(pixelWidths.some((pixels) => Math.abs(pixels - 2 * width) <= 2), `a ${width}px formula at 2x`).toBe(true);
    }

    // An invalid formula stays readable as its source, in red
    const broken = paragraphs.find((paragraph) => paragraph.includes(BROKEN)) ?? '';

    expect(broken).toContain('<w:color w:val="991B1B"/>');
  });

  test('Copy as rich text pastes formulas as images with their TeX as alt text (#201) @export @math', async ({ page }) => {
    const { html } = await copyRichText(page);
    const images = Array.from(html.matchAll(/<img\b[^>]*>/g), (match) => match[0]);

    expect(images.map((img) => /\balt="([^"]*)"/.exec(img)?.[1])).toEqual(FORMULAS);

    for (const img of images) expect(img).toMatch(/src="data:image\/png;base64,/);

    // KaTeX's markup needs a stylesheet, which a paste drops
    expect(html).not.toContain('class="katex');
    // Inline formulas sit on the baseline, display ones are centred
    expect(images[0]).toMatch(/vertical-align:\s*-\d/);
    expect(html).toMatch(/<div class="math math-display"[^>]*text-align:center[^>]*><img\b[^>]*alt="F=ma"/);

    const broken = /<span\b([^>]*)>([^<]*)<\/span>/.exec(html.slice(html.indexOf('Broken')));

    expect(broken?.[2]).toBe(BROKEN);
    expect(broken?.[1]).toContain('math-error');
    expect(broken?.[1]).toContain('color:#991B1B');
  });

  test('a formula edited in rich text exports as edited (#201) @export @math @rich-text', async ({ app, page }) => {
    test.skip(app.editorMode !== 'wysiwyg', 'edits a formula in rich text');

    const formula = app.rendered().locator('.rt-math').first();

    await formula.click();

    const source = page.getByRole('textbox', { name: 'Math TeX source' });

    await source.fill('x^3');
    await source.press('Enter');
    await expect(formula.locator('annotation')).toHaveText('x^3');
    // A caret, not the formula selected, so the whole document is copied
    await app.rendered().getByText('costs $5 and $10 today.').click();
    await expect
      .poll(() => page.evaluate(() => (getSelection()?.isCollapsed ?? false) && (getSelection()?.anchorNode?.textContent ?? '').includes('today')))
      .toBe(true);

    expect(imageAlts(await zipText(await exportWord(page), 'word/document.xml'))[0]).toBe('x^3');
    expect((await copyRichText(page)).html).toMatch(/<img\b[^>]*alt="x\^3"/);
  });
});

test.describe('broken.md', () => {
  test.beforeEach(async ({ app }) => {
    await app.openFile('broken.md');
  });

  test('preflight warns about a broken diagram and shows its line @export @diagrams', async ({ app, page }) => {
    const dialog = await openExport(page, 'Web page');

    await expect(dialog).toContainText('1 diagram has an error');

    const issue = dialog.getByRole('listitem').filter({ hasText: 'Line 9' });

    await expect(issue).toBeVisible();

    if (app.editorMode === 'wysiwyg') {
      // Showing the line switches to Markdown, which this project keeps out of rich text
      await expect(issue.getByRole('button', { name: 'Show in Markdown' })).toBeVisible();

      return;
    }

    await issue.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cm-activeLine')).toHaveText('  C --> D');
  });

  test('preflight warns about broken formulas and shows their lines (#202) @export @math', async ({ app, page }) => {
    const dialog = await openExport(page, 'Web page');

    // Counted by kind: the formulas aren't missing images
    await expect(dialog).toContainText('1 diagram has an error · 3 formulas have errors');
    await expect(dialog).not.toContainText('missing');

    const issues = dialog.getByRole('listitem');

    // Inline on a paragraph's second line, display (its opening $$) and in a table cell (its row)
    await expect(issues).toHaveText([/^Line 9 · /, /^Line 15 · Unexpected end of input/, /^Line 17 · Expected '}'/, /^Line 23 · Expected '}'/]);

    const issue = issues.filter({ hasText: 'Line 15' });

    if (app.editorMode === 'wysiwyg') {
      // Showing the line switches to Markdown, which this project keeps out of rich text
      await expect(issue.getByRole('button', { name: 'Show in Markdown' })).toBeVisible();

      return;
    }

    await issue.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cm-activeLine')).toHaveText('onto a broken formula $\\frac{1}{$ here.');
  });
});

/** Width over height of the page the preview shows */
async function previewAspect(page: Page): Promise<number> {
  const box = await page.getByRole('dialog').locator('iframe[title^="Page "]').boundingBox();

  return box ? box.width / box.height : 0;
}

/** Saves the shown page (which closes the dialog) and reopens Export > Image */
async function saveThisPage(page: Page): Promise<PngSize> {
  const dialog = page.getByRole('dialog');
  const download = page.waitForEvent('download');

  await dialog.getByRole('button', { name: 'Save this page' }).click();

  const size = pngSize(readFileSync(await (await download).path()));

  await expect(dialog).toBeHidden();
  await page.keyboard.press('ControlOrMeta+e');
  await dialog.getByRole('radio', { name: 'Image' }).click();

  return size;
}

test('Image and PDF use the chosen page size and orientation, and remember it @export', async ({ app, page }) => {
  // Lays the document out about ten times and saves two pages
  test.setTimeout(180_000);

  await page.addInitScript(() => {
    if (window === window.top) return;

    window.print = () => {
      // SAFETY: the print frame is same-origin with the app, so its top window is the app's
      (window.top as Window).__e2ePrinted = `<!doctype html>\n${document.documentElement.outerHTML}`;
    };
  });

  await app.openFile('pages.md');
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog');
  const size = dialog.getByRole('radiogroup', { name: 'Page size' });
  const orientation = dialog.getByRole('radiogroup', { name: 'Orientation' });

  // Paged formats only
  await expect(size).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Image' }).click();
  await expect(size.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
  await expect(orientation.getByRole('radio', { name: 'Portrait' })).toHaveAttribute('aria-checked', 'true');

  const portraitPages = await pageCount(page);

  await expect.poll(() => previewAspect(page)).toBeCloseTo(210 / 297, 2);

  // Letter portrait: 8.5 × 11 in at 96 dpi, 2x
  await size.getByRole('radio', { name: 'Letter' }).click();
  await expect.poll(() => previewAspect(page)).toBeCloseTo(8.5 / 11, 2);
  await pageCount(page);
  expect(await saveThisPage(page)).toEqual({ width: 1632, height: 2112 });

  // Quick toggling ends on the last choice, not on a slower earlier layout
  await orientation.getByRole('radio', { name: 'Landscape' }).click();
  await size.getByRole('radio', { name: 'A4' }).click();
  await size.getByRole('radio', { name: 'Letter' }).click();
  await size.getByRole('radio', { name: 'A4' }).click();
  await expect.poll(() => previewAspect(page)).toBeCloseTo(297 / 210, 2);
  await dialog.getByRole('button', { name: 'Next page' }).click();
  await expect(dialog.getByText(/^Page 2 of \d+$/)).toBeVisible();

  // A shorter content box holds less per page; changing the paper starts again at page 1
  await size.getByRole('radio', { name: 'Letter' }).click();
  await size.getByRole('radio', { name: 'A4' }).click();
  expect(await pageCount(page)).toBeGreaterThan(portraitPages);
  expect(await saveThisPage(page)).toEqual({ width: 2246, height: 1588 });

  // PDF prints the same paper, so the print dialog preselects it
  await size.getByRole('radio', { name: 'Letter' }).click();
  await dialog.getByRole('radio', { name: 'PDF' }).click();
  await expect(size.getByRole('radio', { name: 'Letter' })).toHaveAttribute('aria-checked', 'true');
  await pageCount(page);
  await dialog.getByRole('button', { name: 'Export PDF' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__e2ePrinted ?? null)).not.toBeNull();
  expect((await page.evaluate(() => window.__e2ePrinted)) ?? '').toContain('@page { size: Letter landscape; margin: 0; }');

  // Kept across a restart
  await page.reload();
  await app.openFolder();
  await app.openFile('pages.md');
  await page.keyboard.press('ControlOrMeta+e');
  await dialog.getByRole('radio', { name: 'Image' }).click();
  await expect(size.getByRole('radio', { name: 'Letter' })).toHaveAttribute('aria-checked', 'true');
  await expect(orientation.getByRole('radio', { name: 'Landscape' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => previewAspect(page)).toBeCloseTo(11 / 8.5, 2);
});
