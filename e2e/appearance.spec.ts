// The appearance setting (#228): a stored 'dark' marks <html> dark before first paint, 'system'
// follows the OS live, the default follows the OS (#233), and exports stay light whatever the app shows.
// Dialogs, menus and toasts take their edges, backdrops and status colours from the theme (#229).
// The source editors, the preview and rich text follow it too, without losing undo history (#230).
// Mermaid diagrams are drawn in a dark palette and redraw on a switch; exports keep light ones (#231).
// Settings > Appearance and a palette command choose the theme, every fixture is dark, and the
// title-bar logo turns white (#233).
import JSZip from 'jszip';
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';
import { background, borderColor, color, contrastRatio, paintedBehind, startWith, type Appearance } from './colours';

interface FirstPaint {
  dark: boolean;
  colorScheme: string;
}

declare global {
  interface Window {
    __e2eFirstPaint?: FirstPaint;
  }
}

const DARK_CANVAS = 'rgb(23, 25, 28)';

const WHITE = 'rgb(255, 255, 255)';

/** Mermaid writes its palette into each SVG's <style>: the text colour tells the palettes apart */
const LIGHT_DIAGRAM_TEXT = '#1E293B';

const DARK_DIAGRAM_TEXT = '#E8EAED';

function hasColour(css: string, colour: string): boolean {
  return css.toUpperCase().includes(colour);
}

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}

async function colorScheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.style.colorScheme);
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

const WINDOW_CALLS_KEY = 'e2e-window-prefs-calls';

/** The appearances the fake desktop bridge was sent, oldest first */
async function windowAppearances(page: Page): Promise<(Appearance | undefined)[]> {
  return page.evaluate((key) => {
    const calls: { appearance?: Appearance }[] = JSON.parse(localStorage.getItem(key) ?? '[]');

    return calls.map((call) => call.appearance);
  }, WINDOW_CALLS_KEY);
}

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('a stored dark appearance is on <html> before first paint @appearance', async ({ app }) => {
  const { page } = app;

  // Records <html> the moment <body> exists, before any app script has run
  await page.addInitScript(() => {
    if (window !== window.top) return;

    new MutationObserver((_records, observer) => {
      if (!document.body) return;

      const root = document.documentElement;

      window.__e2eFirstPaint = { dark: root.classList.contains('dark'), colorScheme: root.style.colorScheme };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await startWith(page, 'dark');

  expect(await page.evaluate(() => window.__e2eFirstPaint)).toEqual({ dark: true, colorScheme: 'dark' });
  await expect.poll(() => bodyBackground(page)).toBe(DARK_CANVAS);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E2024');
});

test('system follows the OS without a reload @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await startWith(page, 'system');
  expect(await isDark(page)).toBe(false);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await colorScheme(page)).toBe('dark');
  expect(await bodyBackground(page)).toBe(DARK_CANVAS);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => isDark(page)).toBe(false);
  expect(await colorScheme(page)).toBe('light');
  expect(await bodyBackground(page)).toBe(WHITE);
});

test('a fresh profile follows a dark OS @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();

  expect(await isDark(page)).toBe(true);
  expect(await colorScheme(page)).toBe('dark');
  await expect.poll(() => bodyBackground(page)).toBe(DARK_CANVAS);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E2024');
});

test('a fresh profile follows a light OS @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();

  expect(await isDark(page)).toBe(false);
  expect(await colorScheme(page)).toBe('light');
  expect(await bodyBackground(page)).toBe(WHITE);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F8F9FA');
});

