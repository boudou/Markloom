// Milkdown extensions that make the rich-text editor behave like the preview:
// Mermaid blocks render as diagrams, relative images load from the open folder
// (through the preview's image cache), and task-list checkboxes can be ticked.
import { $prose, $view } from '@milkdown/kit/utils';
import { codeBlockAttr, codeBlockSchema, headingSchema, htmlSchema, imageSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode, NodeType } from '@milkdown/kit/prose/model';
import type { Transform } from '@milkdown/kit/prose/transform';
import { Decoration, DecorationSet, type EditorProps, type EditorView, type NodeView } from '@milkdown/kit/prose/view';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { fillDiagram } from '@/features/mermaid/utils/errors';
import { canResolveRelative } from '@/features/file-tree/api/fileSystem';
import { isAbsoluteUrl, resolveSourcePath } from '@/lib/documentPath';
import { useTabsStore, selectActiveContent, selectActiveTab } from '@/features/tabs';
import {
  fenceLanguage,
  getMarkdownParser,
  headingIdAssigner,
  isMermaidLanguage,
  leadingBlankLines,
  mermaidFences,
} from '@/lib/markdown';
import { showImage } from '../utils/previewImages';

function activeDocumentPath(): string | null {
  return selectActiveTab(useTabsStore.getState())?.path ?? null;
}

// ---------------------------------------------------------------------------
// Heading ids: replaces Milkdown's own heading-id sync, which numbers repeats "a-#2".
// Uses the preview's assigner so a #a-1 link lands on the same heading in both modes.
// Empty headings take a number too, as they do in the preview.

/** Gives every heading in `tr.doc` the id the preview gives it */
export function setHeadingIds(tr: Transform, heading: NodeType): void {
  const nextId = headingIdAssigner();

  // setNodeMarkup keeps positions, so the walk over the starting doc stays valid
  tr.doc.descendants((node, pos) => {
    if (node.type !== heading) return;
    const id = nextId(node.textContent);

    if (node.attrs.id !== id) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
  });
}

export const headingIds = $prose((ctx) => {
  const assign = (view: EditorView) => {
    if (view.composing) return;

    const tr = view.state.tr.setMeta('addToHistory', false);

    setHeadingIds(tr, headingSchema.type(ctx));

    // Without this check every update would dispatch again, forever
    if (tr.docChanged) view.dispatch(tr);
  };

  return new Plugin({
    key: new PluginKey('markloom-heading-ids'),
    view: (view) => {
      assign(view);

      return {
        update: (view, prevState) => {
          if (!view.state.doc.eq(prevState.doc)) assign(view);
        },
      };
    },
  });
});

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
          // SAFETY: this meta is only set by markLine below, with this type.
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

/**
 * Document line of a diagram's first line in the Markdown source. Blocks are paired with
 * fences by their source, the nth block with this source to the nth fence with it, so a
 * fence one parser counts and the other doesn't can't shift other diagrams' lines.
 * Undefined while the source isn't in the document yet (an edit not written back).
 */
function documentLineOfDiagram(source: string, occurrence: number): number | undefined {
  const markdown = selectActiveContent(useTabsStore.getState());
  const fences = mermaidFences(getMarkdownParser().parse(markdown, {}));

  return fences.filter((fence) => fence.code === source)[occurrence]?.firstLine;
}

// ---------------------------------------------------------------------------
// Code blocks: plain code keeps a language label; Mermaid shows the diagram with
// its source one click away.

