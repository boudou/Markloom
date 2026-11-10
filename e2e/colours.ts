// Computed-colour and theme helpers shared by the dark-mode specs (appearance, settings sync,
// status colours).
import { expect, type Locator, type Page } from '@playwright/test';

export type Appearance = 'system' | 'light' | 'dark';

/** The writing surface in dark mode */
export const DARK_CANVAS = 'rgb(23, 25, 28)';

export async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}

export async function colorScheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.style.colorScheme);
}

export async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

export function themeSelect(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Settings' }).getByRole('combobox', { name: 'Theme' });
}

/** Opens Settings on its Appearance section and returns the Theme select */
export async function openAppearance(page: Page): Promise<Locator> {
  await page.keyboard.press('ControlOrMeta+Comma');
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'Appearance' }).click();
  await expect(themeSelect(page)).toBeVisible();

  return themeSelect(page);
}

/** Stores `appearance` in markloom-settings and reloads, so the app starts with it */
export async function startWith(page: Page, appearance: Appearance): Promise<void> {
  await page.addInitScript((value) => {
    if (window !== window.top) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: { appearance: value }, version: 1 }));
  }, appearance);
  await page.reload();
}

export async function color(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

export async function background(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

export async function borderColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).borderTopColor);
}

/** The first background painted behind `locator`: its own, or the nearest ancestor's */
export async function paintedBehind(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;

      if (value !== 'rgba(0, 0, 0, 0)') return value;
    }

    return '';
  });
}

/** WCAG contrast ratio of two opaque `rgb(r, g, b)` colours */
export function contrastRatio(first: string, second: string): number {
  const luminance = (css: string): number => {
    const [r, g, b] = (css.match(/\d+/g) ?? []).map((value) => {
      const c = Number(value) / 255;

      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
}
