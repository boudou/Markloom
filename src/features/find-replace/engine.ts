// One search engine for both editors. Matching, stepping, replacing and recounting live here;
// each editor only supplies a thin adapter (CodeMirror in codemirrorEngine.ts, ProseMirror in
// editor/milkdown/search.ts), so a single Find bar behaves the same in either mode.

export interface SearchOptions {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchResult {
  count: number;
  /** 0-based index of the current match, or -1 */
  current: number;
  /** Set when a regex query can't be compiled */
  invalid: boolean;
}

export interface SearchMatch {
  from: number;
  to: number;
  /** The regex result, kept for `$1`-style replacements */
  exec: RegExpExecArray;
}

export interface SearchEngine {
  /** Highlights every match and selects the first at or after the cursor; a replacement-only change just stores it */
  update(options: SearchOptions): void;
  next(): void;
  previous(): void;
  replace(): void;
  replaceAll(): void;
  /** Removes highlights, stops listening for edits, cancels a pending recount */
  clear(): void;
  focusEditor(): void;
  subscribe(listener: () => void): () => void;
  /** Same object until count, current or invalid changes (useSyncExternalStore requirement) */
  getResult(): SearchResult;
}

export interface SearchAdapter {
  /** Every non-empty match in document order, positions in the editor's coordinates */
  matches(regex: RegExp): SearchMatch[];
  /** All edits in one undoable transaction; positions are in the current document, sorted, non-overlapping */
  applyReplacements(edits: { from: number; to: number; text: string }[]): void;
  setHighlights(matches: SearchMatch[], current: number): void;
  /** Selects the match and scrolls it into view (does not move focus) */
  select(match: SearchMatch): void;
  selectionFrom(): number;
  /** Calls `listener` after each document change; returns the unsubscribe */
  onDocChange(listener: () => void): () => void;
  focus(): void;
}

/** Recount this long after the last edit, so typing in the editor stays cheap */
const RECOUNT_DELAY_MS = 150;

/** Builds the RegExp both editors search with; null when the pattern is invalid or empty. */
export function buildSearchRegExp(options: SearchOptions): RegExp | null {
  if (!options.query) return null;
  const escaped = options.regex ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${escaped})(?![\\p{L}\\p{N}_])` : escaped;

  try {
    // `m`: ^ and $ anchor at line breaks (code blocks in Rich text, every line in Markdown)
    return new RegExp(source, `gmu${options.caseSensitive ? '' : 'i'}`);
  } catch {
    return null;
  }
}

/** Every non-empty match of `regex` (a `g` regex) in `text`, with positions shifted by `offset` */
export function collectMatches(regex: RegExp, text: string, offset: number): SearchMatch[] {
  const found: SearchMatch[] = [];
  regex.lastIndex = 0;

  for (let exec = regex.exec(text); exec; exec = regex.exec(text)) {
    if (exec[0].length === 0) {
      // Step past the empty match by one code point (the `u` flag never splits a surrogate pair)
      regex.lastIndex += (text.codePointAt(exec.index) ?? 0) > 0xffff ? 2 : 1;
      continue;
    }

    found.push({ from: offset + exec.index, to: offset + exec.index + exec[0].length, exec });
  }

  return found;
}

/**
 * Expands `$$`, `$&` and `$n` (longest valid group number) the way CodeMirror's regexp search does,
 * and `\n`, `\t`, `\\` into newline, tab and backslash. One pass, so group text is never re-expanded.
 */
export function expandReplacement(template: string, exec: RegExpExecArray): string {
  return template.replace(/\$([$&]|\d+)|\\([nt\\])/g, (token: string, ref: string | undefined, escape: string | undefined) => {
    // The pattern sets exactly one of `ref` and `escape`
    if (ref === undefined) return escape === 'n' ? '\n' : escape === 't' ? '\t' : '\\';

    if (ref === '&') return exec[0];

    if (ref === '$') return '$';

    for (let length = ref.length; length > 0; length--) {
      const group = Number(ref.slice(0, length));

      if (group > 0 && group < exec.length) return (exec[group] ?? '') + ref.slice(length);
    }

    return token;
  });
}

/** Per-view doc-change listeners: the editor's static hook calls `notify`, an engine `listen`s while a query is active */
export interface DocChangeListeners<View extends object> {
  notify(view: View): void;
  listen(view: View, listener: () => void): () => void;
}

export function createDocChangeListeners<View extends object>(): DocChangeListeners<View> {
  const listeners = new WeakMap<View, () => void>();

  return {
    notify: (view) => listeners.get(view)?.(),
    listen(view, listener) {
      listeners.set(view, listener);

      return () => {
        // A newer engine on the same view may have taken over; leave its listener alone
        if (listeners.get(view) === listener) listeners.delete(view);
      };
    },
  };
}

/** No query: what an engine starts with and returns to on `clear` */
const NO_SEARCH: SearchOptions = { query: '', replacement: '', caseSensitive: false, wholeWord: false, regex: false };

const sameQuery = (a: SearchOptions, b: SearchOptions) =>
  a.query === b.query && a.caseSensitive === b.caseSensitive && a.wholeWord === b.wholeWord && a.regex === b.regex;

const replacementFor = (match: SearchMatch, { replacement, regex }: SearchOptions) =>
  regex ? expandReplacement(replacement, match.exec) : replacement;

export function createSearchEngine(adapter: SearchAdapter): SearchEngine {
  let options = NO_SEARCH;
  let regex: RegExp | null = null;
  let matches: SearchMatch[] = [];
  let current = -1;
  /** Whether `current` has been selected since the last recount */
  let revealed = false;
  let result: SearchResult = { count: 0, current: -1, invalid: false };
  let stopListening: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const cancelRecount = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  // Finds every match again and makes the first one at or after `from` current
  const recount = (from: number) => {
    cancelRecount();
    matches = regex ? adapter.matches(regex) : [];
    const first = matches.findIndex((match) => match.from >= from);
    current = matches.length ? Math.max(first, 0) : -1;
    revealed = false;
  };

  // Draws the highlights and tells the bar, if anything it shows changed
  const render = () => {
    adapter.setHighlights(matches, current);
    const invalid = options.query !== '' && regex === null;

    if (result.count === matches.length && result.current === current && result.invalid === invalid) return;
    result = { count: matches.length, current, invalid };

    for (const listener of listeners) listener();
  };

  // Like render, and also selects the current match
  const reveal = () => {
    render();
    const match = matches[current];

    if (match) adapter.select(match);
    revealed = true;
  };

  // Recounting never moves the selection, so typing in the editor isn't hijacked
  const recountAtCursor = () => {
    recount(adapter.selectionFrom());
    render();
  };

  // Matches are stale between an edit and its recount; anything that uses positions recounts first
  const flush = () => {
    if (timer !== undefined) recountAtCursor();
  };

  const scheduleRecount = () => {
    cancelRecount();
    timer = setTimeout(recountAtCursor, RECOUNT_DELAY_MS);
  };

  const listen = (active: boolean) => {
    if (active) stopListening ??= adapter.onDocChange(scheduleRecount);
    else {
      stopListening?.();
      stopListening = null;
    }
  };

  const step = (delta: number) => {
    flush();

    if (!matches.length) return;

    // After a recount `current` is the first match at or after the cursor, not yet shown: Next lands on it
    if (revealed || delta < 0) current = (current + delta + matches.length) % matches.length;
    reveal();
  };

  return {
    update(next) {
      const previous = options;
      options = next;

      if (sameQuery(previous, next)) return;
      regex = buildSearchRegExp(next);
      listen(regex !== null);
      recount(adapter.selectionFrom());
      reveal();
    },
    next: () => step(1),
    previous: () => step(-1),
    replace() {
      flush();
      const match = matches[current];

      if (!match) return;
      const text = replacementFor(match, options);
      adapter.applyReplacements([{ from: match.from, to: match.to, text }]);
      // Continue after the inserted text, so a replacement containing the query never repeats in place
      recount(match.from + text.length);
      reveal();
    },
    replaceAll() {
      flush();

      if (!matches.length) return;
      adapter.applyReplacements(matches.map((match) => ({ from: match.from, to: match.to, text: replacementFor(match, options) })));
      recountAtCursor();
    },
    clear() {
      listen(false);
      options = NO_SEARCH;
      regex = null;
      recount(0);
      render();
    },
    focusEditor: () => adapter.focus(),
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    getResult: () => result,
  };
}
