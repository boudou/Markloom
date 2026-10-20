import MarkdownIt from 'markdown-it';
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

// Create and configure markdown-it instance
export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: (code, lang) => {
      // Skip mermaid - handled separately
      if (lang === 'mermaid') return code;
      return highlightCode(code, lang || '');
    },
  });

  // Custom renderer for mermaid code blocks
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';

    if (info === 'mermaid') {
      const code = token.content.trim();
      // Document line of the diagram's first line, so errors can point into the source
      // (map[0] is the 0-based fence line; the diagram starts on the line after it, after any blank lines)
      const blankLines = (token.content.match(/^(?:[ \t]*\n)*/)?.[0].match(/\n/g) ?? []).length;
      const firstLine = token.map ? token.map[0] + 2 + blankLines : '';
      return `<div class="mermaid-container" data-line="${firstLine}" data-fence-line="${token.map ? token.map[0] + 1 : ''}" data-mermaid="${encodeURIComponent(code)}"></div>`;
    }

    // Use highlight.js for syntax highlighting
    const code = token.content;
    // Only the first word of the info string is the language ("js title=x" -> "js")
    const lang = info.split(/\s+/)[0] ?? '';
    const highlighted = lang ? highlightCode(code, lang) : md.utils.escapeHtml(code);
    const langClass = lang ? ` language-${md.utils.escapeHtml(lang)}` : '';

    const langLabel = lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : '';
    const sourceLine = token.map ? ` data-line="${token.map[0] + 1}"` : '';
    return `<pre${langLabel}${sourceLine}><code class="hljs${langClass}">${highlighted}</code></pre>`;
  };

  // Give headings GitHub-style ids so in-document links (#section) have a target
  md.core.ruler.push('heading_ids', (state) => {
    const used = new Map<string, number>();
    state.tokens.forEach((token, i) => {
      if (token.type !== 'heading_open' || token.attrGet('id')) return;
      const base = slugify(state.tokens[i + 1]?.content ?? '');
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      token.attrSet('id', count === 0 ? base : `${base}-${count}`);
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
    const isUnknownTag = (html: string) => {
      const name = html.match(/^<\/?([A-Za-z][\w-]*)[\s/>]/)?.[1]?.toLowerCase();
      return !!name && !KNOWN_HTML_TAGS.has(name);
    };
    // HTML comments never display, so drop them here. Left in, a comment next to a literal
    // "<sha>" trips DOMPurify's mutation-XSS guard, which deletes the whole list item.
    const isComment = (html: string) => html.trimStart().startsWith('<!--');
    for (const token of state.tokens) {
      if (token.type === 'html_block' && isComment(token.content)) {
        token.type = 'text';
        token.content = '';
      } else if (token.type === 'html_block' && isUnknownTag(token.content.trim())) {
        token.type = 'text';
      }
      for (const child of token.children ?? []) {
        if (child.type !== 'html_inline') continue;
        if (isComment(child.content)) {
          child.type = 'text';
          child.content = '';
        } else if (isUnknownTag(child.content)) {
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
      const match = inline.content.match(CALLOUT_MARKER);
      if (!match) continue;

      const kind = match[1].toLowerCase() as CalloutKind;
      tokens[i].attrJoin('class', `callout callout-${kind}`);
      tokens[i].attrSet('data-callout', kind);

      // Drop the marker line: re-parse what follows it, or drop the paragraph if that was all
      const rest = inline.content.slice(match[0].length);
      if (rest.trim()) {
        inline.content = rest;
        inline.children = state.md.parseInline(rest, state.env)[0]?.children ?? [];
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

// GitHub-compatible heading slug: lowercase, drop punctuation, spaces to hyphens.
// Keeps Unicode letters so non-Latin headings (e.g. Greek) still get usable ids.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
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
 * Markdown to safe HTML. Raw HTML in documents is allowed for formatting, but scripts,
 * event handlers and javascript: URLs are stripped: an opened file must never be able
 * to run code with access to the user's folder.
 */
export function parseMarkdown(content: string): string {
  const html = getMarkdownParser().render(content);
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form'],
  });
}

// Extract mermaid diagrams from markdown
export function extractMermaidDiagrams(content: string): { code: string; index: number }[] {
  const diagrams: { code: string; index: number }[] = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let match;
  let index = 0;

  while ((match = regex.exec(content)) !== null) {
    diagrams.push({
      code: match[1].trim(),
      index: index++,
    });
  }

  return diagrams;
}
