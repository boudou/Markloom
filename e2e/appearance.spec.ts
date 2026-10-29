// The appearance setting (#228): a stored 'dark' marks <html> dark before first paint, 'system'
// follows the OS live, the default stays light, and exports stay light whatever the app shows.
// Dialogs, menus and toasts take their edges, backdrops and status colours from the theme (#229).
// The source editors, the preview and rich text follow it too, without losing undo history (#230).
// Mermaid diagrams are drawn in a dark palette and redraw on a switch; exports keep light ones (#231).
import JSZip from 'jszip';
import type { Locator, Page } from '@playwright/test';
import { test, expect, downloadOf, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';

type Appearance = 'system' | 'light' | 'dark';

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

/** Stores `appearance` in markloom-settings and reloads, so the app starts with it */
async function startWith(page: Page, appearance: Appearance): Promise<void> {
  await page.addInitScript((value) => {
    if (window !== window.top) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: { appearance: value }, version: 1 }));
  }, appearance);
  await page.reload();
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

test('the default is light, even on a dark OS @appearance', async ({ app }) => {
  const { page } = app;

  await page.emulateMedia({ colorScheme: 'dark' });
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

test('floating surfaces keep their light colours by default (#229) @appearance @palette @export', async ({ app }) => {
  const { page } = app;

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

async function color(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

async function background(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

/** The first background painted behind `locator`: its own, or the nearest ancestor's */
async function paintedBehind(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;

      if (value !== 'rgba(0, 0, 0, 0)') return value;
    }

    return '';
  });
}

/** The checked task's tick image: the preview's checkbox, or rich text's ::before box */
async function taskTick(app: MarkloomApp): Promise<string> {
  if (app.editorMode === 'split') {
    return app.rendered().locator('.task-checkbox:checked').evaluate((box) => getComputedStyle(box).backgroundImage);
  }

  return app.rendered().locator("li[data-item-type='task'][data-checked='true']").evaluate((item) => getComputedStyle(item, '::before').backgroundImage);
}

async function borderColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).borderTopColor);
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

test('the editors and the preview keep their light colours by default (#230) @appearance @editing @rich-text', async ({ app }) => {
  const { page } = app;

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
