/**
 * Turns the appearance setting into a light or dark page: the `dark` class and `color-scheme` on
 * <html>, and the theme-color meta (the `--panel` colour of each palette). public/appearance.js does
 * the same before first paint; keep the two in step. electron/main.cjs (`WINDOW_COLOURS`) paints the
 * desktop window with the same palette.
 */
import type { Appearance } from '@/stores/settingsStore';

const THEME_COLOR = { dark: '#1E2024', light: '#F8F9FA' } as const;

const DARK_QUERY = '(prefers-color-scheme: dark)';

let applied: Appearance | null = null;

let listening = false;

function render(appearance: Appearance): void {
  const isDark = appearance === 'dark' || (appearance === 'system' && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;

  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? THEME_COLOR.dark : THEME_COLOR.light);
}

/** Cheap to call on every settings change: does nothing when the value is the one last applied */
export function applyAppearance(appearance: Appearance): void {
  if (appearance === applied) return;

  applied = appearance;
  render(appearance);

  // The window colours are cosmetic and the page has already themed itself
  window.markloomDesktop?.updateWindowPrefs({ appearance }).catch(() => undefined);

  if (listening) return;

  // One listener for the app's lifetime; it reads the latest value, so leaving 'system' stops it following the OS
  listening = true;
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (applied === 'system') render('system');
  });
}
