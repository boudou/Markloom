import type { KatexOptions, ParseError as KatexParseError } from 'katex';
import DOMPurify from 'dompurify';

// KaTeX (~260 KB plus its stylesheet) isn't needed to show the window, so it loads in its own
// chunk the first time a document has math. Until then the placeholders show the TeX source.
let renderToString: ((tex: string, options: KatexOptions) => string) | null = null;

let ParseError: typeof KatexParseError | null = null;

let loading: Promise<void> | null = null;

// Settles once, when KaTeX is in; every readiness subscriber waits on it
let markReady = () => {};

const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

export function loadMath(): Promise<void> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([katex]) => {
    renderToString = katex.default.renderToString;
    ParseError = katex.default.ParseError;
    markReady();
  });

  return loading;
}

/**
 * Subscribe to KaTeX becoming available, so math placeholders can be filled.
 * Shaped for useSyncExternalStore with isMathReady as the snapshot.
 */
export function onMathReady(listener: () => void): () => void {
  let subscribed = true;

  void ready.then(() => {
    if (subscribed) listener();
  });

  return () => {
    subscribed = false;
  };
}

export function isMathReady(): boolean {
  return renderToString !== null;
}

// Documents may be untrusted: no \href, \url, \includegraphics or \htmlClass, and limits that
// stop macro bombs and giant boxes. Errors render as the source in red, with the message as a tooltip.
const KATEX_OPTIONS: KatexOptions = {
  output: 'htmlAndMathml',
  throwOnError: false,
  // The app's error colour in each theme, with a light fallback for exported pages (no --error-text there)
  errorColor: 'var(--error-text, #B91C1C)',
  trust: false,
  strict: 'ignore',
  maxSize: 50,
  maxExpand: 1000,
};

// The preview re-fills every formula after each edit, so recent results are kept
const MAX_CACHED_FORMULAS = 500;

const rendered = new Map<string, string>();

function typeset(tex: string, displayMode: boolean, render: (tex: string, options: KatexOptions) => string): string {
  const key = `${displayMode ? 'display' : 'inline'}\n${tex}`;
  const hit = rendered.get(key);

  if (hit !== undefined) {
    // Re-insert so the map stays in least-recently-used order
    rendered.delete(key);
    rendered.set(key, hit);

    return hit;
  }

  // A math-only pass: the document sanitizer would strip MathML's semantics and annotation,
  // which keep the TeX hidden from sight and readable to screen readers
  const html = DOMPurify.sanitize(render(tex, { ...KATEX_OPTIONS, displayMode }), { ADD_TAGS: ['semantics', 'annotation'] });
  rendered.set(key, html);

  if (rendered.size > MAX_CACHED_FORMULAS) {
    const oldest = rendered.keys().next();

    if (!oldest.done) rendered.delete(oldest.value);
  }

  return html;
}

/**
 * KaTeX's message for a formula it can't parse ("Expected '}', got 'EOF'"),
 * or null when it typesets. Loads KaTeX first, so null always means checked.
 */
export async function checkMath(tex: string, displayMode: boolean): Promise<string | null> {
  await loadMath();

  const render = renderToString;
  const parseError = ParseError;

  if (!render || !parseError) throw new Error('KaTeX loaded without renderToString or ParseError');

  try {
    render(tex, { ...KATEX_OPTIONS, displayMode, throwOnError: true });

    return null;
  } catch (error) {
    if (error instanceof parseError) return error.rawMessage;

    throw error;
  }
}

/** One formula as KaTeX HTML (sanitized), loading KaTeX first. An invalid formula gives KaTeX's red error span. */
export async function typesetMath(tex: string, displayMode: boolean): Promise<string> {
  await loadMath();

  const render = renderToString;

  if (!render) throw new Error('KaTeX did not load');

  return typeset(tex, displayMode, render);
}

/** The TeX of a placeholder's `data-math`, or null when it is malformed. */
function decodedTex(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null; // raw HTML with a malformed data-math
  }
}

export interface MathSlot {
  slot: HTMLElement;
  tex: string;
  display: boolean;
}

/**
 * Takes every unfilled math placeholder under `root`: its TeX is decoded and its data-math removed.
 * A malformed data-math (raw HTML) is dropped, so the placeholder keeps its text.
 */
export function takeMathSlots(root: ParentNode): MathSlot[] {
  const slots: MathSlot[] = [];

  for (const slot of Array.from(root.querySelectorAll<HTMLElement>('[data-math]'))) {
    const tex = decodedTex(slot.getAttribute('data-math') ?? '');
    slot.removeAttribute('data-math');

    if (tex !== null) slots.push({ slot, tex, display: slot.classList.contains('math-display') });
  }

  return slots;
}

/**
 * Typesets every math placeholder under `root` (does nothing until loadMath has settled).
 * A filled placeholder is marked data-math-done, so a second fill skips it.
 */
export function fillMath(root: ParentNode): void {
  const render = renderToString;

  if (!render) return;

  for (const { slot, tex, display } of takeMathSlots(root)) {
    slot.innerHTML = typeset(tex, display, render);
    slot.setAttribute('data-math-done', '');
  }
}
