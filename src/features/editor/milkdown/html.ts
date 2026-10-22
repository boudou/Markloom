// Raw HTML in rich text, shown the way the preview shows it. Remark gives every HTML block, and
// every inline tag, its own `html` atom whose value is the source text. The view renders that
// value through the preview's sanitizer and never changes it, unless the user edits its source
// (a click, or Enter while it is selected). Tags that render nothing on their own (an unpaired
// <div align="center"> or </div>) shrink to a muted marker; the layout they imply comes back
// as decorations: alignment for the blocks between a <div align> pair, and <kbd>, <sub>, …
// around the text between an inline pair.
import { $prose, $view } from '@milkdown/kit/utils';
import { htmlSchema } from '@milkdown/kit/preset/commonmark';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode, NodeType } from '@milkdown/kit/prose/model';
import { Decoration, type EditorView, type NodeView } from '@milkdown/kit/prose/view';
import { isUnknownHtmlTag, sanitizeHtml } from '@/lib/markdown';
import { documentDecorations, showDocumentImage } from './plugins';

const COMMENT_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v6.5H7l-3 2.5V10H3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

const TAG_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Elements that show something even without text
const VISIBLE_ELEMENTS = 'img, picture, video, audio, svg, hr, br, input';

// Elements the browser would make Tab stops; rendered HTML is an atom, so Tab moves past it
const TAB_STOPS =
  'a[href], area[href], button, input, select, textarea, summary, audio[controls], video[controls], [tabindex]';

// Inline tag pairs whose text in between is wrapped in the element, as the preview shows it.
// Links are left out: in rich text they come from Markdown links.
const INLINE_PAIRS = new Set(['kbd', 'sub', 'sup', 'mark', 'u', 's', 'del', 'ins', 'b', 'strong', 'i', 'em', 'small']);

// A whole value that is just one opening or closing tag
const OPENING_TAG = /^<([A-Za-z][\w-]*)(\s[^>]*)?>$/;

const CLOSING_TAG = /^<\/([A-Za-z][\w-]*)\s*>$/;

// Block containers whose unpaired tags can align the blocks between them
const ALIGNING_TAGS = new Set(['div', 'p', 'center']);

function htmlValue(node: ProseNode): string {
  return String(node.attrs.value ?? '');
}

// Trailing whitespace would let a blank line end an HTML block early
function trimSource(text: string): string {
  return text.replace(/\s+$/, '');
}

/** The rendered value, or null when it renders to nothing visible */
function renderedFragment(value: string): DocumentFragment | null {
  // A template is inert: its images don't load from the app's own address before they resolve
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(value);
  const content = template.content;

  if (!content.textContent?.trim() && !content.querySelector(VISIBLE_ELEMENTS)) return null;

  return content;
}

// Every kind of keyboard, text input and clipboard event, keypress included: ProseMirror's
// keypress handler inserts text when the html node is node-selected.
function isTypingEvent(event: Event): boolean {
  return (
    event instanceof KeyboardEvent ||
    event instanceof InputEvent ||
    event instanceof CompositionEvent ||
    event instanceof ClipboardEvent
  );
}

// The view behind each html node's DOM, so the keymap can open the selected node's source
const views = new WeakMap<Node, HtmlView>();

class HtmlView implements NodeView {
  dom: HTMLElement;
  private display: HTMLElement;
  private source: HTMLTextAreaElement | null = null;
  // Whether the open source has written to the document yet
  private wrote = false;

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.dom = document.createElement('span');
    this.dom.className = 'rt-html';
    this.dom.contentEditable = 'false';
    this.display = document.createElement('span');
    this.dom.append(this.display);
    views.set(this.dom, this);
    this.render();

