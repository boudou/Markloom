// When the browser's selection is still the range ProseMirror put around a selected node (it does
// so after caretSync refuses a read), Chrome sends Cut and Copy to the page body, not to the
// editor, so ProseMirror's own handler never runs and Ctrl+X cut nothing (#252). This does what
// that handler does.
import { $prose } from '@milkdown/kit/utils';
import { NodeSelection, Plugin } from '@milkdown/kit/prose/state';

export const nodeClipboard = $prose(
  () =>
    new Plugin({
      view: (view) => {
        // Mirrors prosemirror-view's private copy/cut handler (`handlers.copy = editHandlers.cut` in
        // prosemirror-view/dist/index.js, 1.42.6), which ProseMirror does not export. Recheck it
        // against that handler when prosemirror-view is upgraded.
        const onClipboard = (event: ClipboardEvent) => {
          const { selection } = view.state;
          const target = event.target;
          const data = event.clipboardData;
          const cut = event.type === 'cut';

          // An event inside the editor reaches ProseMirror's own handler; a read-only editor cuts nothing
          const reachesEditor = target instanceof Node && view.dom.contains(target);

          if (reachesEditor || (cut && !view.editable)) return;

          if (event.defaultPrevented || !data || !(selection instanceof NodeSelection) || !view.hasFocus()) return;

          const { dom, text } = view.serializeForClipboard(selection.content());

          event.preventDefault();
          data.clearData();
          data.setData('text/html', dom.innerHTML);
          data.setData('text/plain', text);

          if (cut) view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
        };

        const page = view.dom.ownerDocument;

        page.addEventListener('cut', onClipboard);
        page.addEventListener('copy', onClipboard);

        return {
          destroy: () => {
            page.removeEventListener('cut', onClipboard);
            page.removeEventListener('copy', onClipboard);
          },
        };
      },
    })
);
