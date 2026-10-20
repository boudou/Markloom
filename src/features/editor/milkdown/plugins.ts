// Milkdown extensions that make the rich-text editor behave like the preview:
// Mermaid blocks render as diagrams, relative images load from the open folder,
// and task-list checkboxes can be ticked.
import { $prose, $view } from '@milkdown/kit/utils';
import { codeBlockSchema, htmlSchema, imageSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet, type EditorProps, type EditorView, type NodeView } from '@milkdown/kit/prose/view';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { describeDiagramError, diagramErrorElement } from '@/features/mermaid/utils/errors';
import { canResolveRelative, readFileBlob } from '@/features/file-tree/api/fileSystem';
import { resolveSourcePath } from '../hooks/useDocumentLinks';
import { useTabsStore } from '@/features/tabs';
import { getMarkdownParser, isMermaidFence, leadingBlankLines, mermaidFences } from '@/lib/markdown';

const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const imageUrlCache = new Map<string, string>();

function activeDocumentPath(): string | null {
  const { tabs, activeTabId } = useTabsStore.getState();
  return tabs.find((t) => t.id === activeTabId)?.path ?? null;
}

/** Turns a markdown image src into something the browser can display */
async function resolveImageSrc(src: string): Promise<string> {
  const docPath = activeDocumentPath();
  if (!src || ABSOLUTE_URL.test(src) || !canResolveRelative(docPath)) return src;
  const path = resolveSourcePath(docPath, src);
  const cached = imageUrlCache.get(path);
  if (cached) return cached;
  const url = URL.createObjectURL(await readFileBlob(path));
  imageUrlCache.set(path, url);
  return url;
}

// ---------------------------------------------------------------------------
// Diagram error marks: the offending line inside a Mermaid block's source.

const errorMarkKey = new PluginKey<Map<number, number>>('markloom-diagram-errors');

export const diagramErrorMarks = $prose(
  () =>
    new Plugin<Map<number, number>>({
      key: errorMarkKey,
      state: {
        init: () => new Map(),
        apply(tr, marks) {
          const meta = tr.getMeta(errorMarkKey) as { pos: number; line: number | null } | undefined;
          let next = marks;
          if (tr.docChanged) {
            next = new Map();
            for (const [pos, line] of marks) next.set(tr.mapping.map(pos), line);
          }
          if (meta) {
            next = new Map(next);
            if (meta.line) next.set(meta.pos, meta.line);
            else next.delete(meta.pos);
          }
          return next;
        },
      },
      props: {
        decorations(state) {
          const marks = errorMarkKey.getState(state);
          if (!marks?.size) return null;
          const decorations: Decoration[] = [];
          for (const [pos, line] of marks) {
            const node = state.doc.nodeAt(pos);
            if (!node || node.type.name !== 'code_block') continue;
            const range = lineRange(node.textContent, line);
            if (range && range.to > range.from) {
              decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: 'rt-diagram-error-line' }));
            }
          }
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })
);

/** Character range of a 1-based line within text */
function lineRange(text: string, line: number): { from: number; to: number; textStart: number } | null {
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return null;
  const from = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
  const indent = lines[line - 1].match(/^\s*/)?.[0].length ?? 0;
  return { from, to: from + lines[line - 1].length, textStart: from + indent };
}

/** Document line where the nth Mermaid block's first diagram line sits in the Markdown source */
function documentLineOfDiagram(index: number): number | undefined {
  const { tabs, activeTabId } = useTabsStore.getState();
  const markdown = tabs.find((t) => t.id === activeTabId)?.content ?? '';
  return mermaidFences(getMarkdownParser().parse(markdown, {}))[index]?.firstLine;
}

// ---------------------------------------------------------------------------
// Code blocks: plain code keeps a language label; Mermaid shows the diagram with
// its source one click away.