test('the desktop window is told the stored appearance at startup @appearance @desktop', async ({ app }) => {
  const { page } = app;

  // A fake desktop bridge that records what updateWindowPrefs receives
  await page.addInitScript((callsKey) => {
    if (window !== window.top) return;

    Object.defineProperty(window, 'markloomDesktop', {
      value: {
        isDesktop: true,
        platform: 'win32',
        takePendingFiles: async () => ({ files: [], folder: null }),
        onOpenFiles: () => () => {},
        onOpenFolder: () => () => {},
        listFolder: async () => [],
        readFile: async () => {
          throw new Error('No files here');
        },
        statFile: async () => {
          throw new Error('No files here');
        },
        writeFile: async () => {},
        printToPdf: async () => new Uint8Array(),
        updateWindowPrefs: async (changes: { appearance?: Appearance }) => {
          const calls = JSON.parse(localStorage.getItem(callsKey) ?? '[]');

          localStorage.setItem(callsKey, JSON.stringify([...calls, changes]));

          return { minimizeToTray: false, closeToTray: false };
        },
        setExplorerMenu: async () => ({ enabled: false, portable: false }),
      },
    });
  }, WINDOW_CALLS_KEY);

  await startWith(page, 'dark');
  expect(await windowAppearances(page)).toContain('dark');

  // Init scripts run in the order added, so this stored value replaces 'dark'
  await startWith(page, 'system');
  expect((await windowAppearances(page)).at(-1)).toBe('system');
});

test('a Web page exported in dark mode stays light @appearance @export', async ({ app, context }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('fixture.md');
  expect(await isDark(page)).toBe(true);

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const viewer = await context.newPage();

  await viewer.emulateMedia({ colorScheme: 'dark' });
  await viewer.setContent(file.bytes.toString('utf8'));
  expect(await bodyBackground(viewer)).toBe(WHITE);

  // The diagram is the light one (#231)
  const styles = await viewer.locator('svg > style').allTextContents();

  expect(styles.some((style) => hasColour(style, LIGHT_DIAGRAM_TEXT))).toBe(true);
  expect(styles.some((style) => hasColour(style, DARK_DIAGRAM_TEXT))).toBe(false);
  await viewer.close();
});

test('a Word document exported in dark mode keeps the light diagram (#231) @appearance @export @diagrams', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('fixture.md');
  expect(await isDark(page)).toBe(true);

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Word' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Word' }).click());
  const zip = await JSZip.loadAsync(file.bytes);

  const svgs = await Promise.all(
    Object.keys(zip.files).flatMap((name) => (/^word\/media\/.*\.svg$/.test(name) ? [zip.file(name)?.async('string') ?? ''] : []))
  );

  expect(svgs.some((svg) => hasColour(svg, LIGHT_DIAGRAM_TEXT))).toBe(true);
  expect(svgs.some((svg) => hasColour(svg, DARK_DIAGRAM_TEXT))).toBe(false);
});

/** What covers the window's top-left corner: a dialog's backdrop while one is open */
async function backdropColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const top = document.elementFromPoint(4, 4);

    return top ? getComputedStyle(top).backgroundColor : '';
  });
}

/** Black at `alpha`, as Chrome reports a colour-mixed scrim */
function blackAt(alpha: number): RegExp {
  return new RegExp(String.raw`^(rgba\(0, 0, 0, ${alpha}\)|oklab\(0 0 0 / ${alpha}\))$`);
}

async function boxShadow(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).boxShadow);
}

/** Copies the open document as rich text and returns the success toast's icon colour */
async function successToastIconColor(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('toolbar', { name: 'Document actions' }).getByRole('button', { name: 'Copy as rich text' }).click();

  const icon = page.getByRole('status').filter({ hasText: 'Copied as rich text' }).locator('svg').first();

  await expect(icon).toBeVisible({ timeout: 15_000 });

  return icon.evaluate((element) => getComputedStyle(element).color);
}

test('floating surfaces get a light edge and a black backdrop in dark mode (#229) @appearance @palette @export @documents', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('fixture.md');

  await page.keyboard.press('ControlOrMeta+Shift+P');

  const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Command' }) });

  await expect(palette).toBeVisible();
  expect(await boxShadow(palette)).toContain('rgba(255, 255, 255, 0.12)');
  await expect.poll(() => backdropColor(page)).toMatch(blackAt(0.25));
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await page.keyboard.press('ControlOrMeta+e');

  const exportDialog = page.getByRole('dialog', { name: 'Export' });

  await expect(exportDialog).toBeVisible();
  expect(await boxShadow(exportDialog)).toContain('rgba(255, 255, 255, 0.12)');
  await expect.poll(() => backdropColor(page)).toMatch(blackAt(0.4));
  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();

  await app.tab('fixture.md').click({ button: 'right' });

  const menu = page.getByRole('menu');

  await expect(menu).toBeVisible();
  expect(await boxShadow(menu)).toContain('rgba(255, 255, 255, 0.1)');
  await page.keyboard.press('Escape');

  expect(await successToastIconColor(page)).toBe('rgb(74, 222, 128)');
});

