/*
 * Applies the stored appearance before first paint, so a dark start doesn't flash white.
 * A file rather than an inline script: the desktop Content-Security-Policy is script-src 'self'.
 * Keep in step with src/lib/appearance.ts (what is set) and src/stores/settingsStore.ts
 * (the 'light' default and selectAppearance: only 'dark' and 'system' count).
 */
(function () {
  var appearance = 'light';

  try {
    var saved = JSON.parse(localStorage.getItem('markloom-settings') || 'null');
    var stored = saved && saved.state && saved.state.appearance;

    if (stored === 'dark' || stored === 'system') appearance = stored;
  } catch (error) {
    // Blocked storage or a broken save: stay light
  }

  var isDark =
    appearance === 'dark' ||
    (appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;

  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  var meta = document.querySelector('meta[name="theme-color"]');

  if (meta) meta.setAttribute('content', isDark ? '#1E2024' : '#F8F9FA');
})();
