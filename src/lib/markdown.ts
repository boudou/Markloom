import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import DOMPurify from 'dompurify';
import { CALLOUT_MARKER, calloutTitleHtml, type CalloutKind } from './callouts';
import { highlightCode } from '@/features/syntax-highlight';

// Real HTML element names; anything else in angle brackets is treated as literal text
const KNOWN_HTML_TAGS = new Set(
  (
    'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col ' +
    'colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 ' +
    'h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta ' +
    'meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script ' +
    'section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th ' +
    'thead time title tr track u ul var video wbr center font big strike tt svg math'
  ).split(' ')
);

/**
 * True when raw HTML starts with a tag that isn't a real element, such as a <sha> or <path>
 * placeholder: the preview shows it as text, and so does rich text.
 */
export function isUnknownHtmlTag(html: string): boolean {
  const name = html.trim().match(/^<\/?([A-Za-z][\w-]*)[\s/>]/)?.[1]?.toLowerCase();

  return !!name && !KNOWN_HTML_TAGS.has(name);
}

export type Token = ReturnType<MarkdownIt['parse']>[number];

/**
 * A fence's language: the first word of its info string ("js title=x" is "js", "mermaid title"
 * is a diagram), which is also all the rich-text editor keeps. Empty when there is no info.
 */
export function fenceLanguage(info: string): string {
  return info.trim().split(/\s+/)[0];
}

export function isMermaidLanguage(language: string): boolean {
  return language === 'mermaid';
}

/** Number of whole blank lines at the start of text (trimmed away before a diagram renders) */
export function leadingBlankLines(text: string): number {
  return (text.match(/^(?:[ \t]*\n)*/)?.[0].match(/\n/g) ?? []).length;
}

export interface MermaidFence {
  /** Diagram source as Mermaid receives it (trimmed) */
  code: string;
  /** 0-based source lines of the whole fence, end exclusive */
  range: [number, number];
  /** 1-based document line of the diagram's first line */
  firstLine: number;
}

/** The diagram a token holds, or null when it isn't a Mermaid fence */
export function mermaidFence(token: Token): MermaidFence | null {
  if (token.type !== 'fence' || !token.map || !isMermaidLanguage(fenceLanguage(token.info))) return null;

  // map[0] is the 0-based fence line; the diagram starts on the line after it, after any blank lines
  return {
    code: token.content.trim(),
    range: token.map,
    firstLine: token.map[0] + 2 + leadingBlankLines(token.content),
  };
}

/** The Mermaid fences of a parsed document, in source order */
export function mermaidFences(tokens: Token[]): MermaidFence[] {
  const fences = tokens.flatMap((token) => {
    const fence = mermaidFence(token);

    return fence ? [fence] : [];
  });

  // Token order isn't source order: footnote definitions are moved to the end
  return fences.sort((a, b) => a.range[0] - b.range[0]);
}

const WHITESPACE = /\s/;

const DIGIT = /\d/;

/**
 * Index of the `$` that closes inline math opened at `open`, or -1. Only the next unescaped `$`
 * can close, and not after a space or before a digit: "$5 and $10" and "$5, then $x$" keep
 * their prices as text.
 */
function inlineMathEnd(src: string, open: number, max: number): number {
  for (let end = src.indexOf('$', open + 1); end !== -1 && end < max; end = src.indexOf('$', end + 1)) {
    const before = src[end - 1];

    if (before === '\\') continue; // \$ inside the formula

    return WHITESPACE.test(before) || DIGIT.test(src[end + 1] ?? '') ? -1 : end;
  }

  return -1;
}

/**
 * Where inline math opened by the `$` at `pos` closes (the index of the closing `$`), or -1 when
 * that `$` doesn't open math: not after or before another `$`, not before a space, and never
 * across a link's "](" (link labels are scanned with these rules too). `max` ends the search.
 * Rich text uses it too, so both editors agree on what is math.
 */
export function inlineMathClose(src: string, pos: number, max: number): number {
  const next = src[pos + 1] ?? '';

  if (src[pos] !== '$' || src[pos - 1] === '$' || next === '$' || next === '' || WHITESPACE.test(next)) return -1;

  const end = inlineMathEnd(src, pos, max);

  return end === -1 || src.slice(pos + 1, end).includes('](') ? -1 : end;
}

/** The trimmed text of one source line, with the container's indentation removed */
function lineText(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trimEnd();
}

/**
 * TeX math: inline `$…$` and display `$$…$$` become `math_inline` and `math_block` tokens,
 * rendered as placeholders that carry the TeX (the `math` feature typesets them later).
 * The source stays the placeholder's text, so math shows as written until KaTeX has loaded.
 */