test('floating surfaces keep their light colours on a light OS (#229) @appearance @palette @export', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await app.openFolder();
  await app.openFile('fixture.md');

  await page.keyboard.press('ControlOrMeta+Shift+P');

  const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Command' }) });

  await expect(palette).toBeVisible();
  expect(await boxShadow(palette)).toContain('rgba(26, 26, 26, 0.12)');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  expect(await successToastIconColor(page)).toBe('rgb(21, 128, 61)');
});

/** Opens the Export dialog and returns its primary (Export …) button */
async function exportPrimaryButton(app: MarkloomApp): Promise<Locator> {
  const { page } = app;

  await app.openFolder();
  await app.openFile('fixture.md');
  await page.keyboard.press('ControlOrMeta+e');

  const button = page.getByRole('dialog', { name: 'Export' }).getByRole('button', { name: /^Export (Word|PDF|Web page|Markdown)/ });

  await expect(button).toBeVisible();

  return button;
}

test('primary buttons put dark text on the light accent in dark mode (#237) @appearance @export', async ({ app }) => {
  await startWith(app.page, 'dark');

  const button = await exportPrimaryButton(app);
  const [text, fill] = [await color(button), await background(button)];

  expect(fill).toBe('rgb(110, 168, 254)');
  expect(text).toBe(DARK_CANVAS);
  expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5);
});

test('primary buttons keep white text on a light OS (#237) @appearance @export', async ({ app }) => {
  await app.page.emulateMedia({ colorScheme: 'light' });

  const button = await exportPrimaryButton(app);

  expect(await background(button)).toBe('rgb(37, 99, 235)');
  expect(await color(button)).toBe(WHITE);
});

/** The checked task's tick image: the preview's checkbox, or rich text's ::before box */
async function taskTick(app: MarkloomApp): Promise<string> {
  if (app.editorMode === 'split') {
    return app.rendered().locator('.task-checkbox:checked').evaluate((box) => getComputedStyle(box).backgroundImage);
  }

  return app.rendered().locator("li[data-item-type='task'][data-checked='true']").evaluate((item) => getComputedStyle(item, '::before').backgroundImage);
}

/** Opens the find bar on `query`; matches are highlighted once it counts them */
async function find(page: Page, query: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+f');

  const bar = page.getByRole('search', { name: 'Find in document' });

  await expect(bar.getByRole('textbox', { name: 'Find' })).toBeFocused();
  await page.keyboard.type(query);
  await expect(bar).toContainText(/\d+ of \d+/);
}

/** Text of the Markdown source, the rich-text document's body text */
const DARK_SURFACE_TEXT = { split: 'rgb(232, 234, 237)', wysiwyg: 'rgb(211, 214, 219)' } as const;

