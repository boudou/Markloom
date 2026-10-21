import type { HLJSApi } from 'highlight.js';

// The grammars (~145 KB) aren't needed to show the window, so they load in their own chunk:
// in the background after startup, or as soon as a code block needs them
let hljs: HLJSApi | null = null;

let loading: Promise<void> | null = null;

const listeners = new Set<() => void>();

export function loadHighlighter(): Promise<void> {
  loading ??= import('./grammars').then(({ default: api }) => {
    hljs = api;
    listeners.forEach((listener) => listener());
    listeners.clear();
  });

  return loading;
}

/** Called once, when highlighting becomes available (so plain-rendered code can be redrawn); at once if it already is */
export function onHighlighterReady(listener: () => void): () => void {
  if (hljs) {
    listener();

    return () => undefined;
  }

  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function isHighlighterReady(): boolean {
  return hljs !== null;
}

/**
 * Highlight code with syntax highlighting
 */
export function highlightCode(code: string, language: string): string {
  // Not loaded yet: show plain code now; listeners re-render once the grammars arrive
  if (!hljs) {
    void loadHighlighter();

    return escapeHtml(code);
  }

  try {
    // getLanguage and highlight lowercase the name and resolve aliases themselves
    if (hljs.getLanguage(language)) {
      const result = hljs.highlight(code, { language, ignoreIllegals: true });

      return result.value;
    }
  } catch (e) {
    // The grammar failed on this code: show it plain below
    console.warn(`Failed to highlight language: ${language}`, e);
  }

  // Unknown language: show it plain rather than guessing across every grammar
  return escapeHtml(code);
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return !!hljs?.getLanguage(language);
}

/**
 * Get list of all registered languages
 */
export function getRegisteredLanguages(): string[] {
  return hljs?.listLanguages() ?? [];
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (m) => map[m]);
}

