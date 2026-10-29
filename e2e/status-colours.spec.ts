// Status colours follow the theme (#238): the Export preflight card, the version-history diff and a
// reached word goal take dark token colours with AA contrast in dark mode, and keep their light values.
import { test, expect, expectNoPreviewInRichText, type MarkloomApp } from './fixtures';
import { background, borderColor, color, contrastRatio, paintedBehind, startWith } from './colours';

interface StatusColours {
  card: { border: string; fill: string; summary: string; issue: string };
  diff: { added: string; addedEdge: string; removed: string; removedEdge: string };
  goal: { text: string; bar: string };
}

const DARK_STATUS: StatusColours = {
  card: { border: 'rgb(107, 84, 24)', fill: 'rgb(42, 36, 16)', summary: 'rgb(251, 191, 36)', issue: 'rgb(253, 230, 138)' },
  diff: { added: 'rgb(74, 222, 128)', addedEdge: 'rgb(74, 222, 128)', removed: 'rgb(248, 113, 113)', removedEdge: 'rgb(248, 113, 113)' },
  goal: { text: 'rgb(74, 222, 128)', bar: 'rgb(74, 222, 128)' },
};

/** As before #238: Tailwind's green-500 and red-500 edges, the fixed hex text colours */
const LIGHT_STATUS: StatusColours = {
  card: { border: 'rgb(252, 211, 77)', fill: 'rgb(255, 251, 235)', summary: 'rgb(146, 64, 14)', issue: 'rgb(120, 53, 15)' },
  diff: { added: 'rgb(21, 128, 61)', addedEdge: 'lab(70.5521 -66.5147 45.8072)', removed: 'rgb(185, 28, 28)', removedEdge: 'lab(55.4814 75.0732 48.8528)' },
  goal: { text: 'rgb(21, 128, 61)', bar: 'rgb(21, 128, 61)' },
};

/** Reads the status colours from broken.md: its preflight, a diff against a saved version, a goal of one word */
async function statusColours(app: MarkloomApp): Promise<StatusColours & { contrasts: number[] }> {
  const { page } = app;

  await app.openFolder();
  await app.openFile('broken.md');

  await page.keyboard.press('ControlOrMeta+e');

  const dialog = page.getByRole('dialog', { name: 'Export' });
  const summary = dialog.getByText('1 diagram has an error');
  const card = summary.locator('..');
  const issue = card.getByRole('listitem').first().locator('span').first();

  await expect(summary).toBeVisible();

  const cardColours = { border: await borderColor(card), fill: await background(card), summary: await color(summary), issue: await color(issue) };

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.keyboard.press('ControlOrMeta+Shift+H');

  const panel = page.getByRole('dialog').filter({ hasText: 'Version history' });

  await panel.getByRole('button', { name: 'Save this version' }).click();
  await panel.getByRole('button', { name: 'Close version history' }).click();
  await expect(panel).toBeHidden();

  await app.placeCursorAfter('Text before the diagram.');
  await page.keyboard.type(' Edited');
  await page.keyboard.press('ControlOrMeta+Shift+H');
  await panel.locator('[aria-pressed]').first().click();

  const added = panel.locator('div.border-l-2', { hasText: 'Edited' });
  const removed = panel.locator('div.border-l-2', { hasText: /^-\s*Text before the diagram\.$/ });

  await expect(added).toBeVisible();
  await expect(removed).toBeVisible();

  const diffColours = { added: await color(added), addedEdge: await borderColor(added), removed: await color(removed), removedEdge: await borderColor(removed) };
  const diffSurface = await paintedBehind(added.locator('..'));

  await panel.getByRole('button', { name: 'Close version history' }).click();

  const statistics = page.getByRole('contentinfo').getByTitle('Document statistics');

  await statistics.click();
  await page.getByLabel('Word goal for this document').fill('1');
  await page.getByRole('button', { name: 'Set goal' }).click();
  await page.keyboard.press('Escape');

  const goal = statistics.locator('span', { hasText: '/ 1 word' }).first();

  await expect(goal).toBeVisible();

  const goalColours = { text: await color(goal), bar: await background(goal.locator('[aria-hidden] > span')) };
  const statusBar = await paintedBehind(goal);

  return {
    card: cardColours,
    diff: diffColours,
    goal: goalColours,
    contrasts: [
      contrastRatio(cardColours.summary, cardColours.fill),
      contrastRatio(cardColours.issue, cardColours.fill),
      contrastRatio(diffColours.added, diffSurface),
      contrastRatio(diffColours.removed, diffSurface),
      contrastRatio(goalColours.text, statusBar),
    ],
  };
}

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('status, warning and diff colours turn dark in dark mode (#238) @appearance @export @history @editing', async ({ app }) => {
  await startWith(app.page, 'dark');

  const { contrasts, ...colours } = await statusColours(app);

  expect(colours).toEqual(DARK_STATUS);

  for (const ratio of contrasts) expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('status, warning and diff colours keep their light values on a light OS (#238) @appearance @export @history @editing', async ({ app }) => {
  await app.page.emulateMedia({ colorScheme: 'light' });

  const { contrasts: _contrasts, ...colours } = await statusColours(app);

  expect(colours).toEqual(LIGHT_STATUS);
});