class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private preview: HTMLElement | null = null;
  private toggle: HTMLButtonElement | null = null;
  private renderTimer: number | undefined;
  private lastRendered = '';

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    const isMermaid = isMermaidFence(node.attrs.language);
    this.dom = document.createElement('div');
    this.dom.className = isMermaid ? 'rt-mermaid' : 'rt-code';

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    // Identifiers aren't misspellings
    code.spellcheck = false;
    pre.appendChild(code);
    this.contentDOM = code;

    if (isMermaid) {
      // Header row: the toggle lives here so it can never cover the diagram or an error
      const header = document.createElement('div');
      header.className = 'rt-mermaid-header';
      header.contentEditable = 'false';
      const label = document.createElement('span');
      label.textContent = 'Diagram';
      this.toggle = document.createElement('button');
      this.toggle.type = 'button';
      this.toggle.className = 'rt-mermaid-toggle';
      this.toggle.addEventListener('mousedown', (e) => e.preventDefault());
      this.toggle.addEventListener('click', () => this.setSourceVisible(!this.dom.classList.contains('is-editing')));
      header.append(label, this.toggle);

      this.preview = document.createElement('div');
      this.preview.className = 'rt-mermaid-preview';
      this.preview.contentEditable = 'false';
      this.preview.setAttribute('role', 'img');

      this.dom.append(header, this.preview, pre);
      this.setSourceVisible(node.textContent.trim() === '');
      this.scheduleRender(0);
    } else {
      const label = document.createElement('span');
      label.className = 'rt-code-label';
      label.contentEditable = 'false';
      label.textContent = node.attrs.language || '';
      this.dom.append(label, pre);
    }
  }

  private setSourceVisible(visible: boolean) {
    this.dom.classList.toggle('is-editing', visible);
    if (this.toggle) this.toggle.textContent = visible ? 'Hide source' : 'Edit source';
  }

  private scheduleRender(delay = 400) {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => void this.render(), delay);
  }

  /** Index of this block among the document's Mermaid blocks */
  private diagramIndex(): number {
    const own = this.getPos();
    let index = -1;
    let found = -1;
    this.view.state.doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (node.type.name === 'code_block' && isMermaidFence(node.attrs.language)) {
        index++;
        if (pos === own) found = index;
      }
      return true;
    });
    return found;
  }

  private markLine(line: number | null) {
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setMeta(errorMarkKey, { pos, line }));
  }

  /** Opens the source, puts the caret at the start of the line's text, and scrolls to it */
  private showLine(lineInSource: number) {
    this.setSourceVisible(true);
    const pos = this.getPos();
    const range = lineRange(this.node.textContent, lineInSource);
    if (pos === undefined || !range) return;
    const caret = pos + 1 + range.textStart;
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, caret)).scrollIntoView());
    this.view.focus();
  }

  private async render() {
    const source = this.node.textContent.trim();
    if (!this.preview || source === this.lastRendered) return;
    this.lastRendered = source;
    this.preview.setAttribute('aria-label', `Diagram: ${source.split('\n')[0]}`);
    if (!source) {
      this.preview.innerHTML = '<p class="rt-mermaid-empty">Empty diagram</p>';
      this.markLine(null);
      return;
    }
    const result = await renderMermaid(source, 'preview');
    if (source !== this.lastRendered) return;

    if (result.ok) {
      this.preview.innerHTML = result.svg;
      this.markLine(null);

      return;
    }

    // Same numbering as the Markdown view: lines of the document, not of the diagram
    const firstLine = documentLineOfDiagram(this.diagramIndex());
    const described = describeDiagramError(result.error, source, firstLine);
    const lineInDiagram = described.line && firstLine ? described.line - firstLine + 1 : described.line;
    // Leading blank lines were trimmed before rendering; count them back for the source
    const leading = leadingBlankLines(this.node.textContent);
    const lineInSource = lineInDiagram ? lineInDiagram + leading : null;
    this.preview.replaceChildren(
      diagramErrorElement(described, lineInSource ? () => this.showLine(lineInSource) : undefined)
    );
    this.markLine(lineInSource);
  }

  update(node: ProseNode) {
    // A language change between mermaid and anything else needs a different view
    if (node.type !== this.node.type) return false;
    if (isMermaidFence(node.attrs.language) !== isMermaidFence(this.node.attrs.language)) return false;
    this.node = node;
    if (this.preview) this.scheduleRender();
    else {
      const label = this.dom.querySelector('.rt-code-label');
      if (label) label.textContent = node.attrs.language || '';
    }
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
    // Only the code itself belongs to ProseMirror; the preview and controls are ours
    return !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event) {
    // Our own controls (toggle, Show line, Details) handle their events themselves
    const target = event.target as Node;
    return this.dom.contains(target) && !this.contentDOM.contains(target);
  }

  destroy() {
    window.clearTimeout(this.renderTimer);
  }
}

export const codeBlockView = $view(codeBlockSchema.node, () => (node, view, getPos) => new CodeBlockView(node, view, getPos));

// ---------------------------------------------------------------------------
// Images: Milkdown passes `title: null` for images without a title (the common case),
// which current ProseMirror rejects, silently dropping the image. Coerce to strings.

export const imageSchemaFix = imageSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) => {
        state.addNode(type, {
          src: (node.url as string) ?? '',
          alt: (node.alt as string) ?? '',
          title: (node.title as string) ?? '',
        });
      },
    },
  };
});

// Images: keep the markdown src untouched, display a resolved one.

