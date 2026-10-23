// GitHub callouts in rich text: a quote whose first line is "[!NOTE]" (or TIP, IMPORTANT, WARNING,
// CAUTION) shows as the preview's coloured box with its icon and title. Decorations only, so the
// document and the saved Markdown stay as written. The marker shows as the title until the
// caret enters it, then as its text, so it stays editable.
import { $prose, $remark } from '@milkdown/kit/utils';
import { blockquoteSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { CALLOUT_MARKER, calloutTitleHtml, type CalloutKind } from '@/lib/callouts';
import { hasLiteralMarker, remarkCalloutMarkers } from './calloutMarkdown';

interface Callout {
  kind: CalloutKind;
  /** The blockquote */
  quoteFrom: number;
  quoteTo: number;
  /** The quote's first block, which starts with the marker */
  blockFrom: number;
  blockTo: number;
  /** The marker's text, without the line break after it */
  markerFrom: number;
  markerTo: number;
  /** The marker and its line break; equal to the block's content end when the marker is all of it */
  hideTo: number;
}

// One character per position: a line break reads as "\n", any other inline leaf (an image, a
// footnote reference) as a placeholder that can't match the marker
function inlineText(leaf: ProseNode): string {
  return leaf.type.name === 'hardbreak' ? '\n' : '￼';
}

// The marker is plain text in the paragraph's first text node, as the preview reads it from the
// source: in a code span or bold ("`[!TIP]`", "**[!NOTE]**") it is no marker. A link is allowed,
// since "[!note]" can parse as a reference link there too.
function isPlainMarker(paragraph: ProseNode, kindLength: number): boolean {
  const text = paragraph.firstChild;

  return !!text?.isText && (text.text ?? '').length >= '[!]'.length + kindLength && text.marks.every((mark) => mark.type.name === 'link');
}

function findCallouts(doc: ProseNode): Callout[] {
  const callouts: Callout[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return node.isBlock && !node.isTextblock;

    const first = node.firstChild;

    // Only a paragraph, as in the preview (lib/markdown.ts) and on save (calloutMarkdown.ts), and
    // not a marker written escaped (`\[!NOTE]`), which is text there
    if (first?.type.name !== 'paragraph' || node.attrs.literalMarker) return true;

    const match = first.textBetween(0, first.content.size, '', inlineText).match(CALLOUT_MARKER);

    if (!match || !isPlainMarker(first, match[1].length)) return true;

    const blockFrom = pos + 1;
    const markerFrom = blockFrom + 1;

    callouts.push({
      // SAFETY: CALLOUT_MARKER's group only matches the CalloutKind names (case-insensitively), and they are lower case.
      kind: match[1].toLowerCase() as CalloutKind,
      quoteFrom: pos,
      quoteTo: pos + node.nodeSize,
      blockFrom,
      blockTo: blockFrom + first.nodeSize,
      markerFrom,
      markerTo: markerFrom + match[0].replace(/\n$/, '').length,
      hideTo: markerFrom + match[0].length,
    });

    // A callout can hold another one
    return true;
  });

  return callouts;
}

function titleWidget(kind: CalloutKind) {
  return (view: EditorView, getPos: () => number | undefined): HTMLElement => {
    const template = document.createElement('template');

    // Static markup from lib/callouts.ts, the preview's own title row
    template.innerHTML = calloutTitleHtml(kind).trim();
    const title = template.content.firstElementChild;
    const element = title instanceof HTMLElement ? title : document.createElement('p');

    element.contentEditable = 'false';
    element.classList.add('rt-callout-title');
    // Clicking the title puts the caret at the end of the marker, which then shows as text
    element.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const pos = getPos();

      if (pos === undefined) return;

      // The widget sits right before the first block; the marker is "[!" + kind + "]"
      const caret = Math.min(pos + 1 + kind.length + 3, view.state.doc.content.size);

      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));
      view.focus();
    });

    return element;
  };
}

const calloutKey = new PluginKey<Callout[]>('markloom-callouts');

