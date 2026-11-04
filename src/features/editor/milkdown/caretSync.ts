// A key pressed right after a click, or right after a key the browser handles itself (End, Home),
// must act where the caret is shown. ProseMirror learns where the browser put the caret only from
// the document's `selectionchange` event, which the browser queues as an ordinary task; on a busy
// page input events run first, so a key can reach the editor while its state still holds the old
// selection. Backspace then lifted the first heading instead of deleting its text, Enter and typing
// landed at the start of the document, and Copy as rich text still saw a formula selected.
// Replaying `selectionchange` on keydown makes ProseMirror read the browser's selection through its
// own handler before any other plugin's key handler or keymap acts; when nothing moved, that read
// changes nothing.
//
// A selected node (a definition, front matter, a formula, an image) has no caret of its own: the
// browser's hidden selection sits between non-editable blocks, and when a key arrives Chrome moves
// it to the first caret position in the document and reports that (#234). Read before the key, the
// key acted at the top; read after a Delete, the caret jumped to the top. From the moment the editor
// selects a node until the user moves the selection on purpose (a pointer down, a key the editor
// leaves to the browser, the editor losing focus), a read of the browser's selection that would
// turn into a bare caret is refused, and ProseMirror puts the browser's selection back itself.
// A modifier pressed on its own (Ctrl before X) is not such a move: Chrome jumps on it too, and
// neither is Copy, which leaves the node selected for the next key (#246). A cut or Delete that
// selects the next node arms the guard again, and only a key's own command may turn the node into
// a caret with a scroll: a read of the browser's selection never may, even right after a key (#267).
//
// The browser cannot move a caret it does not show, so the keys that go to the start or end of the
// document (Ctrl+Home, Ctrl+End) are handled here while a node is selected, and with Shift they
// extend the selection to that edge (#246, #267).
//
// The copy/cut redirect for a node range Chrome sends to the page body is `nodeClipboard.ts` (#252).
// RichTextEditor registers this plugin first so that both orderings hold.
import { $prose } from '@milkdown/kit/utils';
import { AllSelection, NodeSelection, Plugin, Selection, TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { isMac, matchesCombo } from '@/lib/shortcuts';

/** keyCode of the keydown events an IME sends while composing, which ProseMirror leaves alone */
const COMPOSING_KEY_CODE = 229;

/** Keys that only modify the next one; pressed alone they do not move the selection on purpose */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

/**
 * Whether a read of the browser's selection may turn a selected node into a bare caret: `idle`
 * lets every read through; `armed` refuses one unless a key's own command scrolled it; after a
 * modifier alone or Copy, which neither moves nor scrolls, `armed-after-modifier` refuses that too
 */
type NodeGuard = 'idle' | 'armed' | 'armed-after-modifier';

/** Copy, which leaves the selection where it is: Ctrl+C (Cmd+C), or Ctrl+Insert */
function isCopyKey(event: KeyboardEvent): boolean {
  return matchesCombo(event, 'Mod-c') || (!isMac && matchesCombo(event, 'Mod-Insert'));
}

/** The key that goes to the start of the document: Ctrl+Home, Cmd+Up on macOS */
const DOCUMENT_START_COMBO = isMac ? 'Mod-ArrowUp' : 'Mod-Home';

/** The key that goes to the end of the document: Ctrl+End, Cmd+Down on macOS */
const DOCUMENT_END_COMBO = isMac ? 'Mod-ArrowDown' : 'Mod-End';

/** The key that selects to the start of the document: Shift+Ctrl+Home, Shift+Cmd+Up on macOS */
const DOCUMENT_START_SELECT_COMBO = isMac ? 'Mod-Shift-ArrowUp' : 'Mod-Shift-Home';

/** The key that selects to the end of the document: Shift+Ctrl+End, Shift+Cmd+Down on macOS */
const DOCUMENT_END_SELECT_COMBO = isMac ? 'Mod-Shift-ArrowDown' : 'Mod-Shift-End';

/** A key that goes to the start (-1) or end (1) of the document, extending the selection or not */
interface DocumentEdgeKey {
  edge: -1 | 1;
  extend: boolean;
}

/** Which document edge a key goes to, if any */
function documentEdgeKey(event: KeyboardEvent): DocumentEdgeKey | null {
  if (matchesCombo(event, DOCUMENT_START_COMBO)) return { edge: -1, extend: false };

  if (matchesCombo(event, DOCUMENT_END_COMBO)) return { edge: 1, extend: false };

  if (matchesCombo(event, DOCUMENT_START_SELECT_COMBO)) return { edge: -1, extend: true };

  return matchesCombo(event, DOCUMENT_END_SELECT_COMBO) ? { edge: 1, extend: true } : null;
}

/**
 * The selection from a selected node to the start (-1) or end (1) of the document. Both ends of a
 * text selection must sit in text, so its fixed end is the nearest text on the far side of the node
 * (any non-text blocks between are selected too); with no text there, the whole document. Null when
 * there is no text between the node and that edge.
 */
function selectionToDocumentEdge(doc: ProseNode, selection: NodeSelection, edge: -1 | 1): Selection | null {
  const head = Selection.findFrom(doc.resolve(edge < 0 ? 0 : doc.content.size), -edge, true);

  if (!head || (edge < 0 ? head.head >= selection.to : head.head <= selection.from)) return null;

  const anchor = Selection.findFrom(doc.resolve(edge < 0 ? selection.to : selection.from), -edge, true);

  if (!anchor) return new AllSelection(doc);

  return TextSelection.create(doc, anchor.head, head.head);
}

/** Whether a selection-only transaction moves a collapsed caret to where the browser's selection is */
function readsBrowserCaret(view: EditorView, tr: Transaction): boolean {
  const caret = tr.selection;

  if (!(caret instanceof TextSelection) || !caret.empty) return false;

  const browser = view.dom.ownerDocument.getSelection();
  const focusNode = browser?.focusNode;

  if (!browser || !browser.isCollapsed || !focusNode || !view.dom.contains(focusNode)) return false;

  return view.posAtDOM(focusNode, browser.focusOffset, 1) === caret.head;
}

export const caretSync = $prose(() => {
  // The editor's selection when the last click began, until the next key
  let beforeClick: Selection | null = null;
  // Armed when the editor selects a node, until the user moves the selection on purpose
  let guard: NodeGuard = 'idle';
  // While ProseMirror handles a keydown after this plugin's handler: a key's own command runs then
  let handlingKey = false;
  let editorView: EditorView | null = null;

  const disarm = () => {
    guard = 'idle';

    return false;
  };

  return new Plugin({
    filterTransaction: (tr, state) => {
      if (guard === 'idle' || !editorView || !tr.selectionSet || tr.docChanged || tr.selection.eq(state.selection)) return true;

      // Only a key's own command, dispatched while ProseMirror handles the keydown, may turn the
      // node into a caret with a scroll. ProseMirror also scrolls a read of the browser's selection
      // within 50 ms of a key it left alone (a modifier), which may come later and is refused (#267)
      if (tr.scrolledIntoView && guard === 'armed' && handlingKey) return true;

      return !readsBrowserCaret(editorView, tr);
    },
    view: (view) => {
      editorView = view;

      // Added after ProseMirror's own listener, so it knows whether the editor handled the key
      const onKeyDown = (event: KeyboardEvent) => {
        handlingKey = false;

        if (!event.defaultPrevented && guard === 'armed') guard = 'idle';
      };

      view.dom.addEventListener('keydown', onKeyDown);

      return {
        update: (updated, prev) => {
          const { selection } = updated.state;
          const before = prev.selection;

          if (!(selection instanceof NodeSelection)) return;

          // NodeSelection.eq compares positions only: after a cut, the next node sits where the
          // cut one was and must arm the guard too (#267)
          const sameNode = before instanceof NodeSelection && before.from === selection.from && before.node === selection.node;

          if (!sameNode) guard = 'armed';
        },
        destroy: () => {
          view.dom.removeEventListener('keydown', onKeyDown);
          editorView = null;
          handlingKey = false;
          disarm();
        },
      };
    },
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          const { selection } = view.state;
          const target = event.target;

          beforeClick = selection;

          // The one arming `update` cannot see: a click inside a selected atom leaves it selected
          // without a transaction (ProseMirror skips an unchanged selection), and the browser still
          // moves its own selection away. A click inside a selected paragraph or code block places
          // a caret there on purpose, so it disarms
          const insideSelectedAtom =
            selection instanceof NodeSelection &&
            selection.node.isAtom &&
            target instanceof Node &&
            !!view.nodeDOM(selection.from)?.contains(target);

          guard = insideSelectedAtom ? 'armed' : 'idle';

          return false;
        },
        touchstart: disarm,
        blur: disarm,
        keydown: (view, event) => {
          // Runs before the editor's own key handling, so its commands see the new value
          if (guard !== 'idle') guard = MODIFIER_KEYS.has(event.key) || isCopyKey(event) ? 'armed-after-modifier' : 'armed';

          if (event.isComposing || event.keyCode === COMPOSING_KEY_CODE) {
            handlingKey = true;

            return false;
          }

          const { selection } = view.state;
          const edgeKey = documentEdgeKey(event);

          if (edgeKey && selection instanceof NodeSelection) {
            const { doc } = view.state;
            const { edge, extend } = edgeKey;

            // With Shift, from the node to that edge; without, the first or last caret position in
            // text (the document can start or end with a block)
            const target = extend
              ? selectionToDocumentEdge(doc, selection, edge)
              : Selection.findFrom(doc.resolve(edge < 0 ? 0 : doc.content.size), -edge, true);

            beforeClick = null;
            guard = 'idle';
            event.preventDefault();

            if (target) view.dispatch(view.state.tr.setSelection(target).scrollIntoView());

            return true;
          }

          const clickUnread = beforeClick !== null && selection.eq(beforeClick);

          beforeClick = null;

          // A node or cell the editor selected itself (a click on a definition, an arrow onto an
          // image) shows no caret of its own, so the browser's selection would lose it
          if (view.hasFocus() && (selection instanceof TextSelection || clickUnread)) {
            view.dom.ownerDocument.dispatchEvent(new Event('selectionchange'));
          }

          // After the replay, so the read it makes is no key's own command
          handlingKey = true;

          return false;
        },
      },
    },
  });
});