test('the editors and the preview use dark colours in dark mode (#230) @appearance @editing @rich-text', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('dark.md');

  const rendered = app.rendered();

  if (app.editorMode === 'split') {
    const source = page.locator('.cm-editor');

    expect(await color(page.locator('.cm-content'))).toBe('rgb(232, 234, 237)');
    expect(await background(source)).toBe('rgba(0, 0, 0, 0)');
    expect(await paintedBehind(source)).toBe(DARK_CANVAS);
    expect(await color(source.locator('span', { hasText: /^https:\/\/example\.com\/nightowl$/ }))).toBe('rgb(158, 197, 254)');
    await app.placeCursorAfter('Checked nightowl task');
    expect(await background(source.locator('.cm-activeLine'))).toBe('rgba(38, 41, 46, 0.7)');
  }

  await expect(rendered.locator('.katex-error')).toHaveCount(1);
  await expect(rendered.locator('.mermaid-error')).toBeVisible({ timeout: 15_000 });

  const note = rendered.locator('blockquote[data-callout="note"]');

  expect(await note.evaluate((quote) => getComputedStyle(quote).borderLeftColor)).toBe('rgb(68, 147, 248)');
  // Not in the callout: the typography plugin makes code in a quote take the quote's colour
  expect(await color(rendered.locator('code', { hasText: 'inline nightowl' }))).toBe('rgb(253, 164, 175)');
  expect(await color(note.locator('kbd'))).toBe('rgb(232, 234, 237)');
  expect(await color(rendered.locator('.katex-error'))).toBe('rgb(248, 113, 113)');
  expect(await color(rendered.locator('.mermaid-error'))).toBe('rgb(252, 165, 165)');
  expect(await background(rendered.locator('.mermaid-error'))).toBe('rgb(42, 21, 23)');

  // Rich text draws the card borderless inside its diagram block
  if (app.editorMode === 'split') expect(await borderColor(rendered.locator('.mermaid-error'))).toBe('rgb(92, 42, 46)');

  expect(await taskTick(app)).toContain('%2317191C');

  if (app.editorMode === 'split') {
    // Grammars load when the browser is idle; the preview redraws then
    await expect(rendered.locator('pre .hljs-keyword')).toHaveText('const');
    expect(await color(rendered.locator('pre .hljs-keyword'))).toBe('rgb(197, 134, 192)');

    await find(page, 'nightowl');
    expect(await background(page.locator('.cm-searchMatch:not(.cm-searchMatch-selected)').first())).toBe('rgb(58, 45, 8)');
    expect(await background(page.locator('.cm-searchMatch-selected').first())).toBe('rgb(69, 53, 8)');
  } else {
    await find(page, 'nightowl');
    expect(await background(rendered.locator('.rt-find-match:not(.is-current)').first())).toBe('rgb(58, 45, 8)');
    expect(await background(rendered.locator('.rt-find-match.is-current').first())).toBe('rgb(69, 53, 8)');
  }
});

test('switching the appearance keeps the text and its undo history (#230) @appearance @editing @rich-text', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await startWith(page, 'system');
  await app.openFolder();
  await app.openFile('dark.md');

  const surface = app.editingSurface();

  await app.placeCursorAfter('Checked nightowl task');
  await page.keyboard.type(' Undo me');
  await expect(surface).toContainText('Undo me');
  expect(await color(surface)).not.toBe(DARK_SURFACE_TEXT[app.editorMode]);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => color(surface)).toBe(DARK_SURFACE_TEXT[app.editorMode]);
  await expect(surface).toContainText('Undo me');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(surface).not.toContainText('Undo me');
});

test('the editors and the preview keep their light colours on a light OS (#230) @appearance @editing @rich-text', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await app.openFolder();
  await app.openFile('dark.md');

  const rendered = app.rendered();

  await expect(rendered.locator('.katex-error')).toHaveCount(1);
  await expect(rendered.locator('.mermaid-error')).toBeVisible({ timeout: 15_000 });
  expect(await color(rendered.locator('.katex-error'))).toBe('rgb(185, 28, 28)');
  expect(await color(rendered.locator('.mermaid-error'))).toBe('rgb(153, 27, 27)');
  expect(await background(rendered.locator('.mermaid-error'))).toBe('rgb(254, 242, 242)');

  // Rich text draws the card borderless inside its diagram block
  if (app.editorMode === 'split') expect(await borderColor(rendered.locator('.mermaid-error'))).toBe('rgb(254, 202, 202)');

  expect(await taskTick(app)).toContain("stroke='white'");

  if (app.editorMode === 'split') {
    expect(await color(page.locator('.cm-content'))).toBe('rgb(26, 26, 26)');
    await find(page, 'nightowl');
    expect(await background(page.locator('.cm-searchMatch:not(.cm-searchMatch-selected)').first())).toBe('rgb(254, 243, 199)');
  } else {
    await app.openFile('fixture.md');

    const header = app.rendered().locator('th').first();

    expect(await header.evaluate((cell) => getComputedStyle(cell).borderBottomColor)).toBe('rgb(217, 220, 225)');
  }
});

test('a missing image is a box on the dark theme colours in dark mode (#236) @appearance @images @rich-text', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('missing-image.md');

  const box = app.rendered().getByRole('img', { name: 'Image not found: Gone lantern', exact: true });

  await expect(box).toBeVisible();
  expect(await color(box)).toBe('rgb(156, 163, 175)');
  expect(await borderColor(box)).toBe('rgb(51, 55, 61)');
  expect(await box.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('dashed');
  expect(await paintedBehind(box)).toBe(DARK_CANVAS);
});

