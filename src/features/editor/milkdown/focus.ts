// Focus mode in the rich-text editor: the top-level block with the cursor is always marked
// (CSS dims the others only under [data-focus]), and while focus mode is on the cursor is kept
// at mid-screen as you type or move with the keyboard. ProseMirror doesn't scroll for clicks.
import { $prose } from '@milkdown/kit/utils';
import { AllSelection, Plugin, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import { useAppStore } from '@/stores/appStore';
import { keepCaretOnFocusToggle } from '../focusToggle';

function focusDecorations(state: EditorState): DecorationSet | null {
  const { selection } = state;

  if (selection instanceof AllSelection) return null;

  const { $from } = selection;

  if ($from.depth > 0) {
    return DecorationSet.create(state.doc, [Decoration.node($from.before(1), $from.after(1), { class: 'is-focus-block' })]);
  }

  // A selected top-level node (an image, a rule) sits at depth 0
  const node = state.doc.nodeAt(selection.from);

  if (!node) return null;

  return DecorationSet.create(state.doc, [Decoration.node(selection.from, selection.from + node.nodeSize, { class: 'is-focus-block' })]);
}

/** The page that scrolls this editor (its surface), while it is the one showing */
function scroller(view: EditorView): HTMLElement | null {
  return view.dom.closest<HTMLElement>('[data-doc-surface]');
}

function centreCursor(view: EditorView): boolean {
  const page = scroller(view);

  if (!useAppStore.getState().focusMode || !page) return false;

  const cursor = view.coordsAtPos(view.state.selection.head);
  const box = page.getBoundingClientRect();

  page.scrollTop += (cursor.top + cursor.bottom) / 2 - (box.top + box.height / 2);

  return true;
}

export const focusPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations: focusDecorations,
        handleScrollToSelection: centreCursor,
      },
      view: (view) => ({
        destroy: keepCaretOnFocusToggle(
          () => view.coordsAtPos(view.state.selection.head).top,
          () => scroller(view)
        ),
      }),
    })
);
