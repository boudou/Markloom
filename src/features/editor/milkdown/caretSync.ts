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
// A modifier pressed on its own (Ctrl before X) is not such a move: Chrome jumps on it too.
// RichTextEditor registers this plugin first so that both orderings hold.
import { $prose } from '@milkdown/kit/utils';
import { NodeSelection, Plugin, TextSelection, type Selection, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/** keyCode of the keydown events an IME sends while composing, which ProseMirror leaves alone */
const COMPOSING_KEY_CODE = 229;

/** Keys that only modify the next one; pressed alone they do not move the selection on purpose */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

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
  // Set when the editor selects a node, until the user moves the selection on purpose
  let nodeGuard = false;
  // Whether the last key pressed was a modifier alone, until the next key, pointer down or blur
  let modifierAlone = false;
  let editorView: EditorView | null = null;

  const disarm = () => {
    nodeGuard = false;
    modifierAlone = false;

    return false;
  };

  return new Plugin({
    filterTransaction: (tr, state) => {
      if (!nodeGuard || !editorView || !tr.selectionSet || tr.docChanged || tr.selection.eq(state.selection)) return true;

      // A key's own command scrolls, and so does ProseMirror's read of the browser's selection
      // right after a key it left alone; after a modifier alone, only that read can arrive
      if (tr.scrolledIntoView && !modifierAlone) return true;

      return !readsBrowserCaret(editorView, tr);
    },
    view: (view) => {
      editorView = view;

      // Added after ProseMirror's own listener, so it knows whether the editor handled the key
      const onKeyDown = (event: KeyboardEvent) => {
        if (!event.defaultPrevented && !modifierAlone) nodeGuard = false;
      };

      view.dom.addEventListener('keydown', onKeyDown);

      return {
        update: (updated, prev) => {
          const { selection } = updated.state;

          if (selection instanceof NodeSelection && !selection.eq(prev.selection)) nodeGuard = true;
        },
        destroy: () => {
          view.dom.removeEventListener('keydown', onKeyDown);
          editorView = null;
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
          modifierAlone = false;
          // The one arming `update` cannot see: a click inside a selected atom leaves it selected
          // without a transaction (ProseMirror skips an unchanged selection), and the browser still
          // moves its own selection away. A click inside a selected paragraph or code block places
          // a caret there on purpose, so it disarms
          nodeGuard =
            selection instanceof NodeSelection &&
            selection.node.isAtom &&
            target instanceof Node &&
            !!view.nodeDOM(selection.from)?.contains(target);

          return false;
        },
        touchstart: disarm,
        blur: disarm,
        keydown: (view, event) => {
          // Runs before the editor's own key handling, so its commands see the new value
          modifierAlone = MODIFIER_KEYS.has(event.key);

          if (event.isComposing || event.keyCode === COMPOSING_KEY_CODE) return false;

          const { selection } = view.state;
          const clickUnread = beforeClick !== null && selection.eq(beforeClick);

          beforeClick = null;

          // A node or cell the editor selected itself (a click on a definition, an arrow onto an
          // image) shows no caret of its own, so the browser's selection would lose it
          if (!view.hasFocus() || (!(selection instanceof TextSelection) && !clickUnread)) return false;

          view.dom.ownerDocument.dispatchEvent(new Event('selectionchange'));

          return false;
        },
      },
    },
  });
});
