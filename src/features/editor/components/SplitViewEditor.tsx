import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { highlightSelectionMatches } from '@codemirror/search';
import { AnimatePresence, m } from 'framer-motion';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResizeDrag } from '@/lib/useResizeDrag';
import { useActiveContent, useActivePath, useSetActiveContent, useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { MarkdownPreview } from './MarkdownPreview';
import { StartPanel } from './StartPanel';
import { codemirrorSearchEngine, findHighlights } from '@/features/find-replace';
import { useImageDrop } from '@/features/image-drop';
import { useSyncScroll } from '@/features/sync-scroll';
import { markloomEditorTheme, markloomHighlight } from '../codemirror/theme';
import { markdownKeymap, editingKeymap, runMarkdownAction, insertSnippet, revealLine, placeCursor } from '../codemirror/commands';
import { diagramErrorLines, diagramErrorTheme, setDiagramErrorLines } from '../codemirror/diagramErrors';
import type { EditorCommands, FormatState } from '../types';
import { formatStateReporter, selectionReporter } from '../codemirror/formatState';
import { setSelectedText } from '@/features/word-count';
import { codeSpellcheck } from '../codemirror/codeSpellcheck';

const MIN_SPLIT = 25;

const MAX_SPLIT = 75;

interface SplitViewEditorProps {
  onCommands: (commands: EditorCommands | null) => void;
  onFormatState: (state: FormatState) => void;
}

// The platform spell checker underlines mistakes (English, Greek, whatever the OS has)
const sourceAttributes = EditorView.contentAttributes.of({
  'aria-label': 'Markdown source',
  'aria-describedby': 'editor-tab-hint',
  spellcheck: 'true',
  autocorrect: 'off',
  autocapitalize: 'off',
});

// Kept stable: @uiw/react-codemirror reconfigures the whole editor whenever this object changes
const basicSetupFor = (lineNumbers: boolean) => ({
  lineNumbers,
  highlightActiveLineGutter: true,
  highlightActiveLine: true,
  foldGutter: false,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  bracketMatching: true,
  closeBrackets: false,
  autocompletion: false,
  rectangularSelection: true,
  crosshairCursor: false,
  highlightSelectionMatches: false,
  searchKeymap: false,
  // editingKeymap stands in for it, without the Mod-/ comment toggle (Keyboard shortcuts)
  defaultKeymap: false,
  // Its Mod-Shift-m (lint panel) would swallow the Markdown / Rich text toggle
  lintKeymap: false,
});

export function SplitViewEditor({ onCommands, onFormatState }: SplitViewEditorProps) {
  const content = useActiveContent();
  const setContent = useSetActiveContent();
  const activeFilePath = useActivePath();
  const splitRatio = useSettingsStore((s) => s.splitRatio);
  const setSplitRatio = useSettingsStore((s) => s.setSplitRatio);
  const wordWrap = useSettingsStore((s) => s.editor.wordWrap);
  const lineNumbers = useSettingsStore((s) => s.editor.lineNumbers);
  const basicSetup = useMemo(() => basicSetupFor(lineNumbers), [lineNumbers]);
  const [view, setView] = useState<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLElement>(null);

  const isBlank = !activeFilePath && content === '';

  const extensions = useMemo(
    () => [
      markdown(),
      markloomEditorTheme,
      markloomHighlight,
      markdownKeymap,
      editingKeymap,
      highlightSelectionMatches(),
      sourceAttributes,
      diagramErrorLines,
      codeSpellcheck,
      findHighlights,
      diagramErrorTheme,
      formatStateReporter(onFormatState),
      selectionReporter(setSelectedText),
      ...(wordWrap ? [EditorView.lineWrapping] : []),
    ],
    [wordWrap, onFormatState]
  );

  // A selection in this editor means nothing once it is gone (mode or tab switch)
  useEffect(() => () => setSelectedText(''), []);

  // Expose formatting commands to the shared toolbar
  useEffect(() => {
    if (!view) return;
    onCommands({
      run: (action) => runMarkdownAction(view, action),
      search: codemirrorSearchEngine(view),
      insert: (text) => insertSnippet(view, text),
      focus: () => view.focus(),
      // CodeMirror's onChange already wrote every edit
      flush: () => {},
    });

    return () => onCommands(null);
  }, [view, onCommands]);

  useSyncScroll({ editorView: view, previewRef, previewContentRef, previewReady: !isBlank });

  // The preview's "Show line N" goes through the same request as Export's "Show"
  const showLine = useCallback((line: number) => {
    const { activeTabId } = useTabsStore.getState();

    if (activeTabId) useUiStore.getState().navigateToLine(activeTabId, line);
  }, []);

  // Stable per view, because the preview re-renders its diagrams whenever this changes
  const markDiagramErrors = useCallback(
    (lines: number[]) => {
      view?.dispatch({ effects: setDiagramErrorLines.of(lines) });
    },
    [view]
  );

  // A requested line is revealed once this editor shows its tab; a request for any other
  // tab is stale (the document it was meant for is not here) and is dropped
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const lineRequest = useUiStore((s) => s.lineRequest);
  useEffect(() => {
    if (!view || lineRequest === null) return;

    if (lineRequest.tabId === activeTabId) {
      if (lineRequest.kind === 'reveal') revealLine(view, lineRequest.line);
      else placeCursor(view, lineRequest.line);
    }

    useUiStore.getState().clearLineRequest();
  }, [view, lineRequest, activeTabId]);

  const split = useResizeDrag({
    stored: splitRatio,
    min: MIN_SPLIT,
    max: MAX_SPLIT,
    anchorRef: containerRef,
    toValue: (x, rect) => ((x - rect.left) / rect.width) * 100,
    commit: setSplitRatio,
  });

  const handleResizeKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;

    if (e.key === 'ArrowLeft') setSplitRatio(splitRatio - step);
    else if (e.key === 'ArrowRight') setSplitRatio(splitRatio + step);
    else if (e.key === 'Home') setSplitRatio(MIN_SPLIT);
    else if (e.key === 'End') setSplitRatio(MAX_SPLIT);
    else return;
    e.preventDefault();
  };

  const { isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handlePaste } = useImageDrop({
    onInsert: (imageMarkdown) => {
      if (view) insertSnippet(view, imageMarkdown);
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Tab indents inside the editor; tell keyboard users how to move on */}
      <p id="editor-tab-hint" className="sr-only">
        Tab inserts indentation. To move focus out of the editor, press Escape, then Tab.
      </p>

      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Source pane */}
        <div
          className="h-full overflow-hidden bg-canvas relative"
          style={{ width: `${split.value}%` }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          <AnimatePresence>
            {isDragging && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'absolute inset-2 z-50 flex items-center justify-center rounded-lg',
                  'bg-accent-muted/80 border-2 border-dashed border-accent-primary'
                )}
              >
                <div className="flex flex-col items-center gap-2 text-accent-hover">
                  <ImagePlus className="w-10 h-10" />
                  <span className="text-base font-medium">Drop to insert image</span>
                  <span className="text-sm text-text-secondary">PNG, JPG, GIF, WebP or SVG</span>
                </div>
              </m.div>
            )}
          </AnimatePresence>
          <CodeMirror
            value={content}
            onChange={setContent}
            onCreateEditor={setView}
            extensions={extensions}
            theme="light"
            autoFocus={isBlank}
            placeholder="Start writing in Markdown…"
            className="h-full"
            basicSetup={basicSetup}
          />
        </div>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize source and preview"
          aria-valuenow={Math.round(split.value)}
          aria-valuemin={MIN_SPLIT}
          aria-valuemax={MAX_SPLIT}
          tabIndex={0}
          onPointerDown={split.onPointerDown}
          onKeyDown={handleResizeKey}
          onDoubleClick={() => setSplitRatio(50)}
          className={cn(
            'relative w-px flex-shrink-0 bg-rule cursor-col-resize outline-none touch-none',
            'before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[""]',
            'hover:bg-accent-primary focus-visible:bg-accent-primary transition-colors'
          )}
        />

        {/* Preview pane */}
        <div className="h-full overflow-hidden bg-canvas" style={{ width: `${100 - split.value}%` }}>
          {isBlank ? (
            <div className="h-full overflow-auto flex items-center justify-center p-8 bg-panel">
              <StartPanel writeHint="Type Markdown in the left pane; the formatted document appears here as you write." />
            </div>
          ) : (
            <MarkdownPreview
              content={content}
              surfaceRef={previewRef}
              contentRef={previewContentRef}
              onShowLine={showLine}
              onDiagramErrors={markDiagramErrors}
            />
          )}
        </div>
      </div>
    </div>
  );
}
