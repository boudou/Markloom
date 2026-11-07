// Takes the README, wiki and website images from the production build, in light and dark:
//   npm run build && node scripts/screenshots.mjs          every still into docs/screenshots/
//   npm run build && node scripts/screenshots.mjs --demo   also the frames of the demo GIF (see frames-to-gif.py)
// Runs the installed Chrome, like the end-to-end tests; the documents are the tour and docs/screenshots/demo-folder/.
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const FRAMES = join(ROOT, 'test-results', 'demo-frames');
const FOLDER_NAME = 'my-notes';
const PORT = 4599;
const VIEWPORT = { width: 1440, height: 900 };

const seed = [
  ...readdirSync(join(OUT, 'demo-folder')).map((name) => ({ name, text: readFileSync(join(OUT, 'demo-folder', name), 'utf8') })),
  { name: 'welcome.md', text: readFileSync(join(ROOT, 'src/features/templates/utils/templates/tour.md'), 'utf8').replace(/\r\n?/g, '\n') },
];

const browser = await chromium.launch({ channel: 'chrome' });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });

/** A fresh page in `theme` and `mode`, with the demo folder open */
async function openApp(theme, mode, scale = 1.5) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale, colorScheme: theme, serviceWorkers: 'block' });
  const page = await context.newPage();

  await page.addInitScript(([editorMode, folderName]) => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true }),
    });
    localStorage.setItem('markloom-layout', JSON.stringify({ state: { editorMode }, version: 0 }));
  }, [mode, FOLDER_NAME]);

  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(async ([folderName, files]) => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true });

    for (const file of files) {
      const writable = await (await folder.getFileHandle(file.name, { create: true })).createWritable();

      await writable.write(file.text);
      await writable.close();
    }
  }, [FOLDER_NAME, seed]);

  await page.keyboard.press('Control+Shift+O');
  await page.getByRole('heading', { name: FOLDER_NAME, exact: true }).waitFor();

  return { context, page };
}

async function openDocument(page, name) {
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name, exact: true }).click();
  await page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name, exact: true }).waitFor();
}

/** Diagrams and code colours arrive lazily: wait until a diagram is drawn and the page has settled */
async function settle(page) {
  await page.locator('[data-doc-surface] svg[id], article svg[id]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function shoot(page, name, theme) {
  await page.screenshot({ path: join(OUT, `${name}${theme === 'dark' ? '-dark' : ''}.png`) });
}

async function takeStills(theme) {
  const split = await openApp(theme, 'split');

  await openDocument(split.page, 'welcome.md');
  await settle(split.page);
  await shoot(split.page, 'split-view', theme);

  await split.page.keyboard.press('Control+Shift+P');
  await split.page.getByRole('dialog').getByRole('combobox').fill('export');
  await split.page.waitForTimeout(500);
  await shoot(split.page, 'command-palette', theme);
  await split.page.keyboard.press('Escape');
  await split.page.getByRole('dialog').waitFor({ state: 'hidden' });

  await split.page.keyboard.press('Control+e');
  await split.page.getByRole('dialog').waitFor();
  await split.page.waitForTimeout(3000);
  await shoot(split.page, 'export', theme);
  await split.page.keyboard.press('Escape');
  await split.page.getByRole('dialog').waitFor({ state: 'hidden' });

  await split.page.keyboard.press('Control+Shift+F');
  await split.page.getByRole('complementary', { name: 'Sidebar' }).getByRole('textbox').first().fill('diagram');
  await split.page.waitForTimeout(1200);
  await shoot(split.page, 'folder-search', theme);
  await split.context.close();

  const rich = await openApp(theme, 'wysiwyg');

  await openDocument(rich.page, 'release-plan.md');
  await settle(rich.page);
  await shoot(rich.page, 'rich-text', theme);
  await rich.context.close();
}

/** Types a diagram into a new document, then opens Export. A frame's name says how many beats to hold it (frames-to-gif.py). */
async function takeDemoFrames(theme) {
  const dir = join(FRAMES, theme);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const { context, page } = await openApp(theme, 'split', 1);
  let frame = 0;

  const grab = async (holds = 1) => {
    await page.screenshot({ path: join(dir, `${String(frame).padStart(4, '0')}-${holds}.png`) });
    frame += 1;
  };

  const typeOut = async (text, chunk) => {
    for (let at = 0; at < text.length; at += chunk) {
      await page.keyboard.insertText(text.slice(at, at + chunk));
      await grab();
    }
  };

  await page.locator('.cm-content').click();
  await typeOut('# Release plan\n\nFrom draft to a file anyone can open.\n\n', 8);
  await grab(8);
  await typeOut('```mermaid\nflowchart LR\n  A[Write] --> B{Review?}\n  B -- yes --> C[Send to Word]\n  B -- no --> A\n```\n', 7);
  await page.locator('article svg[id]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await grab(30);
  await page.keyboard.press('Control+e');
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(2500);
  await grab(40);
  await context.close();
}

try {
  for (const theme of ['light', 'dark']) {
    await takeStills(theme);

    if (process.argv.includes('--demo')) await takeDemoFrames(theme);

    console.log(`${theme}: done`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
