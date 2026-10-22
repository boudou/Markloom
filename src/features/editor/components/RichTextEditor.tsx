import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Editor,
  EditorStatus,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core';
import {
  commonmark,
  headingIdGenerator,
  inlineCodeKeymap,
  remarkPreserveEmptyLinePlugin,
  syncHeadingIdPlugin,
} from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { $prose, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils';
import { Plugin, type EditorState } from '@milkdown/kit/prose/state';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { selectTabContent, useTabsStore } from '@/features/tabs';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { SHORTCUTS, matchesCombo } from '@/lib/shortcuts';
import { slugify } from '@/lib/markdown';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { useImageDrop } from '@/features/image-drop';
import { codeBlockMetaSchema, codeBlockView, diagramErrorMarks, headingIds, imageSchemaFix, imageView, inlineCodeSpellcheck, linkSchemaFix, taskToggle } from '../milkdown/plugins';
import { htmlLayout, htmlView } from '../milkdown/html';
import { prosemirrorSearchEngine, searchPlugin } from '../milkdown/search';
import { preserveUnchangedBlocks } from '../milkdown/preserve';
import { applyRichLink, insertRichSnippet, runRichAction, type LinkRequest } from '../milkdown/commands';
import { StartPanel } from './StartPanel';
import { sameFormatState, type EditorCommands, type FormatState } from '../types';
import { applyOutsideEdit } from '../milkdown/outsideEdit';
import { richFormatState } from '../milkdown/formatState';
import { setSelectedText } from '@/features/word-count';

interface RichTextEditorProps {
  tabId: string;
  /** False while the document is shown in Markdown mode: the editor stays mounted, hidden, to keep its undo history */
  active: boolean;
  onCommands: (commands: EditorCommands | null) => void;
  onFormatState: (state: FormatState) => void;
}

function MilkdownSurface({ tabId, active, onCommands, onFormatState }: RichTextEditorProps) {
  const content = useTabsStore((s) => selectTabContent(s, tabId));
  const hasPath = useTabsStore((s) => !!s.tabs.find((t) => t.id === tabId)?.path);
  const containerRef = useRef<HTMLDivElement>(null);
  // Markdown we last handed to (or received from) the editor; anything else is an outside change
  const knownMarkdown = useRef(content);
  const applyingExternal = useRef(false);
  // How the editor serializes the document as loaded. Milkdown normalizes Markdown
  // (table padding, escapes), so an update equal to this is not a user edit.
  const loadedBaseline = useRef<string | null>(null);
  // The exact source text that baseline came from
  const loadedSource = useRef(content);
  // The serializer output last written to (or loaded from) the store
  const lastSerialized = useRef<string | null>(null);
  // The load this editor was created for (EditorContainer keys it by loadId, so it is fixed per mount)
  const [loadId] = useState(() => useTabsStore.getState().tabs.find((t) => t.id === tabId)?.loadId);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const reportFormat = useRef(onFormatState);
  reportFormat.current = onFormatState;
  // While hidden, the editor's text lags the store: it must never write or report anything
  const activeRef = useRef(active);
  activeRef.current = active;
  // Hidden since the content-sync effect last ran: store changes then are Markdown-mode edits
  const wasHidden = useRef(false);
  // What the toolbar was last told; null makes the next report go out unconditionally
  const lastFormat = useRef<FormatState | null>(null);

  // Tells the toolbar what applies at the cursor, and the status bar what is selected.
  // Reads only refs, like commit below.
  const reportState = (state: EditorState) => {
    const next = richFormatState(state);

    if (!lastFormat.current || !sameFormatState(next, lastFormat.current)) {
      lastFormat.current = next;
      reportFormat.current(next);
    }

    const { from, to, empty } = state.selection;
    setSelectedText(empty ? '' : state.doc.textBetween(from, to, '\n', ' '));
  };

  // Writes the editor's Markdown into the tabs store. Reads only refs and the mount-constant
  // tabId and loadId, so the copy the editor factory captures on the first render stays correct.
  const commit = (markdown: string) => {
    if (!activeRef.current || applyingExternal.current || loadedBaseline.current === null) return;

    // The debounced listener fires after a flush with the same text: already written
    if (markdown === lastSerialized.current) return;

    // Closed, or another file was loaded into this tab: never write this editor's text over it
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);

    if (tab?.loadId !== loadId) return;
    lastSerialized.current = markdown;

    // Back to the loaded document (e.g. after undo): restore the original text exactly
    // Otherwise keep the user's own formatting for every block they didn't change
    const next =
      markdown === loadedBaseline.current
        ? loadedSource.current
        : preserveUnchangedBlocks(knownMarkdown.current, markdown);

    knownMarkdown.current = next;
    useTabsStore.getState().updateTabContent(tabId, next);
  };

  // Created once per mount: EditorContainer keys this editor by the tab's loadId, so a
  // different tab or a freshly loaded document always gets a new component
  const { get, loading } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, knownMarkdown.current);
          // Ctrl+E is Export everywhere else in the app; inline code uses Ctrl+` like the source editor
          ctx.set(inlineCodeKeymap.key, { ToggleInlineCode: { shortcuts: SHORTCUTS.inlineCode.combo } });
          // Same heading ids as the preview, so #section links resolve in both modes
          ctx.set(headingIdGenerator.key, (node) => slugify(node.textContent));
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: {
              class: 'prose-markloom rt-document',
              role: 'textbox',
              'aria-multiline': 'true',
              'aria-label': 'Document',
              spellcheck: 'true',
            },
          }));
          // Match the source editor's conventions where remark lets us
          ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' as const, emphasis: '_' as const, rule: '-' as const }));
          // Debounced by 200 ms; `flush` writes sooner when something reads the store
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => commit(markdown));
        })
        // Our headingIds numbers repeated headings like the preview; Milkdown's own sync would not.
        // Without the empty-line plugin an empty paragraph writes as a blank line, as in Markdown
        // mode, instead of `<br />`.
        .use(commonmark.filter((plugin) => plugin !== syncHeadingIdPlugin && !remarkPreserveEmptyLinePlugin.includes(plugin)))
        .use(headingIds)
        .use(gfm)
        .use(imageSchemaFix)
        .use(linkSchemaFix)
        .use(codeBlockMetaSchema)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(trailing)
        .use(codeBlockView)
        .use(diagramErrorMarks)
        .use(inlineCodeSpellcheck)
        .use(imageView)
        .use(htmlView)
        .use(htmlLayout)
        .use(taskToggle)
        .use(searchPlugin)
        .use(
          // Tell the toolbar what applies at the cursor, and the status bar what is selected
          $prose(
            () =>
              new Plugin({
                view: () => ({
                  // A hidden editor still updates (heading ids, diagram renders); the toolbar is Markdown's then
                  update: (view) => {
                    if (activeRef.current) reportState(view.state);
                  },
                  destroy: () => {
                    if (activeRef.current) setSelectedText('');
                  },
                }),
              })
          )
        )
  );

  // The editor as of this render. Milkdown can swap the instance behind `get()` without
  // a re-render (a second create finishing after the first), so anything the user
  // triggers (toolbar, palette, shortcuts, dialogs, drops) calls `get()` when it runs.
  // `get` itself changes identity per render but reads the provider's one ref.
  const editor = loading ? undefined : get();

  // Remember the normalized form of what was loaded, so viewing alone never edits the file
  useEffect(() => {
    if (!editor || loadedBaseline.current !== null) return;
    loadedBaseline.current = editor.action(getMarkdown());
    lastSerialized.current = loadedBaseline.current;
  }, [editor]);

  // Content changed elsewhere: show it. Markdown-mode edits arrive as one non-history change,
  // so undo here keeps reaching this editor's own edits; anything else (version restore,
  // template, file reload while this editor is visible) replaces the document undoably.
  useEffect(() => {
    if (!active) {
      wasHidden.current = true;

      return;
    }

    const fromMarkdownMode = wasHidden.current;
    wasHidden.current = false;

    if (!editor || content === knownMarkdown.current) return;
    knownMarkdown.current = content;
    applyingExternal.current = true;

    try {
      editor.action(fromMarkdownMode ? applyOutsideEdit(content) : replaceAll(content));
      loadedBaseline.current = editor.action(getMarkdown());
      // The listener reports this replace 200 ms later; it is not an edit
      lastSerialized.current = loadedBaseline.current;
      loadedSource.current = content;
    } finally {
      applyingExternal.current = false;
    }
  }, [content, editor, active]);

  const applyLink = (url: string, text: string) => {
    const request = linkRequest;
    setLinkRequest(null);
    const current = get();

    if (current && request && url) applyRichLink(current, request, url, text);
  };

  // `get()` keeps returning the editor after it is destroyed, and Milkdown removes the view
  // from ctx on destroy (reading it then throws), so only a created editor has a view.
  const liveView = () => {
    const current = get();

    return current?.status === EditorStatus.Created ? current.action((ctx) => ctx.get(editorViewCtx)) : undefined;
  };

  // Serializes the document now instead of waiting for the listener's debounce
  const flush = () => {
    const current = get();

    if (current?.status === EditorStatus.Created) commit(current.action(getMarkdown()));
  };

  // Read from editor state, not window.getSelection(): the palette's input holds the DOM selection
  const selectionMarkdown = () => {
    const current = get();

    if (current?.status !== EditorStatus.Created) return '';

    const { state } = current.action((ctx) => ctx.get(editorViewCtx));
    const { from, to, empty } = state.selection;

    if (empty) return '';

    // getMarkdown(range) yields '' (and only logs) when the slice can't be filled into a document
    const markdown = current.action(getMarkdown({ from, to }));

    return /\S/.test(markdown) ? markdown : state.doc.textBetween(from, to, '\n\n');
  };

  // Milkdown destroys the editor in <Milkdown />'s passive-effect cleanup, and the listener
  // drops its pending update then. A layout cleanup runs earlier, in the commit that removes
  // the editor, so a tab or mode switch right after typing keeps the edit. `flush` only reads
  // `get` (the provider's one ref) and refs, hence no deps (same reasoning as below).
  useLayoutEffect(() => () => flush(), []);

  // Expose commands to the shared toolbar, once per editor: a new object on every
  // render would make the Find bar re-run (and re-select its input) on every keystroke.
  // `get` (and `liveView`, which only reads it) is left out of the deps for that reason (see above).
  // Only while visible: hidden, the Markdown editor's commands are the toolbar's.
  useEffect(() => {
    if (!editor || !active) return;

    const withEditor = (run: (current: Editor) => void) => {
      const current = get();

      if (current) run(current);
    };

    onCommands({
      run: (action) => withEditor((current) => runRichAction(current, action, setLinkRequest)),
      search: prosemirrorSearchEngine(liveView),
      insert: (markdown) => withEditor((current) => insertRichSnippet(current, markdown)),
      focus: () => liveView()?.focus(),
      flush,
      selectionMarkdown,
    });

    return () => onCommands(null);
  }, [editor, onCommands, active]);

  // Shown again: the toolbar and status bar still describe the Markdown editor
  useEffect(() => {
    if (!active) {
      setSelectedText('');

      return;
    }

    const view = liveView();

    if (!view) return;
    lastFormat.current = null;
    reportState(view.state);
  }, [editor, active]);

  // Dropped or pasted images are stored beside the document, then inserted as Markdown
  const imageDrop = useImageDrop({
    onInsert: (markdown) => get()?.action(insert(markdown, true)),
  });

  const hasImageFiles = (items: DataTransferItemList) =>
    Array.from(items).some((item) => item.kind === 'file' && item.type.startsWith('image/'));

  // Ctrl+K opens the link dialog (Milkdown has no binding for it)
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const current = get();

    // Keys typed in a raw HTML source box or a rendered HTML control belong to it, not to the document
    if (!current || (event.target instanceof Element && event.target.closest('.rt-html-source, .rt-html-render'))) {
      return;
    }

    if (matchesCombo(event.nativeEvent, SHORTCUTS.link.combo)) {
      event.preventDefault();
      runRichAction(current, 'link', setLinkRequest);
    } else if (matchesCombo(event.nativeEvent, SHORTCUTS.taskList.combo)) {
      event.preventDefault();
      runRichAction(current, 'checkbox', setLinkRequest);
    }
  };

  // Ctrl/Cmd+click follows links; a plain click just places the cursor
  useDocumentLinks(containerRef, content, { requireModifier: true, resolveImages: false });

  const isBlank = !hasPath && content === '';

  return (
    <div className="h-full flex flex-col">
    <div
      ref={containerRef}
      // The Contents panel follows the first surface in the page; hidden, that is the preview
      data-doc-surface={active || undefined}
      className="flex-1 min-h-0 overflow-auto bg-canvas"
      onKeyDown={handleKeyDown}
      // Capture phase: take image files before ProseMirror tries to handle them
      onDropCapture={(e) => {
        if (hasImageFiles(e.dataTransfer.items)) void imageDrop.handleDrop(e);
      }}
      onDragOverCapture={(e) => {
        if (e.dataTransfer.types.includes('Files')) imageDrop.handleDragOver(e);
      }}
      onPasteCapture={(e) => {
        if (hasImageFiles(e.clipboardData.items)) {
          e.stopPropagation();
          void imageDrop.handlePaste(e);
        }
      }}
    >
      <div className="relative min-h-full px-8 py-10">
        <Milkdown />
        {isBlank && (
          <div className="pointer-events-none absolute inset-x-8 top-10 mx-auto max-w-[var(--page-width,72ch)]">
            <p className="font-editor text-lg text-text-muted">Start writing…</p>
            <StartPanel
              className="pointer-events-auto mt-16"
              writeHint="Type here and format with the toolbar or shortcuts. It is saved as plain Markdown."
            />
          </div>
        )}
      </div>

      <LinkDialog
        request={linkRequest}
        onCancel={() => setLinkRequest(null)}
        onSubmit={applyLink}
        onClosed={() => liveView()?.focus()}
      />
    </div>
    </div>
  );
}