// The node keeps its real src (so the Markdown is untouched); only the display changes
function missingImagePlaceholder(label: string): string {
  const text = `Image not found: ${label}`.slice(0, 80).replace(/[<>&"']/g, '');
  const width = Math.max(220, text.length * 7.4 + 32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40"><rect x="0.5" y="0.5" width="${width - 1}" height="39" rx="6" fill="#fff" stroke="#D9DCE1" stroke-dasharray="4 3"/><text x="16" y="25" font-family="Outfit, system-ui, sans-serif" font-size="13" fill="#626977">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

class ImageView implements NodeView {
  dom: HTMLImageElement;

  constructor(private node: ProseNode) {
    this.dom = document.createElement('img');
    this.apply(node);
  }

  private apply(node: ProseNode) {
    this.node = node;
    const { src, alt, title } = node.attrs;
    this.dom.alt = alt ?? '';
    if (title) this.dom.title = title;
    resolveImageSrc(src)
      .then((url) => {
        if (this.node === node) this.dom.src = url;
      })
      .catch(() => {
        if (this.node !== node) return;
        this.dom.src = missingImagePlaceholder(alt || src);
        this.dom.classList.add('is-missing');
      });
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt) this.apply(node);
    else this.node = node;
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

export const imageView = $view(imageSchema.node, () => (node) => new ImageView(node));

// ---------------------------------------------------------------------------
// Decorations that depend only on the document. ProseMirror reads a `decorations` prop on
// every state update, cursor moves included; these are built when the document changes and
// reused otherwise.

function documentDecorations(
  name: string,
  build: (doc: ProseNode) => Decoration[],
  props: EditorProps<Plugin<DecorationSet>> = {}
): Plugin<DecorationSet> {
  const key = new PluginKey<DecorationSet>(name);

  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, build(state.doc)),
      apply: (tr, set) => (tr.docChanged ? DecorationSet.create(tr.doc, build(tr.doc)) : set),
    },
    props: { ...props, decorations: (state) => key.getState(state) },
  });
}

// ---------------------------------------------------------------------------
// Task lists: clicking the checkbox area of a task item toggles it.

// The checkbox is drawn with CSS; give screen readers its state as text
function taskLabels(doc: ProseNode): Decoration[] {
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'list_item' || node.attrs.checked == null) return true;
    const label = node.attrs.checked ? 'Done, ' : 'Not done, ';
    widgets.push(
      Decoration.widget(
        pos + 2,
        () => {
          const span = document.createElement('span');
          span.className = 'sr-only';
          span.textContent = label;
          return span;
        },
        { side: -1, ignoreSelection: true, key: label }
      )
    );
    return true;
  });

  return widgets;
}

export const taskToggle = $prose(() =>
  documentDecorations('markloom-task-labels', taskLabels, {
    // Keyboard: Ctrl/Cmd+Enter ticks the task item at the cursor
    handleKeyDown(view: EditorView, event: KeyboardEvent) {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
      const { $from } = view.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name !== 'list_item') continue;
        if (node.attrs.checked == null) return false;
        view.dispatch(view.state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }));
        return true;
      }
      return false;
    },
    handleClickOn(view: EditorView, _pos, node, nodePos, event, direct) {
      if (!direct || node.type.name !== 'list_item' || node.attrs.checked == null) return false;
      // SAFETY: a click ProseMirror routes to a node landed on that node's rendered HTML element
      const target = event.target as HTMLElement;
      const box = target.getBoundingClientRect();
      // The checkbox is drawn in the item's left padding
      if (event.clientX - box.left > 24) return false;
      view.dispatch(
        view.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, checked: !node.attrs.checked })
      );
      return true;
    },
  })
);

// Inline code: no spell-check squiggles on identifiers
function inlineCodeRanges(doc: ProseNode): Decoration[] {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => m.type.name === 'inlineCode')) {
      decorations.push(Decoration.inline(pos, pos + node.nodeSize, { spellcheck: 'false' }));
    }
    return true;
  });

  return decorations;
}

export const inlineCodeSpellcheck = $prose(() => documentDecorations('markloom-inline-code-spellcheck', inlineCodeRanges));

// ---------------------------------------------------------------------------
// Raw HTML (inline): comments are metadata for tools and people reading the source, so
// they shrink to a marker that shows the comment on hover; other tags read as code.
// Either way the node is untouched, so the Markdown keeps it exactly.

const COMMENT_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v6.5H7l-3 2.5V10H3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export const htmlView = $view(htmlSchema.node, () => (node) => {
  const value = String(node.attrs.value ?? '');
  const comment = value.match(/^<!--([\s\S]*?)-->$/);
  const dom = document.createElement('span');
  dom.contentEditable = 'false';
  if (comment) {
    const text = comment[1].trim();
    dom.className = 'rt-html-comment';
    dom.title = text;
    dom.setAttribute('role', 'note');
    dom.setAttribute('aria-label', `Comment: ${text}`);
    dom.innerHTML = COMMENT_ICON;
  } else {
    dom.className = 'rt-html-inline';
    dom.textContent = value;
  }
  return { dom, ignoreMutation: () => true };
});