// Parsed Markdown gives a one-word language, but pasted <pre data-language="mermaid x"> keeps
// the whole string, so the first-word rule still applies here.
function isMermaidBlock(node: ProseNode): boolean {
  return isMermaidLanguage(fenceLanguage(node.attrs.language));
}

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
    const isMermaid = isMermaidBlock(node);
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

  /** How many Mermaid blocks with the same source come before this one */
  private occurrence(source: string): number {
    const own = this.getPos() ?? -1;
    let count = 0;
    // Nodes that start before this one
    this.view.state.doc.nodesBetween(0, Math.max(own, 0), (node) => {
      if (node.type.name === 'code_block' && isMermaidBlock(node) &&node.textContent.trim() === source) {
        count++;
      }

      return true;
    });

    return count;
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

    if (!source) {
      this.preview.removeAttribute('role');
      this.preview.removeAttribute('aria-label');
      this.preview.innerHTML = '<p class="rt-mermaid-empty">Empty diagram</p>';
      this.markLine(null);

      return;
    }

    const result = await renderMermaid(source, 'preview');

    if (source !== this.lastRendered) return;

    // Same numbering as the Markdown view: lines of the document, not of the diagram
    const firstLine = result.ok ? undefined : documentLineOfDiagram(source, this.occurrence(source));

    // Back to a line of the block's source: leading blank lines were trimmed before rendering
    const toSourceLine = (line: number) =>
      (firstLine ? line - firstLine + 1 : line) + leadingBlankLines(this.node.textContent);

    const error = fillDiagram(this.preview, result, source, {
      firstLine,
      onShowLine: (line) => this.showLine(toSourceLine(line)),
    });

    this.markLine(error?.line ? toSourceLine(error.line) : null);
  }

  update(node: ProseNode) {
    // A language change between mermaid and anything else needs a different view
    if (node.type !== this.node.type) return false;

    if (isMermaidBlock(node) !== isMermaidBlock(this.node)) return false;
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
    // SAFETY: events reach a node view from its own DOM, so the target is a Node.
    const target = event.target as Node;

    return this.dom.contains(target) && !this.contentDOM.contains(target);
  }

  destroy() {
    window.clearTimeout(this.renderTimer);
  }
}

// Code blocks keep the whole info string: Milkdown's schema stores only the language, so
// ```mermaid title would come back as ```mermaid once the block is edited (or pasted).
// The rest of the line after the language is the mdast `meta`.

export const codeBlockMetaSchema = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);

  return {
    ...base,
    attrs: {
      ...base.attrs,
      meta: { default: '', validate: 'string' },
    },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({ language: dom.dataset.language ?? '', meta: dom.dataset.meta ?? '' }),
      },
    ],
    toDOM: (node) => {
      const attr = ctx.get(codeBlockAttr.key)(node);
      const { language, meta } = node.attrs;
      // ProseMirror skips null attributes, so an empty language or meta writes nothing
      const pre = { ...attr.pre, 'data-language': language || null, 'data-meta': meta || null };

      return ['pre', pre, ['code', attr.code, 0]];
    },
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) => {
        // SAFETY: a remark code node has a string value (null covered by the check below).
        const value = node.value as string | null;
        // SAFETY: a remark code node's lang is a string or null (the ?? covers null).
        const language = (node.lang as string | null) ?? '';
        // SAFETY: a remark code node's meta is a string or null (the ?? covers null).
        const meta = (node.meta as string | null) ?? '';

        state.openNode(type, { language, meta });

        if (value) state.addText(value);
        state.closeNode();
      },
    },
    toMarkdown: {
      ...base.toMarkdown,
      runner: (state, node) => {
        // An empty meta is null so a bare ```js gets no trailing space
        state.addNode('code', undefined, node.content.firstChild?.text || '', {
          lang: node.attrs.language,
          meta: node.attrs.meta || null,
        });
      },
    },
  };
});

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
        // SAFETY: a remark image node has a string url; alt and title are strings or null (the ?? covers null).
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
    this.dom.classList.remove('is-missing');
    const docPath = activeDocumentPath();

    if (!src || isAbsoluteUrl(src) || !canResolveRelative(docPath)) {
      // Takes the img out of any folder read still in flight and out of focus refreshes
      delete this.dom.dataset.imagePath;
      this.dom.src = src;

      return;
    }

    void showImage(this.dom, resolveSourcePath(docPath, src), () => {
      this.dom.src = missingImagePlaceholder(alt || src);
      this.dom.classList.add('is-missing');
      // Keeps a focus refresh from painting over the placeholder
      delete this.dom.dataset.imagePath;
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
