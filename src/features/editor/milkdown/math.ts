// TeX math in rich text: `$…$` and `$$…$$` become atoms that show the formula typeset by the same
// lazy KaTeX module as the preview. A click (or Enter while one is selected) opens its TeX source,
// the way raw HTML works (html.ts). Typing `$a+b$` and a space makes inline math; `$$` and Enter
// in an empty paragraph makes a display block. Reading and writing the Markdown is in mathMarkdown.ts.
import { $inputRule, $nodeSchema, $prose, $remark, $view } from '@milkdown/kit/utils';
import { inlineCodeSchema } from '@milkdown/kit/preset/commonmark';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { NodeSelection, Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { fillMath, isMathReady, loadMath, onMathReady } from '@/features/math';
import { inlineMathClose } from '@/lib/markdown';
import { remarkMarkloomMath } from './mathMarkdown';

function mathValue(node: ProseNode): string {
  return String(node.attrs.value ?? '');
}

export const mathRemark = $remark('markloomMath', () => remarkMarkloomMath);

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '', validate: 'string' } },
  // Read as written: heading ids include the formula as the preview's do. Find passes its own
  // placeholder for atoms, so TeX isn't searchable in rich text.
  leafText: (node) => `$${mathValue(node)}$`,
  toDOM: (node) => ['span', { 'data-type': 'math_inline', 'data-value': mathValue(node) }, `$${mathValue(node)}$`],
  parseDOM: [{ tag: 'span[data-type="math_inline"]', getAttrs: (dom) => ({ value: dom.dataset.value ?? '' }) }],
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      // SAFETY: a remark inlineMath node has a string value.
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, mathValue(node));
    },
  },
}));

export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  defining: true,
  attrs: { value: { default: '', validate: 'string' } },
  toDOM: (node) => ['div', { 'data-type': 'math_block', 'data-value': mathValue(node) }, `$$${mathValue(node)}$$`],
  parseDOM: [{ tag: 'div[data-type="math_block"]', getAttrs: (dom) => ({ value: dom.dataset.value ?? '' }) }],
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => {
      // SAFETY: a remark math node has a string value.
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, mathValue(node));
    },
  },
}));

// ---------------------------------------------------------------------------
// The node view: the typeset formula, and its TeX source on demand

// The view behind each math node's DOM, so the keymap can open the selected node's source
const views = new WeakMap<Node, MathView>();

class MathView implements NodeView {
  dom: HTMLElement;
  private display: HTMLElement;
  private source: HTMLTextAreaElement | null = null;
  // Whether the open source has written to the document yet
  private wrote = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private block: boolean
  ) {
    this.dom = document.createElement(block ? 'div' : 'span');
    this.dom.className = block ? 'rt-math rt-math-block' : 'rt-math';
    this.dom.contentEditable = 'false';
    this.dom.title = block
      ? 'Click to edit the TeX (Ctrl+Enter to finish). Find doesn’t search inside formulas.'
      : 'Click to edit the TeX (Enter to finish). Find doesn’t search inside formulas.';
    this.display = document.createElement(block ? 'div' : 'span');
    this.dom.append(this.display);
    views.set(this.dom, this);
    this.render();

    // KaTeX loads with the first formula; until then the source shows, then everything re-renders
    if (!isMathReady()) {
      this.unsubscribe = onMathReady(() => this.render());
      void loadMath();
    }

    this.dom.addEventListener('click', () => this.openSource());
  }

  private render() {
    const tex = mathValue(this.node);
    const display = document.createElement(this.block ? 'div' : 'span');

    if (tex.trim()) {
      display.className = this.block ? 'math math-display' : 'math';
      display.setAttribute('data-math', encodeURIComponent(tex));
      display.textContent = this.block ? `$$${tex}$$` : `$${tex}$`;
    } else {
      display.className = 'rt-math-empty';
      display.textContent = 'Empty formula';
    }

    this.display.replaceWith(display);
    this.display = display;
    fillMath(this.dom);
  }

  openSource() {
    if (this.source) return;

    const source = document.createElement('textarea');
    source.className = 'rt-math-source';
    source.value = mathValue(this.node);
    source.spellcheck = false;
    source.placeholder = this.block ? 'TeX, e.g. \\int_0^1 x\\,dx' : 'TeX, e.g. a^2 + b^2';
    source.setAttribute('aria-label', this.block ? 'Display math TeX source' : 'Math TeX source');
    this.fitRows(source);

    source.addEventListener('input', () => {
      this.fitRows(source);
      this.write(this.texOf(source.value));
    });

    source.addEventListener('keydown', (event) => {
      // Inline math finishes on Enter; a display block takes new lines and finishes on Ctrl+Enter
      const finish =
        event.key === 'Escape' ||
        (event.key === 'Enter' && !event.shiftKey && !event.altKey && (!this.block || event.ctrlKey || event.metaKey));

      if (!finish || event.isComposing) return;

      event.preventDefault();
      this.closeSource(true);
    });

    source.addEventListener('blur', () => {
      // Leaving the window (Alt+Tab, a native dialog) is not closing the source: it would delete an
      // emptied node. The browser refocuses the textarea when the window comes back.
      if (!document.hasFocus()) return;

      this.closeSource(false);
    });

    this.source = source;
    this.wrote = false;
    this.dom.classList.add('is-editing');
    this.dom.append(source);
    source.focus();
  }

  /** The TeX a source value stands for: trimmed, and on one line for inline math */
  private texOf(value: string): string {
    return (this.block ? value : value.replace(/\s*\n\s*/g, ' ')).trim();
  }

  private fitRows(source: HTMLTextAreaElement) {
    source.rows = this.block ? Math.min(12, Math.max(2, source.value.split('\n').length)) : 1;
  }

  /** The node's position, while it is still this math node */
  private currentPos(): number | undefined {
    const pos = this.getPos();

    if (pos === undefined || this.view.state.doc.nodeAt(pos)?.type !== this.node.type) return undefined;

    return pos;
  }

  private write(value: string) {
    const pos = this.currentPos();

    if (pos === undefined || value === mathValue(this.node)) return;

    // An attribute step keeps the node (and the selection on it), unlike replacing it
    const tr = this.view.state.tr.setNodeAttribute(pos, 'value', value);

    // One source session is one undo step. The history never sees attribute steps as adjacent,
    // so it would make one per keystroke; marked as appended, a write joins the session's first.
    if (this.wrote) tr.setMeta('appendedTransaction', tr);

    this.wrote = true;
    this.view.dispatch(tr);
  }

  /** Back to the typeset view; with `refocus`, the editor gets focus with this node selected */
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

    if (!mathValue(this.node).trim()) {
      this.view.dispatch(state.tr.delete(pos, pos + this.node.nodeSize));
    } else if (refocus) {
      this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    }

    if (refocus) this.view.focus();
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;

    const changed = mathValue(node) !== mathValue(this.node);
    this.node = node;

    if (this.source) {
      // Our own writes match the textarea already; anything else (an undo) replaces it
      if (mathValue(node) !== this.texOf(this.source.value)) this.source.value = mathValue(node);
    } else if (changed) {
      this.render();
    }

    return true;
  }

  stopEvent(event: Event) {
    const target = event.target;

    // The source textarea handles its own typing, clicks and shortcuts
    return !!this.source && target instanceof Node && this.source.contains(target);
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.unsubscribe?.();
    views.delete(this.dom);
  }
}