    this.dom.addEventListener('click', (event) => {
      if (this.source || event.ctrlKey || event.metaKey) return;

      // Rendered links, summaries and checkboxes would act inside the editor; a click edits instead.
      // Ctrl/Cmd+click is left to the document's link handling.
      event.preventDefault();
      this.openSource();
    });
  }

  private render() {
    const value = htmlValue(this.node);
    const display = document.createElement('span');
    const comment = value.trim().match(/^<!--([\s\S]*?)-->$/);

    if (comment) {
      // Comments are notes for people reading the source: a marker that shows them on hover
      const text = comment[1].trim();
      display.className = 'rt-html-comment';
      display.title = text;
      display.setAttribute('role', 'note');
      display.setAttribute('aria-label', `Comment: ${text}`);
      display.innerHTML = COMMENT_ICON;
    } else if (isUnknownHtmlTag(value)) {
      // A placeholder such as <sha> reads as text, as in the preview
      display.className = 'rt-html-text';
      display.textContent = value;
    } else {
      const fragment = renderedFragment(value);

      if (fragment) {
        display.className = 'rt-html-render';
        this.showFragment(display, fragment);
      } else {
        display.className = 'rt-html-tag';
        display.title = value;
        display.setAttribute('role', 'note');
        display.setAttribute('aria-label', `HTML: ${value}`);
        display.innerHTML = TAG_ICON;
      }
    }

    this.display.replaceWith(display);
    this.display = display;
  }

  private showFragment(display: HTMLElement, fragment: DocumentFragment) {
    const images = Array.from(fragment.querySelectorAll('img'), (img) => {
      const src = img.getAttribute('src') ?? '';
      img.removeAttribute('src');

      return { img, src };
    });

    for (const element of fragment.querySelectorAll(TAB_STOPS)) element.setAttribute('tabindex', '-1');

    display.append(fragment);

    for (const { img, src } of images) showDocumentImage(img, src, img.alt || src);
  }

  openSource() {
    if (this.source) return;
    const source = document.createElement('textarea');
    source.className = 'rt-html-source';
    source.value = htmlValue(this.node);
    source.spellcheck = false;
    source.setAttribute('aria-label', 'HTML source');
    this.fitRows(source);

    source.addEventListener('input', () => {
      this.fitRows(source);
      this.write(trimSource(source.value));
    });

    source.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.closeSource(true);
    });

    source.addEventListener('blur', () => this.closeSource(false));
    this.source = source;
    this.wrote = false;
    this.dom.classList.add('is-editing');
    this.dom.append(source);
    source.focus();
  }

  private fitRows(source: HTMLTextAreaElement) {
    source.rows = Math.min(12, source.value.split('\n').length);
  }

  /** The node's position, while it is still this html node */
  private currentPos(): number | undefined {
    const pos = this.getPos();

    if (pos === undefined || this.view.state.doc.nodeAt(pos)?.type !== this.node.type) return undefined;

    return pos;
  }

  private write(value: string) {
    const pos = this.currentPos();

    if (pos === undefined || value === htmlValue(this.node)) return;

    // An attribute step keeps the node (and the selection on it), unlike replacing it
    const tr = this.view.state.tr.setNodeAttribute(pos, 'value', value);

    // One source session is one undo step. The history never sees attribute steps as adjacent,
    // so it would make one per keystroke; marked as appended, a write joins the session's first.
    if (this.wrote) tr.setMeta('appendedTransaction', tr);
    this.wrote = true;
    this.view.dispatch(tr);
  }

  /** Back to the rendered view; with `refocus`, the editor gets focus with this node selected */
  private closeSource(refocus: boolean) {
    const source = this.source;

    if (!source) return;
    this.source = null;
    source.remove();
    this.dom.classList.remove('is-editing');
    this.render();
    const pos = this.currentPos();

    if (pos === undefined) return;

    const { state } = this.view;

    if (!htmlValue(this.node).trim()) {
      this.view.dispatch(state.tr.delete(pos, pos + this.node.nodeSize));
    } else if (refocus) {
      this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    }

    if (refocus) this.view.focus();
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    const changed = htmlValue(node) !== htmlValue(this.node);
    this.node = node;

    if (this.source) {
      // Our own writes match the textarea already; anything else (an undo) replaces it
      if (htmlValue(node) !== trimSource(this.source.value)) this.source.value = htmlValue(node);
    } else if (changed) {
      this.render();
    }

    return true;
  }

  stopEvent(event: Event) {
    const target = event.target;

    if (!(target instanceof Node)) return false;

    // The source textarea handles its own typing, clicks and shortcuts
    if (this.source) return this.source.contains(target);

    // Keys, typing and paste in a rendered control (a mouse-focused <input>) belong to it, not to
    // the document's selection. Mouse events still reach the editor: a click opens the source.
    return this.display.contains(target) && isTypingEvent(event);
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    views.delete(this.dom);
  }
}

export const htmlView = $view(htmlSchema.node, () => (node, view, getPos) => new HtmlView(node, view, getPos));

// ---------------------------------------------------------------------------
// Layout implied by unpaired tags

