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
 * highlight.js output for the code, or null to show it plain: the grammars aren't loaded yet
 * (this starts loading them; readiness listeners redraw once they arrive), the language is empty
 * or unknown (plain rather than guessing across every grammar), or the grammar fails on the code.
 */
function highlightedHtml(code: string, language: string): string | null {
  if (!hljs) {
    void loadHighlighter();

    return null;
  }

  // getLanguage and highlight lowercase the name and resolve aliases themselves
  if (!language || !hljs.getLanguage(language)) return null;

  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch (e) {
    console.warn(`Failed to highlight language: ${language}`, e);

    return null;
  }
}

/**
 * Highlight code with syntax highlighting
 */
export function highlightCode(code: string, language: string): string {
  return highlightedHtml(code, language) ?? escapeHtml(code);
}

/**
 * A run of code: character offsets into the text and the class of every highlight.js scope
 * span around it, outermost first
 */
export interface HighlightToken {
  from: number;
  to: number;
  scopes: string[];
}

// highlight.js output is only scope spans and escaped text, so it reads back without a DOM
const HTML_PIECE = /<span class="([^"]*)">|<\/span>|(&(?:amp|lt|gt|quot|#x27);)|[^<&]+/g;

/**
 * The scopes highlightCode gives, as runs over the plain text, for editors that decorate text
 * instead of replacing it; empty whenever highlightCode would show the code plain. A run keeps its
 * whole scope chain, so the editor can rebuild the preview's span nesting: one span per scope
 * makes the inner scope's colour win and descendant selectors match, as in the preview.
 */
export function highlightTokens(code: string, language: string): HighlightToken[] {
  const html = highlightedHtml(code, language);

  return html === null ? [] : runsFromHtml(html);
}

function runsFromHtml(html: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const scopes: string[] = [];
  let offset = 0;
  // No span opened or closed since the last text: more text continues the same run
  let continues = false;

  for (const [piece, scope, entity] of html.matchAll(HTML_PIECE)) {
    if (scope !== undefined || piece === '</span>') {
      if (scope !== undefined) scopes.push(scope);
      else scopes.pop();

      continues = false;
    } else {
      // Each escape highlight.js writes stands for one character
      const length = entity ? 1 : piece.length;
      const last = tokens[tokens.length - 1];

      // Escaped characters split a run's text; keep it one run
      if (continues && last?.to === offset) last.to += length;
      else if (scopes.length) tokens.push({ from: offset, to: offset + length, scopes: [...scopes] });

      continues = scopes.length > 0;
      offset += length;
    }
  }

  return tokens;
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