test('a missing image keeps the light theme colours on a light OS (#236) @appearance @images @rich-text', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await app.openFolder();
  await app.openFile('missing-image.md');

  const box = app.rendered().getByRole('img', { name: 'Image not found: Gone lantern', exact: true });

  await expect(box).toBeVisible();
  expect(await color(box)).toBe('rgb(98, 105, 119)');
  expect(await borderColor(box)).toBe('rgb(233, 236, 239)');
});

test('a Web page exported in dark mode keeps light callouts and formula errors (#230) @appearance @export', async ({ app, context }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('dark.md');
  await expect(app.rendered().locator('.katex-error')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const viewer = await context.newPage();

  await viewer.emulateMedia({ colorScheme: 'dark' });
  await viewer.setContent(file.bytes.toString('utf8'));
  expect(await color(viewer.locator('.katex-error'))).toBe('rgb(185, 28, 28)');
  expect(await viewer.locator('blockquote.callout').evaluate((quote) => getComputedStyle(quote).borderLeftColor)).toBe('rgb(9, 105, 218)');
  await viewer.close();
});

/** The drawn diagrams (an error card has no role="img"), in the preview or rich text */
function diagrams(app: MarkloomApp): Locator {
  return app.rendered().locator('[role="img"] > svg');
}

const NIGHT_DIAGRAMS = 8;

async function diagramIds(app: MarkloomApp): Promise<string[]> {
  return diagrams(app).evaluateAll((svgs) => svgs.map((svg) => svg.id));
}

async function diagramStyles(app: MarkloomApp): Promise<string[]> {
  return diagrams(app).evaluateAll((svgs) => svgs.map((svg) => svg.querySelector('style')?.textContent ?? ''));
}

/** [diagram's first label, label, ratio] for every diagram label under 4.5:1 against what it sits on */
type ContrastFailure = [string, string, number];

/**
 * Measures every leaf label of each diagram (a <tspan>, a <text> without one, the innermost <span>
 * of an HTML label) against the first painted shape under its centre, both composited over the
 * panel the diagram sits on. Sequence actor <text> elements are filled with the actor colour and
 * only their <tspan>s carry text colour, hence leaves only.
 */
async function contrastFailures(app: MarkloomApp): Promise<ContrastFailure[]> {
  return diagrams(app).evaluateAll((svgs) => {
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    /** Any CSS colour as [r, g, b, alpha 0-1] */
    const rgba = (css: string): [number, number, number, number] => {
      if (!context || css === 'none' || css.startsWith('url(')) return [0, 0, 0, 0];

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);

      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

      return [r, g, b, a / 255];
    };

    const over = (top: [number, number, number, number], base: [number, number, number]): [number, number, number] => {
      const [r, g, b, a] = top;

      return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    };

    const luminance = ([r, g, b]: [number, number, number]): number => {
      const channel = (value: number) => {
        const c = value / 255;

        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };

      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

      return (light + 0.05) / (dark + 0.05);
    };

    /** The opacity of `element` and its ancestors up to the diagram */
    const opacityOf = (element: Element, svg: Element): number => {
      let value = 1;

      for (let node: Element | null = element; node && node !== svg.parentElement; node = node.parentElement) {
        value *= Number(getComputedStyle(node).opacity);
      }

      return value;
    };

    const withAlpha = (colour: [number, number, number, number], alpha: number): [number, number, number, number] => [
      colour[0],
      colour[1],
      colour[2],
      colour[3] * alpha,
    ];

    const SVG_TEXT = new Set(['text', 'tspan', 'g', 'foreignObject', 'svg', 'marker', 'defs', 'style']);

    const failures: [string, string, number][] = [];

    for (const svg of svgs) {
      let panelElement: Element | null = svg.parentElement;

      while (panelElement && rgba(getComputedStyle(panelElement).backgroundColor)[3] === 0) panelElement = panelElement.parentElement;

      const panelColour = rgba(panelElement ? getComputedStyle(panelElement).backgroundColor : 'white');
      const panel: [number, number, number] = [panelColour[0], panelColour[1], panelColour[2]];
      const labels = Array.from(svg.querySelectorAll('text:not(:has(tspan)), tspan:not(:has(tspan)), foreignObject span:not(:has(span))'));
      const name = (labels.find((label) => label.textContent?.trim())?.textContent ?? '').trim();

      for (const label of labels) {
        const text = label.textContent?.trim() ?? '';

        if (!text) continue;

        label.scrollIntoView({ block: 'center', inline: 'center' });

        const box = label.getBoundingClientRect();

        if (box.width === 0 || box.height === 0) continue;

        const style = getComputedStyle(label);
        const isSvg = label instanceof SVGElement;
        const foreground = over(withAlpha(rgba(isSvg ? style.fill : style.color), opacityOf(label, svg)), panel);
        let background = panel;

        for (const hit of document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)) {
          if (!svg.contains(hit)) break;

          const hitStyle = getComputedStyle(hit);

          if (hit instanceof SVGElement) {
            if (SVG_TEXT.has(hit.tagName)) continue;

            const fill = rgba(hitStyle.fill);

            if (fill[3] === 0) continue;

            background = over(withAlpha(fill, opacityOf(hit, svg) * Number(hitStyle.fillOpacity)), panel);
            break;
          }

          const fill = rgba(hitStyle.backgroundColor);

          if (fill[3] === 0) continue;

          background = over(withAlpha(fill, opacityOf(hit, svg)), panel);
          break;
        }

        const value = ratio(foreground, background);

        if (value < 4.5) failures.push([name, text, Math.round(value * 100) / 100]);
      }
    }

    return failures;
  });
}