export function mathPlugin(md: MarkdownIt): void {
  // After `escape` (so `\$` stays literal) and before `backticks` (so `$` in code stays code)
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    const { src, pos, posMax } = state;
    const end = inlineMathClose(src, pos, posMax);

    if (end === -1) return false;

    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$';
      token.content = src.slice(pos + 1, end);
    }

    state.pos = end + 1;

    return true;
  });

  md.block.ruler.before(
    'paragraph',
    'math_block',
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;

      const first = lineText(state, startLine);

      if (!first.startsWith('$$')) return false;

      const opening = first.slice(2);
      const lines: string[] = [];
      let last = startLine;

      if (opening.length > 2 && opening.endsWith('$$')) {
        // $$x$$ on one line
        lines.push(opening.slice(0, -2));
      } else {
        if (opening.includes('$$')) return false;

        lines.push(opening);

        // An unclosed $$ is not math: the search ends at a blank line or the container's end
        for (last = startLine + 1; ; last++) {
          if (last >= endLine || state.isEmpty(last) || state.sCount[last] < state.blkIndent) return false;

          const text = lineText(state, last);

          if (text.endsWith('$$')) {
            lines.push(text.slice(0, -2));

            break;
          }

          lines.push(text);
        }
      }

      const tex = lines.join('\n').trim();

      if (!tex) return false;

      if (silent) return true;

      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.markup = '$$';
      token.content = tex;
      token.map = [startLine, last + 1];
      state.line = last + 1;

      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );

  md.renderer.rules.math_inline = (tokens, idx) => {
    const tex = tokens[idx].content;

    return `<span class="math" data-math="${encodeURIComponent(tex)}">$${md.utils.escapeHtml(tex)}$</span>`;
  };

  md.renderer.rules.math_block = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx];

    // renderAttrs carries the data-line that the source_lines rule sets, for scroll sync
    return `<div class="math math-display"${self.renderAttrs(token)} data-math="${encodeURIComponent(token.content)}">$$${md.utils.escapeHtml(token.content)}$$</div>\n`;
  };
}

const FRONT_MATTER_FENCE = /^---[ \t]*$/;

const FRONT_MATTER_KEY = /^([A-Za-z0-9_-]+)\s*:/;

// The same block as frontMatterPlugin reads, for code that looks at the text without parsing it
const LEADING_FRONT_MATTER = /^---[ \t]*\n(?:[\s\S]*?\n)?---[ \t]*(?:\n|$)/;

/** The document without its front matter, if it has one */
export function withoutFrontMatter(markdown: string): string {
  return markdown.replace(LEADING_FRONT_MATTER, '');
}

/** The top-level keys of YAML front matter, in order: what its collapsed block lists */
export function frontMatterKeys(yaml: string): string[] {
  return yaml.split('\n').flatMap((line) => line.match(FRONT_MATTER_KEY)?.[1] ?? []);
}

/** The collapsed block's key list: at most four keys, then an ellipsis */
export function frontMatterSummary(yaml: string): string {
  const keys = frontMatterKeys(yaml);

  return keys.slice(0, 4).join(', ') + (keys.length > 4 ? ', …' : '');
}

/**
 * YAML front matter: a `---` on the document's first line, closed by a later `---` line, becomes
 * one `front_matter` token, shown as a collapsed block. The rules are remark-frontmatter's, which
 * rich text uses: column 1 of line 1 only, spaces after a fence allowed, unclosed is not front
 * matter. Not highlighted, so preserve.ts's cached block keys never depend on the grammars loading.
 */
export function frontMatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'table',
    'front_matter',
    (state, startLine, endLine, silent) => {
      if (startLine !== 0 || state.parentType !== 'root' || state.sCount[0] !== 0) return false;

      const line = (n: number) => state.src.slice(state.bMarks[n], state.eMarks[n]);

      if (!FRONT_MATTER_FENCE.test(line(0))) return false;

      let close = 1;

      while (close < endLine && !FRONT_MATTER_FENCE.test(line(close))) close++;

      if (close >= endLine) return false;

      if (silent) return true;

      const token = state.push('front_matter', 'details', 0);
      token.block = true;
      token.markup = '---';
      token.content = Array.from({ length: close - 1 }, (_, i) => line(i + 1)).join('\n');
      token.map = [0, close + 1];
      state.line = close + 1;

      return true;
    },
    { alt: [] }
  );

  md.renderer.rules.front_matter = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx];
    const yaml = md.utils.escapeHtml(token.content);
    const keys = md.utils.escapeHtml(frontMatterSummary(token.content));

    // renderAttrs carries the data-line that the source_lines rule sets, for scroll sync
    return `<details class="front-matter"${self.renderAttrs(token)}><summary>Front matter<span class="front-matter-keys">${keys}</span></summary><pre><code>${yaml}</code></pre></details>\n`;
  };
}

