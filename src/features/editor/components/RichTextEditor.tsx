import { useCallback, useEffect, useRef, useState } from 'react';
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
  inlineCodeKeymap,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { $prose, callCommand, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { useTabsStore } from '@/features/tabs';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { SHORTCUTS, matchesCombo } from '@/lib/shortcuts';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { useImageDrop } from '@/features/image-drop';
import { codeBlockView, diagramErrorMarks, htmlView, imageSchemaFix, imageView, inlineCodeSpellcheck, taskToggle } from '../milkdown/plugins';
import { prosemirrorSearchEngine, searchPlugin } from '../milkdown/search';
import { preserveUnchangedBlocks } from '../milkdown/preserve';
import { StartPanel } from './StartPanel';
import { EMPTY_FORMAT_STATE, sameFormatState, type EditorCommands, type FormatState, type MarkdownAction } from '../types';
import { richFormatState } from '../milkdown/formatState';

interface RichTextEditorProps {
  tabId: string;
  onCommands: (commands: EditorCommands | null) => void;
  onFormatState: (state: FormatState) => void;
}

type LinkRequest = { kind: 'link' | 'image'; hasSelection: boolean } | null;

function MilkdownSurface({ tabId, onCommands, onFormatState }: RichTextEditorProps) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === tabId));
  const content = tab?.content ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  // Markdown we last handed to (or received from) the editor; anything else is an outside change
  const knownMarkdown = useRef(content);
  const applyingExternal = useRef(false);
  // How the editor serializes the document as loaded. Milkdown normalizes Markdown
  // (table padding, escapes), so an update equal to this is not a user edit.
  const loadedBaseline = useRef<string | null>(null);
  // The exact source text that baseline came from
  const loadedSource = useRef(content);
  const [linkRequest, setLinkRequest] = useState<LinkRequest>(null);
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
          // Tell the toolbar what applies at the cursor
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
                },
              }),
            });
          })
        ),
    [tabId]
  );

  // Remember the normalized form of what was loaded, so viewing alone never edits the file
  useEffect(() => {
    const editor = get();
    if (loading || !editor || loadedBaseline.current !== null) return;
    loadedBaseline.current = editor.action(getMarkdown());
  }, [get, loading]);

  // Content changed elsewhere (version restore, template, file reload): show it
  useEffect(() => {
    const editor = get();
    if (loading || !editor || content === knownMarkdown.current) return;
    knownMarkdown.current = content;
    applyingExternal.current = true;
    try {
      editor.action(replaceAll(content));
      loadedBaseline.current = editor.action(getMarkdown());
      loadedSource.current = content;
    } finally {
      applyingExternal.current = false;
    }
  }, [content, get, loading]);

  const runCommand = useCallback(
    (action: MarkdownAction) => {
      const editor = get();
      if (!editor) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (key: any, payload?: unknown) => editor.action(callCommand(key, payload));

      switch (action) {
        case 'bold': call(toggleStrongCommand.key); break;
        case 'italic': call(toggleEmphasisCommand.key); break;
        case 'strikethrough': call(toggleStrikethroughCommand.key); break;
        case 'code': call(toggleInlineCodeCommand.key); break;
        case 'paragraph': call(wrapInHeadingCommand.key, 0); break;
        case 'h1': call(wrapInHeadingCommand.key, 1); break;
        case 'h2': call(wrapInHeadingCommand.key, 2); break;
        case 'h3': call(wrapInHeadingCommand.key, 3); break;
        case 'ul': call(wrapInBulletListCommand.key); break;
        case 'ol': call(wrapInOrderedListCommand.key); break;
        case 'quote': call(wrapInBlockquoteCommand.key); break;
        case 'hr': call(insertHrCommand.key); break;
        case 'codeblock': call(createCodeBlockCommand.key); break;
        case 'table': call(insertTableCommand.key, { row: 3, col: 3 }); break;
        case 'checkbox':
          editor.action(insert('- [ ] '));
          break;
        case 'link':
        case 'image': {
          const view = editor.action((ctx) => ctx.get(editorViewCtx));
          setLinkRequest({ kind: action, hasSelection: !view.state.selection.empty });
          return;
        }
      }
      editor.action((ctx) => ctx.get(editorViewCtx).focus());
    },
    [get]
  );

  const applyLink = (url: string, text: string) => {
    const editor = get();
    const request = linkRequest;
    setLinkRequest(null);
    if (!editor || !request || !url) return;
    editor.action((ctx) => ctx.get(editorViewCtx).focus());
    if (request.kind === 'image') {
      editor.action(callCommand(insertImageCommand.key, { src: url, alt: text }));
    } else if (request.hasSelection) {
      editor.action(callCommand(toggleLinkCommand.key, { href: url }));
    } else {
      const label = (text || url).replace(/[[\]]/g, '');
      editor.action(insert(`[${label}](${url})`, true));
    }
  };

  // Expose commands to the shared toolbar. Built once per editor: `get` and the command
  // callbacks change identity on re-render, and a new object each time would make the
  // Find bar re-run (and re-select its input) on every keystroke.
  const getRef = useRef(get);
  getRef.current = get;
  const runRef = useRef(runCommand);
  runRef.current = runCommand;
  useEffect(() => {
    if (loading) return;
    const view = getRef.current()?.action((ctx) => ctx.get(editorViewCtx));
    if (!view) return;
    onCommands({
      run: (action) => runRef.current(action),
      search: prosemirrorSearchEngine(view),
      insert: (markdown) => {
        const editor = getRef.current();
        if (!editor) return;
        editor.action(insert(`\n${markdown.trim()}\n`));
        editor.action((ctx) => ctx.get(editorViewCtx).focus());
      },
    });
    return () => onCommands(null);
  }, [loading, onCommands]);

  // Dropped or pasted images are stored beside the document, then inserted as Markdown
  const imageDrop = useImageDrop({
    onInsert: (markdown) => get()?.action(insert(markdown, true)),
  });
  const hasImageFiles = (items: DataTransferItemList) =>
    Array.from(items).some((item) => item.kind === 'file' && item.type.startsWith('image/'));

  // Ctrl+K opens the link dialog (Milkdown has no binding for it)
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (matchesCombo(event.nativeEvent, SHORTCUTS.link.combo)) {
      event.preventDefault();
      runCommand('link');
    } else if (matchesCombo(event.nativeEvent, SHORTCUTS.taskList.combo)) {
      event.preventDefault();
      runCommand('checkbox');
    }
  };

  // Ctrl/Cmd+click follows links; a plain click just places the cursor
  useDocumentLinks(containerRef, content, { requireModifier: true, resolveImages: false });

  // Outline panel: jump to the nth heading with matching text
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const { text } = (event as CustomEvent<{ line: number; text?: string }>).detail;
      const headings = containerRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      const target = Array.from(headings ?? []).find((h) => h.textContent?.trim() === text?.trim());
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('outline-navigate', handleNavigate);
    return () => window.removeEventListener('outline-navigate', handleNavigate);
  }, []);

  const isBlank = !tab?.path && content === '';

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
  request: LinkRequest;
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
