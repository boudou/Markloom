import type { HLJSApi } from 'highlight.js';

// The grammars (~145 KB) aren't needed to show the window, so they load in their own chunk:
// in the background after startup, or as soon as a code block needs them
let hljs: HLJSApi | null = null;

let loading: Promise<void> | null = null;

// Settles once, when the grammars are in; every readiness subscriber waits on it
let markReady = () => {};

const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

export function loadHighlighter(): Promise<void> {
  loading ??= import('./grammars').then(({ default: api }) => {
    hljs = api;
    markReady();
  });

  return loading;
}

/**
 * Subscribe to the highlighter becoming available, so plain-rendered code can be redrawn.
 * Shaped for useSyncExternalStore with isHighlighterReady as the snapshot.
 */
export function onHighlighterReady(listener: () => void): () => void {
  let subscribed = true;

  void ready.then(() => {
    if (subscribed) listener();
  });

  return () => {
    subscribed = false;
  };
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