/**
 * GitHub-style footnotes: `[^1]` references become numbered superscripts linking to a list at
 * the end, each note with a link back. Ids are fn-1 and fnref-1 (fnref-1:1 for a repeat), not
 * the plugin's fn1, so a "# fn1" heading can't take a note's id.
 */
function footnotePlugin(md: MarkdownIt): void {
  md.use(footnote);

  // The plugin builds every id as fn<name> / fnref<name> and sets meta.id (0-based) on each token
  md.renderer.rules.footnote_anchor_name = (tokens, idx) => `-${Number(tokens[idx].meta.id) + 1}`;
  md.renderer.rules.footnote_caption = (tokens, idx) => String(Number(tokens[idx].meta.id) + 1);

  const backLink = md.renderer.rules.footnote_anchor;

  if (!backLink) return;

  md.renderer.rules.footnote_anchor = (tokens, idx, options, env, slf) => {
    const caption = slf.rules.footnote_caption?.(tokens, idx, options, env, slf) ?? '';

    return backLink(tokens, idx, options, env, slf).replace('<a ', `<a aria-label="Back to reference ${caption}" `);
  };
}

// Create and configure markdown-it instance
export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  md.use(mathPlugin);
  md.use(frontMatterPlugin);

  // Before heading_ids: both run right after `inline`, and footnote_tail must gather the notes first
  md.use(footnotePlugin);

  // Custom renderer for mermaid code blocks
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const diagram = mermaidFence(token);

    if (diagram) {
      return `<div class="mermaid-container" data-line="${diagram.firstLine}" data-fence-line="${diagram.range[0] + 1}" data-mermaid="${encodeURIComponent(diagram.code)}"></div>`;
    }

    // Use highlight.js for syntax highlighting
    const code = token.content;
    const lang = fenceLanguage(token.info);
    const highlighted = lang ? highlightCode(code, lang) : md.utils.escapeHtml(code);
    const langClass = lang ? ` language-${md.utils.escapeHtml(lang)}` : '';

    const langLabel = lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : '';
    const sourceLine = token.map ? ` data-line="${token.map[0] + 1}"` : '';

    return `<pre${langLabel}${sourceLine}><code class="hljs${langClass}">${highlighted}</code></pre>`;
  };

  // Give headings GitHub-style ids so in-document links (#section) have a target. Runs right
  // after inline parsing, before the typographer turns "--" into a dash or "(c)" into ©:
  // ids come from the text as written, like GitHub's and the rich-text editor's.
  md.core.ruler.after('inline', 'heading_ids', (state) => {
    const nextId = headingIdAssigner();
    state.tokens.forEach((token, i) => {
      if (token.type !== 'heading_open' || token.attrGet('id')) return;
      token.attrSet('id', nextId(headingText(state.tokens[i + 1])));
    });
  });

  // Every rendered block remembers its source line, so the preview can scroll in step
  // with the source by line rather than by percentage (images and diagrams skew that)
  md.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if (!token.map || token.nesting === -1 || token.type === 'inline') continue;

      if (token.type === 'fence') continue; // the fence renderer adds its own
      token.attrSet('data-line', String(token.map[0] + 1));
    }
  });

  // Placeholders such as <sha>, <path> or <field> aren't HTML: show them as text instead of
  // letting the sanitizer delete them (and the words around them) as unknown tags.
  md.core.ruler.push('literal_unknown_tags', (state) => {
    // HTML comments never display, so drop them here. Left in, a comment next to a literal
    // "<sha>" trips DOMPurify's mutation-XSS guard, which deletes the whole list item.
    const isComment = (html: string) => html.trimStart().startsWith('<!--');

    for (const token of state.tokens) {
      if (token.type === 'html_block' && isComment(token.content)) {
        token.type = 'text';
        token.content = '';
      } else if (token.type === 'html_block' && isUnknownHtmlTag(token.content)) {
        token.type = 'text';
      }

      for (const child of token.children ?? []) {
        if (child.type !== 'html_inline') continue;

        if (isComment(child.content)) {
          child.type = 'text';
          child.content = '';
        } else if (isUnknownHtmlTag(child.content)) {
          child.type = 'text';
        }
      }
    }
  });

  // GitHub task lists: "- [ ] item" / "- [x] item" render as checkboxes
  md.core.ruler.push('task_lists', (state) => {
    const tokens = state.tokens;

    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];

      if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;

      if (tokens[i - 2].type !== 'list_item_open') continue;

      const match = inline.content.match(/^\[([ xX])\](\s+|$)/);
      const first = inline.children?.[0];

      if (!match || !first || first.type !== 'text') continue;

      const checked = match[1].toLowerCase() === 'x';
      first.content = first.content.slice(match[0].length);
      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" class="task-checkbox" disabled${checked ? ' checked' : ''} aria-label="${checked ? 'Done' : 'Not done'}"> `;
      inline.children!.unshift(box);
      tokens[i - 2].attrJoin('class', 'task-list-item');
    }
  });

  // GitHub callouts: "> [!NOTE]" on a quote's first line turns the quote into a titled box
  md.core.ruler.push('callouts', (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue;
      const inline = tokens[i + 2];

      // Only a marker alone on the quote's first line makes a callout, as on GitHub
      const match = inline.content.match(CALLOUT_MARKER);

      if (!match) continue;

      // SAFETY: CALLOUT_MARKER's group only matches the CalloutKind names (case-insensitively), and they are lower case.
      const kind = match[1].toLowerCase() as CalloutKind;
      tokens[i].attrJoin('class', `callout callout-${kind}`);
      tokens[i].attrSet('data-callout', kind);

      // Drop the marker line's tokens up to its line break, keeping the rest as parsed (parsing it
      // again would count its footnote references twice), or drop the paragraph if that was all.
      // The marker line may be several tokens: "[!note]" can parse as a reference link.
      const children = inline.children ?? [];
      const lineEnd = children.findIndex((child) => child.type === 'softbreak' || child.type === 'hardbreak');
      const rest = lineEnd < 0 ? [] : children.slice(lineEnd + 1);

      if (rest.length) {
        inline.children = rest;
        inline.content = inline.content.slice(match[0].length);
      } else {
        tokens.splice(i + 1, 3);
      }

      const title = new state.Token('html_block', '', 0);
      title.content = calloutTitleHtml(kind);
      title.meta = { calloutTitle: kind };
      tokens.splice(i + 1, 0, title);
    }
  });

  return md;
}