test('diagrams are drawn in the dark palette in dark mode (#231) @appearance @diagrams @rich-text', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('night-diagrams.md');
  await expect(diagrams(app)).toHaveCount(NIGHT_DIAGRAMS, { timeout: 30_000 });

  for (const style of await diagramStyles(app)) {
    expect(hasColour(style, DARK_DIAGRAM_TEXT)).toBe(true);
    expect(hasColour(style, LIGHT_DIAGRAM_TEXT)).toBe(false);
  }

  expect(await contrastFailures(app)).toEqual([]);
});

test('diagrams redraw when the appearance changes and come from the cache when it changes back (#231) @appearance @diagrams @rich-text', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await startWith(page, 'system');
  await app.openFolder();
  await app.openFile('night-diagrams.md');
  await expect(diagrams(app)).toHaveCount(NIGHT_DIAGRAMS, { timeout: 30_000 });

  for (const style of await diagramStyles(app)) expect(hasColour(style, LIGHT_DIAGRAM_TEXT)).toBe(true);

  // Each render gets a new Mermaid-N id, so a cached result keeps its id and a fresh one doesn't
  const light = await diagramIds(app);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(async () => {
      const ids = await diagramIds(app);

      return ids.length === NIGHT_DIAGRAMS && ids.every((id, index) => id !== light[index]);
    }, { timeout: 30_000 })
    .toBe(true);

  for (const style of await diagramStyles(app)) expect(hasColour(style, DARK_DIAGRAM_TEXT)).toBe(true);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => diagramIds(app)).toEqual(light);
});

test('the .mmd editor redraws its diagram when the appearance changes (#231) @appearance @diagrams', async ({ app }) => {
  test.skip(app.editorMode !== 'split', 'A .mmd file opens in its own diagram editor, whatever the mode');

  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await startWith(page, 'system');
  await app.openFolder();
  await app.treeItem('flow.mmd').click();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('flowchart TD\n  A --> B');

  const diagram = page.locator('.mermaid-diagram > svg');
  const style = () => diagram.evaluate((svg) => svg.querySelector('style')?.textContent ?? '');

  await expect(diagram).toBeVisible({ timeout: 15_000 });
  expect(hasColour(await style(), LIGHT_DIAGRAM_TEXT)).toBe(true);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(async () => hasColour(await style(), DARK_DIAGRAM_TEXT)).toBe(true);
});

const DARK_LABEL = 'rgb(26, 26, 26)';

