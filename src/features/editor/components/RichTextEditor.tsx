import { useEffect, useRef, useState } from 'react';
import {
  Editor,
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
} from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { $prose, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { selectTabContent, useTabsStore } from '@/features/tabs';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { SHORTCUTS, matchesCombo } from '@/lib/shortcuts';
import { slugify } from '@/lib/markdown';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { useImageDrop } from '@/features/image-drop';
import { codeBlockView, diagramErrorMarks, htmlView, imageSchemaFix, imageView, inlineCodeSpellcheck, taskToggle } from '../milkdown/plugins';
import { prosemirrorSearchEngine, searchPlugin } from '../milkdown/search';
import { preserveUnchangedBlocks } from '../milkdown/preserve';
import { applyRichLink, insertRichSnippet, runRichAction, type LinkRequest } from '../milkdown/commands';
import { StartPanel } from './StartPanel';
import { EMPTY_FORMAT_STATE, sameFormatState, type EditorCommands, type FormatState } from '../types';
import { richFormatState } from '../milkdown/formatState';
import { setSelectedText } from '@/features/word-count';

interface RichTextEditorProps {
  tabId: string;
  onCommands: (commands: EditorCommands | null) => void;
  onFormatState: (state: FormatState) => void;
}

function MilkdownSurface({ tabId, onCommands, onFormatState }: RichTextEditorProps) {
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
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const reportFormat = useRef(onFormatState);
  reportFormat.current = onFormatState;

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
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            if (applyingExternal.current || loadedBaseline.current === null) return;
            // Back to the loaded document (e.g. after undo): restore the original text exactly
            // Otherwise keep the user's own formatting for every block they didn't change
            const next =
              markdown === loadedBaseline.current
                ? loadedSource.current
                : preserveUnchangedBlocks(knownMarkdown.current, markdown);
            knownMarkdown.current = next;
            useTabsStore.getState().updateTabContent(tabId, next);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(imageSchemaFix)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(trailing)
        .use(codeBlockView)
        .use(diagramErrorMarks)
        .use(inlineCodeSpellcheck)
        .use(imageView)
        .use(htmlView)
        .use(taskToggle)
        .use(searchPlugin)
        .use(
          // Tell the toolbar what applies at the cursor, and the status bar what is selected
          $prose(() => {
            let last = EMPTY_FORMAT_STATE;
            return new Plugin({
              view: () => ({
                update: (view) => {
                  const next = richFormatState(view.state);
                  if (!sameFormatState(next, last)) {
                    last = next;
                    reportFormat.current(next);
                  }
                  const { from, to, empty } = view.state.selection;
                  setSelectedText(empty ? '' : view.state.doc.textBetween(from, to, '\n', ' '));
                },
                destroy: () => setSelectedText(''),
              }),
            });
          })
        ),
    [tabId]
  );

  // The editor once created; the same instance for this surface's lifetime
  const editor = loading ? undefined : get();

  // Remember the normalized form of what was loaded, so viewing alone never edits the file
  useEffect(() => {
    if (!editor || loadedBaseline.current !== null) return;
    loadedBaseline.current = editor.action(getMarkdown());
  }, [editor]);

  // Content changed elsewhere (version restore, template, file reload): show it
  useEffect(() => {
    if (!editor || content === knownMarkdown.current) return;
    knownMarkdown.current = content;
    applyingExternal.current = true;
    try {
      editor.action(replaceAll(content));
      loadedBaseline.current = editor.action(getMarkdown());
      loadedSource.current = content;
    } finally {
      applyingExternal.current = false;
    }
  }, [content, editor]);

  const applyLink = (url: string, text: string) => {
    const request = linkRequest;
    setLinkRequest(null);
    if (editor && request && url) applyRichLink(editor, request, url, text);
  };

  // Expose commands to the shared toolbar, once per editor: a new object on every
  // render would make the Find bar re-run (and re-select its input) on every keystroke
  useEffect(() => {
    if (!editor) return;
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    onCommands({
      run: (action) => runRichAction(editor, action, setLinkRequest),
      search: prosemirrorSearchEngine(view),
      insert: (markdown) => insertRichSnippet(editor, markdown),
    });

    return () => onCommands(null);
  }, [editor, onCommands]);

  // Dropped or pasted images are stored beside the document, then inserted as Markdown
  const imageDrop = useImageDrop({
    onInsert: (markdown) => editor?.action(insert(markdown, true)),
  });
  const hasImageFiles = (items: DataTransferItemList) =>
    Array.from(items).some((item) => item.kind === 'file' && item.type.startsWith('image/'));

  // Ctrl+K opens the link dialog (Milkdown has no binding for it)
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!editor) return;

    if (matchesCombo(event.nativeEvent, SHORTCUTS.link.combo)) {
      event.preventDefault();
      runRichAction(editor, 'link', setLinkRequest);
    } else if (matchesCombo(event.nativeEvent, SHORTCUTS.taskList.combo)) {
      event.preventDefault();
      runRichAction(editor, 'checkbox', setLinkRequest);
    }
  };

  // Ctrl/Cmd+click follows links; a plain click just places the cursor
  useDocumentLinks(containerRef, content, { requireModifier: true, resolveImages: false });

  const isBlank = !hasPath && content === '';

  return (
    <div className="h-full flex flex-col">
    <div
      ref={containerRef}
      data-doc-surface
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
          <div className="pointer-events-none absolute inset-x-8 top-10 mx-auto max-w-[72ch]">
            <p className="font-editor text-lg text-text-muted">Start writing…</p>
            <StartPanel
              className="pointer-events-auto mt-16"
              writeHint="Type here and format with the toolbar or shortcuts. It is saved as plain Markdown."
            />
          </div>
        )}
      </div>

      <LinkDialog request={linkRequest} onCancel={() => setLinkRequest(null)} onSubmit={applyLink} />
    </div>
    </div>
  );
}

function LinkDialog({
  request,
  onCancel,
  onSubmit,
}: {
  request: LinkRequest | null;
  onCancel: () => void;
  onSubmit: (url: string, text: string) => void;
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

/** Rich-text editing over the same Markdown the source view edits. Remounts per tab. */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownSurface {...props} />
    </MilkdownProvider>
  );
}