/**
 * The visible text of a heading's inline token: text and inline code, with line breaks kept.
 * Link URLs, emphasis markers, raw HTML and images add nothing, as on GitHub.
 * Works at any core stage: before text_join, escapes and entities are still text_special
 * tokens whose content is the decoded character.
 */
export function headingText(inline: Token): string {
  const parts = (inline.children ?? []).map((child) => {
    if (child.type === 'text' || child.type === 'text_special' || child.type === 'code_inline') return child.content;

    // Math as written, so slugs match rich text's (whose math nodes read as `$…$` text)
    if (child.type === 'math_inline') return `$${child.content}$`;

    return child.type === 'softbreak' || child.type === 'hardbreak' ? '\n' : '';
  });

  return parts.join('').trim();
}

// GitHub-compatible heading slug of a heading's visible text (see headingText): lowercase,
// drop punctuation, spaces to hyphens. Keeps Unicode letters so non-Latin headings
// (e.g. Greek) still get usable ids.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * Gives the headings of one document their ids, in document order: the slug of the text,
 * numbered -1, -2, … when an earlier heading already has that id (GitHub's rule).
 * The preview and the rich-text editor both use it, so #links resolve the same in both.
 */
export function headingIdAssigner(): (text: string) => string {
  const occurrences = new Map<string, number>();

  return (text) => {
    const base = slugify(text);
    let id = base;
    let count = occurrences.get(base) ?? 0;

    while (occurrences.has(id)) {
      count += 1;
      id = `${base}-${count}`;
    }

    occurrences.set(base, count);
    occurrences.set(id, 0);

    return id;
  };
}

// Singleton instance
let mdInstance: MarkdownIt | null = null;

export function getMarkdownParser(): MarkdownIt {
  if (!mdInstance) {
    mdInstance = createMarkdownParser();
  }

  return mdInstance;
}

/**
 * Applies the Smart typography setting (curly quotes, dashes, ellipses, ©) to everything rendered
 * from now on: markdown-it's replacement rules read the option on every parse.
 */
export function setSmartTypography(on: boolean): void {
  getMarkdownParser().set({ typographer: on });
}

// DOMPurify drops any id that names a document property (its SANITIZE_DOM clobbering guard),
// so "## Title" or "## Images" would lose the ids that #title links point at. Headings aren't
// exposed as named properties on document, and a lowercase slug can't shadow the app's
// camelCase globals, so heading ids that look like generated slugs are kept. Everything else
// still goes through the guard.
const HEADING_TAG = /^H[1-6]$/;

const HEADING_SLUG = /^[a-z0-9_-]+$/;

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'id' && HEADING_TAG.test(node.nodeName) && HEADING_SLUG.test(data.attrValue)) {
    data.forceKeepAttr = true;
  }
});

/**
 * HTML made safe to insert into the app. Raw HTML in documents is allowed for formatting, but
 * scripts, event handlers and javascript: URLs are stripped: an opened file must never be able
 * to run code with access to the user's folder. The preview and rich text's raw HTML share it.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form'],
  });
}

/** Markdown to safe HTML (see sanitizeHtml) */
export function parseMarkdown(content: string): string {
  return sanitizeHtml(getMarkdownParser().render(content));
}
