// Focus mode in the source editor: the lines of the block with the cursor are always marked
// (CSS dims the others only under [data-focus]), and while focus mode is on the cursor line is
// kept at mid-screen as you type or move with the keyboard. Clicks don't scroll.
import { syntaxTree } from '@codemirror/language';
import { EditorState, RangeSetBuilder, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { useAppStore } from '@/stores/appStore';
import { keepCaretOnFocusToggle } from '../focusToggle';

const focusLine = Decoration.line({ class: 'cm-focus-block' });

/** Line range of the top-level block at the cursor, or the cursor's line between blocks */
function currentBlock(state: EditorState) {
  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  // Side 1 finds a block starting at the cursor, side -1 one ending there
  let node = tree.resolveInner(head, 1);

  if (!node.parent) node = tree.resolveInner(head, -1);

  while (node.parent?.parent) node = node.parent;

  if (!node.parent) {
    const line = state.doc.lineAt(head);

    return { from: line.from, to: line.from };
  }

  return { from: node.from, to: node.to };
}

function build(state: EditorState): DecorationSet {
  const { from, to } = currentBlock(state);
  const builder = new RangeSetBuilder<Decoration>();

  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos);

    builder.add(line.from, line.from, focusLine);
    pos = line.to + 1;
  }

  return builder.finish();
}

const focusBlock = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view.state);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = build(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/** Typewriter scrolling: whatever would scroll the cursor into view centres it instead */
const centreCursor = EditorState.transactionExtender.of((tr: Transaction) => {
  if (!tr.scrollIntoView || tr.isUserEvent('select.pointer') || !useAppStore.getState().focusMode) return null;

  return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' }) };
});

const keepCursorOnToggle = ViewPlugin.fromClass(
  class {
    private readonly dispose: () => void;
    constructor(view: EditorView) {
      this.dispose = keepCaretOnFocusToggle(
        () => view.coordsAtPos(view.state.selection.main.head)?.top ?? null,
        () => view.scrollDOM
      );
    }
    destroy() {
      this.dispose();
    }
  }
);

export const focusEditing = [focusBlock, centreCursor, keepCursorOnToggle];