function LinkDialog({
  request,
  onCancel,
  onSubmit,
  onClosed,
}: {
  request: LinkRequest | null;
  onCancel: () => void;
  onSubmit: (url: string, text: string) => void;
  onClosed: () => void;
}) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const isImage = request?.kind === 'image';

  useEffect(() => {
    if (request) {
      setUrl('');
      setText('');
    }
  }, [request]);

  return (
    <Modal
      open={!!request}
      onOpenChange={(open) => !open && onCancel()}
      title={isImage ? 'Insert image' : 'Insert link'}
      size="md"
      // Opened from the toolbar, a menu or Ctrl+K: whatever had focus then, typing continues in the document
      returnFocus={onClosed}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(url.trim(), text.trim());
        }}
        className="space-y-4"
      >
        <label className="block text-sm">
          <span className="text-text-secondary">{isImage ? 'Image address or relative path' : 'Address'}</span>
          <Input
            data-autofocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={isImage ? 'images/diagram.png' : 'https://example.com or ./other-doc.md'}
            className="mt-1.5"
          />
        </label>
        {(isImage || !request?.hasSelection) && (
          <label className="block text-sm">
            <span className="text-text-secondary">{isImage ? 'Description (alt text)' : 'Text to show'}</span>
            <Input value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5" />
          </label>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!url.trim()}>
            {isImage ? 'Insert image' : 'Insert link'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Rich-text editing over the same Markdown the source view edits. Remounts per tab; stays mounted, hidden, across mode switches. */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownSurface {...props} />
    </MilkdownProvider>
  );
}