function decorateCallouts(state: EditorState): DecorationSet | null {
  const callouts = calloutKey.getState(state);

  if (!callouts?.length) return null;

  const { from, to } = state.selection;
  const decorations: Decoration[] = [];

  for (const callout of callouts) {
    const { kind } = callout;

    decorations.push(Decoration.node(callout.quoteFrom, callout.quoteTo, { class: `callout callout-${kind}`, 'data-callout': kind }));

    // The caret in or at the edge of the marker: show it as text to edit
    if (from <= callout.markerTo && to >= callout.markerFrom) continue;

    decorations.push(Decoration.widget(callout.blockFrom, titleWidget(kind), { side: -1, ignoreSelection: true, key: `callout-${kind}` }));

    // A marker that is the whole first block hides the block, so no empty line is left behind
    if (callout.hideTo >= callout.blockTo - 1) {
      decorations.push(Decoration.node(callout.blockFrom, callout.blockTo, { class: 'rt-callout-marker' }));
    } else {
      decorations.push(Decoration.inline(callout.markerFrom, callout.hideTo, { class: 'rt-callout-marker' }));
    }
  }

  return DecorationSet.create(state.doc, decorations);
}

// The callout whose hidden marker sits right before the caret: after the line break that ends the
// marker, or at the start of the block after a marker block
function hiddenMarkerBefore(state: EditorState, caret: number): Callout | undefined {
  const atBlockStart = state.doc.resolve(caret).parentOffset === 0;

  return calloutKey
    .getState(state)
    ?.find((callout) => caret === callout.hideTo || (atBlockStart && callout.hideTo >= callout.blockTo - 1 && caret === callout.blockTo + 1));
}

// The collapsed caret where the browser has it. ProseMirror reads the browser's selection a moment
// after an arrow key, so a Backspace right after one would otherwise see the caret where it was,
// miss the marker, and let the browser delete the line break after it.
function caretOf(view: EditorView): number | undefined {
  const selection = view.dom.ownerDocument.getSelection();
  const node = selection?.focusNode;

  if (selection?.isCollapsed && node && view.dom.contains(node)) return view.posAtDOM(node, selection.focusOffset);

  return view.state.selection.empty ? view.state.selection.from : undefined;
}

// Backspace never deletes the hidden marker or its line break, which would undo the callout
// unseen. It shows the marker instead, with the caret after it, so a second Backspace edits it.
// A DOM handler, so it runs before the keymaps' joinBackward.
function revealMarkerOnBackspace(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const caret = caretOf(view);
  const callout = caret === undefined ? undefined : hiddenMarkerBefore(view.state, caret);

  if (!callout) return false;
  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, callout.markerTo)).scrollIntoView());

  return true;
}

const calloutDecorations = $prose(
  () =>
    new Plugin<Callout[]>({
      key: calloutKey,
      state: {
        init: (_config, state) => findCallouts(state.doc),
        apply: (tr, callouts) => (tr.docChanged ? findCallouts(tr.doc) : callouts),
      },
      props: { decorations: decorateCallouts, handleDOMEvents: { keydown: revealMarkerOnBackspace } },
    })
);

const calloutMarkers = $remark('markloomCalloutMarkers', () => remarkCalloutMarkers);

// A quote keeps whether its marker was written escaped, so it stays text and is written escaped again
const calloutQuoteSchema = blockquoteSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);

  return {
    ...base,
    attrs: { ...base.attrs, literalMarker: { default: false, validate: 'boolean' } },
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) => {
        state.openNode(type, { literalMarker: hasLiteralMarker(node) }).next(node.children).closeNode();
      },
    },
    toMarkdown: {
      ...base.toMarkdown,
      runner: (state, node) => {
        const data = node.attrs.literalMarker ? { data: { literalCalloutMarker: true } } : undefined;

        state.openNode('blockquote', undefined, data).next(node.content).closeNode();
      },
    },
  };
});

/** Use after math: the marker is split off before math marks the `$`s of the text after it */
export const callouts = [calloutQuoteSchema, calloutMarkers, calloutDecorations].flat();