/** The tag name when the node is just an opening (or closing) tag, else null */
function lonelyTag(node: ProseNode, html: NodeType, pattern: RegExp): string | null {
  if (node.type !== html) return null;

  return htmlValue(node).trim().match(pattern)?.[1]?.toLowerCase() ?? null;
}

/** The single html node a block-level paragraph holds (how remark keeps an HTML block), or null */
function htmlBlock(node: ProseNode, html: NodeType): ProseNode | null {
  if (node.type.name !== 'paragraph' || node.childCount !== 1) return null;

  return node.firstChild?.type === html ? node.firstChild : null;
}

function alignmentOf(opening: string, tag: string): string | null {
  if (tag === 'center') return 'center';

  return opening.match(/\salign\s*=\s*["']?(center|right)\b/i)?.[1]?.toLowerCase() ?? null;
}

// Top-level blocks between <div align="center"> (or <p align>, <center>) and its closing tag
function alignmentRanges(doc: ProseNode, html: NodeType, decorations: Decoration[]) {
  const blocks: Array<{ node: ProseNode; pos: number }> = [];
  doc.forEach((node, pos) => blocks.push({ node, pos }));

  blocks.forEach(({ node }, index) => {
    const block = htmlBlock(node, html);
    const tag = block && lonelyTag(block, html, OPENING_TAG);

    if (!block || !tag || !ALIGNING_TAGS.has(tag)) return;
    const align = alignmentOf(htmlValue(block).trim(), tag);

    if (!align) return;

    let depth = 0;

    for (let end = index + 1; end < blocks.length; end++) {
      const inner = htmlBlock(blocks[end].node, html);

      if (inner && lonelyTag(inner, html, OPENING_TAG) === tag) depth++;

      if (!inner || lonelyTag(inner, html, CLOSING_TAG) !== tag) continue;

      if (depth > 0) {
        depth--;
        continue;
      }

      for (const between of blocks.slice(index + 1, end)) {
        decorations.push(Decoration.node(between.pos, between.pos + between.node.nodeSize, { class: `rt-align-${align}` }));
      }

      return;
    }
  });
}

// Within one textblock, the text between <kbd> and </kbd> (and the other INLINE_PAIRS)
function inlinePairs(textblock: ProseNode, start: number, html: NodeType, decorations: Decoration[]) {
  const open: Array<{ tag: string; from: number }> = [];

  textblock.forEach((child, offset) => {
    const pos = start + offset;
    const opening = lonelyTag(child, html, OPENING_TAG);

    if (opening && INLINE_PAIRS.has(opening)) {
      open.push({ tag: opening, from: pos + child.nodeSize });

      return;
    }

    const closing = lonelyTag(child, html, CLOSING_TAG);
    const match = closing ? open.map((entry) => entry.tag).lastIndexOf(closing) : -1;

    if (!closing || match < 0) return;
    const { from } = open[match];
    open.length = match;

    if (pos > from) decorations.push(Decoration.inline(from, pos, { nodeName: closing }));
  });
}

function htmlDecorations(doc: ProseNode, html: NodeType): Decoration[] {
  const decorations: Decoration[] = [];
  alignmentRanges(doc, html, decorations);

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    // An HTML block: lets the CSS lay its rendered fragment out as a block
    if (htmlBlock(node, html)) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'rt-html-paragraph' }));
    inlinePairs(node, pos + 1, html, decorations);

    return false;
  });

  return decorations;
}

function selectedHtml(view: EditorView, html: NodeType): HtmlView | undefined {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection) || selection.node.type !== html) return undefined;
  const dom = view.nodeDOM(selection.from);

  return dom ? views.get(dom) : undefined;
}

export const htmlLayout = $prose((ctx) => {
  const html = htmlSchema.type(ctx);

  return documentDecorations('markloom-html-layout', (doc) => htmlDecorations(doc, html), {
    handleDOMEvents: {
      // Enter on a selected html node opens its source. Runs before the keymaps, whose
      // splitBlock would delete the node.
      keydown(view, event) {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
        const target = selectedHtml(view, html);

        if (!target) return false;
        event.preventDefault();
        target.openSource();

        return true;
      },
    },
    // Typing never replaces a selected html node; Backspace and Delete still remove it
    handleTextInput(view) {
      const { selection } = view.state;

      return selection instanceof NodeSelection && selection.node.type === html;
    },
  });
});