/** painted-diagrams.md: each label's colour on its author fill, in both themes and in exports (#235) */
const PAINTED_LABELS = {
  'Pale sky': DARK_LABEL,
  'Class mist': DARK_LABEL,
  'Pale harbour': DARK_LABEL,
  'Deep sea': WHITE,
  'Round stone': WHITE,
  'Dark dock': WHITE,
  'Own ink': 'rgb(122, 0, 0)',
} satisfies Record<string, string>;

/**
 * The computed colour of each label in the SVGs under `scope`, read from the deepest element holding
 * its text: `fill` for an SVG <text>/<tspan>, `color` for an HTML label.
 */
async function labelColours(scope: Locator, labels: string[]): Promise<Record<string, string>> {
  return scope.evaluateAll((svgs, texts) => {
    const colours: Record<string, string> = {};

    for (const text of texts) {
      const holders = svgs.flatMap((svg) => Array.from(svg.querySelectorAll('*')).filter((element) => element.textContent?.trim() === text));
      const deepest = holders.at(-1);

      if (!deepest) continue;

      const style = getComputedStyle(deepest);
      const isSvgText = deepest.localName === 'text' || deepest.localName === 'tspan';

      colours[text] = isSvgText ? style.fill : style.color;
    }

    return colours;
  }, labels);
}

for (const appearance of ['dark', 'light'] as const) {
  test(`author-filled diagram shapes get readable labels in ${appearance} (#235) @appearance @diagrams @rich-text`, async ({ app }) => {
    await startWith(app.page, appearance);
    await app.openFolder();
    await app.openFile('painted-diagrams.md');
    await expect(diagrams(app)).toHaveCount(1, { timeout: 30_000 });
    expect(await isDark(app.page)).toBe(appearance === 'dark');

    expect(await contrastFailures(app)).toEqual([]);
    expect(await labelColours(diagrams(app), Object.keys(PAINTED_LABELS))).toEqual(PAINTED_LABELS);
  });
}

test('the .mmd editor fixes labels on author fills (#235) @appearance @diagrams', async ({ app }) => {
  test.skip(app.editorMode !== 'split', 'A .mmd file opens in its own diagram editor, whatever the mode');

  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.treeItem('flow.mmd').click();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('flowchart TD\n  A[Pale sky] --> B[Deep sea]\n  style A fill:#a5d8ff\n  style B fill:#1e3a5f');

  const diagram = page.locator('.mermaid-diagram > svg');

  await expect(diagram).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => labelColours(diagram, ['Pale sky', 'Deep sea']), { timeout: 15_000 })
    .toEqual({ 'Pale sky': DARK_LABEL, 'Deep sea': WHITE });
});

test('exports fix labels on author fills (#235) @appearance @export @diagrams', async ({ app, context }) => {
  const { page } = app;

  await startWith(page, 'dark');
  await app.openFolder();
  await app.openFile('painted-diagrams.md');
  await expect(diagrams(app)).toHaveCount(1, { timeout: 30_000 });

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const web = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const viewer = await context.newPage();

  await viewer.setContent(web.bytes.toString('utf8'));
  expect(await labelColours(viewer.locator('svg'), Object.keys(PAINTED_LABELS))).toEqual(PAINTED_LABELS);
  await viewer.close();

  await page.keyboard.press('ControlOrMeta+e');
  await dialog.getByRole('radio', { name: 'Word' }).click();

  const word = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Word' }).click());
  const zip = await JSZip.loadAsync(word.bytes);

  const svgs = await Promise.all(
    Object.keys(zip.files).flatMap((name) => (/^word\/media\/.*\.svg$/.test(name) ? [zip.file(name)?.async('string') ?? ''] : []))
  );

  // The palette's text colour would be #1E293B: inline fills prove the pass ran on the export SVG
  const fills = await page.evaluate((sources) => {
    const found: Record<string, string> = {};

    for (const source of sources) {
      const svg = new DOMParser().parseFromString(source, 'image/svg+xml');

      for (const text of Array.from(svg.querySelectorAll('text'))) {
        const label = text.textContent?.trim() ?? '';

        if (label === 'Pale sky' || label === 'Deep sea') found[label] = text.style.getPropertyValue('fill');
      }
    }

    return found;
  }, svgs);

  expect(fills).toEqual({ 'Pale sky': DARK_LABEL, 'Deep sea': WHITE });
});

const DARK_PANEL = 'rgb(30, 32, 36)';

