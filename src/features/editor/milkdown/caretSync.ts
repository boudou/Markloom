// A key pressed right after a click, or right after a key the browser handles itself (End, Home),
// must act where the caret is shown. ProseMirror learns where the browser put the caret only from
// the document's `selectionchange` event, which the browser queues as an ordinary task; on a busy
// page input events run first, so a key can reach the editor while its state still holds the old
// selection. Backspace then lifted the first heading instead of deleting its text, Enter and typing
// landed at the start of the document, and Copy as rich text still saw a formula selected.
// Replaying `selectionchange` on keydown makes ProseMirror read the browser's selection through its
// own handler before any other plugin's key handler or keymap acts; when nothing moved, that read
// changes nothing. RichTextEditor registers it first so that ordering holds.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, TextSelection, type Selection } from '@milkdown/kit/prose/state';

/** keyCode of the keydown events an IME sends while composing, which ProseMirror leaves alone */
const COMPOSING_KEY_CODE = 229;

export const caretSync = $prose(() => {
  // The editor's selection when the last click began, until the next key
  let beforeClick: Selection | null = null;

  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view) => {
          beforeClick = view.state.selection;

          return false;
        },
        keydown: (view, event) => {
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