export const mathInlineView = $view(mathInlineSchema.node, () => (node, view, getPos) => new MathView(node, view, getPos, false));

export const mathBlockView = $view(mathBlockSchema.node, () => (node, view, getPos) => new MathView(node, view, getPos, true));

// ---------------------------------------------------------------------------
// Typing math

// A `$` and a space; whether it closes math is the preview's rule, applied in the handler
const DOLLAR_TYPED = /\$ $/;

/**
 * Where the inline math closed by the `$` at `close` opens, reading `text` left to right as the
 * preview does (escapes skipped, earlier formulas taken first), or -1 when that `$` closes none.
 */
function typedMathOpen(text: string, close: number): number {
  for (let at = 0; at < close; at++) {
    if (text[at] === '\\') {
      at++;
      continue;
    }

    const end = inlineMathClose(text, at, text.length);

    if (end === close) return at;

    if (end !== -1) at = end;
  }

  return -1;
}

export const mathInputRule = $inputRule((ctx) => {
  return new InputRule(DOLLAR_TYPED, (state, match, start, end) => {
    // The textblock's text before the cursor (an inline node counts as one character, as in the
    // document), ending with the typed `$` and space
    const text = match.input ?? '';
    const close = text.length - 2;
    const open = typedMathOpen(text, close);

    if (open === -1) return null;

    const from = start - (close - open);

    if (state.doc.rangeHasMark(from, end, inlineCodeSchema.type(ctx))) return null;

    const math = mathInlineSchema.type(ctx).create({ value: text.slice(open + 1, close) });

    return state.tr.replaceWith(from, end, [math, state.schema.text(' ')]);
  });
});

function selectedMath(view: EditorView): MathView | undefined {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection)) return undefined;

  const dom = view.nodeDOM(selection.from);

  return dom ? views.get(dom) : undefined;
}

export const mathKeys = $prose((ctx) => {
  const isMath = (node: ProseNode) => node.type === mathInlineSchema.type(ctx) || node.type === mathBlockSchema.type(ctx);

  return new Plugin({
    key: new PluginKey('markloom-math-keys'),
    props: {
      handleDOMEvents: {
        // Runs before the keymaps: Enter on a selected formula opens its source (splitBlock would
        // delete it), and Enter after `$$` alone in a paragraph turns it into a display block
        keydown(view, event) {
          if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return false;

          const target = selectedMath(view);

          if (target) {
            event.preventDefault();
            target.openSource();

            return true;
          }

          const { selection } = view.state;
          const { $from } = selection;

          if (!selection.empty || $from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '$$' || $from.parentOffset !== 2) {
            return false;
          }

          event.preventDefault();
          const pos = $from.before();
          view.dispatch(view.state.tr.replaceWith(pos, $from.after(), mathBlockSchema.type(ctx).create({ value: '' })));
          const dom = view.nodeDOM(pos);

          if (dom) views.get(dom)?.openSource();

          return true;
        },
      },
      // Typing never replaces a selected formula; Backspace and Delete still remove it
      handleTextInput(view) {
        const { selection } = view.state;

        return selection instanceof NodeSelection && isMath(selection.node);
      },
    },
  });
});

export const math = [
  mathRemark,
  mathInlineSchema,
  mathBlockSchema,
  mathInlineView,
  mathBlockView,
  mathInputRule,
  mathKeys,
].flat();