const DARK_BODY_TEXT = 'rgb(211, 214, 219)';

const DARK_ACCENT = 'rgb(110, 168, 254)';

const DARK_FIXTURES = ['callouts.md', 'footnotes.md', 'math.md', 'night-diagrams.md', 'front-matter.md'];

test('dark mode covers every fixture and still exports light @appearance @math @diagrams @rich-text @export', async ({ app, context }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'dark' });
  await startWith(page, 'dark');
  await app.openFolder();

  for (const name of DARK_FIXTURES) {
    await app.openFile(name);
    expect(await bodyBackground(page), name).toBe(DARK_CANVAS);
    expect(await background(page.locator('footer')), name).toBe(DARK_PANEL);
    expect(await color(app.rendered()), name).toBe(DARK_BODY_TEXT);
  }

  await app.openFile('dark.md');
  expect(await color(app.rendered().locator('a[href="https://example.com/nightowl"]'))).toBe(DARK_ACCENT);

  await app.openFile('callouts.md');
  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await dialog.getByRole('radio', { name: 'Web page' }).click();

  const file = await downloadOf(page, () => dialog.getByRole('button', { name: 'Export Web page' }).click());
  const viewer = await context.newPage();

  await viewer.emulateMedia({ colorScheme: 'dark' });
  await viewer.setContent(file.bytes.toString('utf8'));
  expect(await bodyBackground(viewer)).toBe(WHITE);
  await viewer.close();
});

function themeSelect(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' }).getByRole('combobox', { name: 'Theme' });
}

/** Opens Settings on its Appearance section */
async function openAppearance(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');

  const dialog = page.getByRole('dialog', { name: 'Settings' });

  await dialog.getByRole('tab', { name: 'Appearance' }).click();
  await expect(themeSelect(page)).toBeVisible();

  return themeSelect(page);
}

test('Settings > Appearance switches the theme at once and keeps it @appearance @settings', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();

  const select = await openAppearance(page);

  await expect(select).toHaveValue('system');
  await select.selectOption({ label: 'Dark' });
  await expect.poll(() => isDark(page)).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

  await page.reload();
  expect(await isDark(page)).toBe(true);
  await expect(await openAppearance(page)).toHaveValue('dark');

  // Light no longer follows the OS
  await themeSelect(page).selectOption({ label: 'Light' });
  await expect.poll(() => isDark(page)).toBe(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => colorScheme(page)).toBe('light');
  expect(await isDark(page)).toBe(false);
});

async function storedAppearance(page: Page): Promise<string | undefined> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('markloom-settings') ?? '{}').state?.appearance);
}

/** Runs the palette's theme command, checking that its label names `next` first */
async function runThemeCommand(page: Page, next: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+p');
  await page.getByRole('combobox', { name: 'Command' }).fill('Theme:');

  const option = page.getByRole('listbox', { name: 'Commands' }).getByRole('option');

  await expect(option).toHaveCount(1);
  await expect(option).toContainText(`Theme: ${next}`);
  await page.keyboard.press('Enter');
}

test('the palette cycles the theme and names the next one @appearance @palette', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();

  await runThemeCommand(page, 'Light');
  await expect.poll(() => storedAppearance(page)).toBe('light');
  expect(await isDark(page)).toBe(false);

  await runThemeCommand(page, 'Dark');
  await expect.poll(() => storedAppearance(page)).toBe('dark');
  await expect.poll(() => isDark(page)).toBe(true);

  await runThemeCommand(page, 'System');
  await expect.poll(() => storedAppearance(page)).toBe('system');
  await expect.poll(() => isDark(page)).toBe(false);
});

async function logoFilter(page: Page): Promise<string> {
  return page
    .getByRole('toolbar', { name: 'Document actions' })
    .locator('img[src*="markloom-mark"]')
    .evaluate((img) => getComputedStyle(img).filter);
}

test('the logo is white in dark mode @appearance @documents', async ({ app }) => {
  const { page } = app;

  await startWith(page, 'dark');
  expect(await logoFilter(page)).toBe('brightness(0) invert(1)');

  // Init scripts run in the order added, so this stored value replaces 'dark'
  await startWith(page, 'light');
  expect(await logoFilter(page)).toBe('none');
});
