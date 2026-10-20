import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { search, highlightSelectionMatches } from '@codemirror/search';
import { AnimatePresence, m } from 'framer-motion';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { MarkdownPreview } from './MarkdownPreview';
import { StartPanel } from './StartPanel';
import { codemirrorSearchEngine, findHighlights } from '@/features/find-replace';
import { useImageDrop } from '@/features/image-drop';
import { useSyncScroll } from '@/features/sync-scroll';
import { markloomEditorTheme, markloomHighlight } from '../codemirror/theme';
import { markdownKeymap, runMarkdownAction, insertSnippet } from '../codemirror/commands';
import { diagramErrorLines, diagramErrorTheme, setDiagramErrorLines } from '../codemirror/diagramErrors';
import type { EditorCommands, FormatState } from '../types';
import { formatStateReporter } from '../codemirror/formatState';
import { codeSpellcheck } from '../codemirror/codeSpellcheck';

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

export function SplitViewEditor({ onCommands, onFormatState }: SplitViewEditorProps) {
  const { content, setContent, activeFilePath } = useAppStore();
  const { splitRatio, setSplitRatio, editor: editorSettings } = useSettingsStore();
  const [view, setView] = useState<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isBlank = !activeFilePath && content === '';

  const extensions = useMemo(
    () => [
      markdown(),
      markloomEditorTheme,
      markloomHighlight,
      markdownKeymap,
      search(),
      highlightSelectionMatches(),
      sourceAttributes,
      diagramErrorLines,
      codeSpellcheck,
      findHighlights,
      diagramErrorTheme,
      formatStateReporter(onFormatState),
      ...(editorSettings.wordWrap ? [EditorView.lineWrapping] : []),
    ],
    [editorSettings.wordWrap, onFormatState]
  );

  // Expose formatting commands to the shared toolbar
  useEffect(() => {
    if (!view) return;
    onCommands({
      run: (action) => runMarkdownAction(view, action),
      search: codemirrorSearchEngine(view),
      insert: (text) => insertSnippet(view, text),
    });
    return () => onCommands(null);
  }, [view, onCommands]);

  // New file in this tab: start at the very top (scrollIntoView would skip the top padding,
  // and scroll sync would then carry that offset into the preview)
  useEffect(() => {
    if (view) view.scrollDOM.scrollTop = 0;
    if (previewRef.current) previewRef.current.scrollTop = 0;
  }, [activeFilePath, view]);

  useSyncScroll({ editorView: view, previewRef, content, previewReady: !isBlank });

  // Outline panel asks to jump to a line
  useEffect(() => {
    if (!view) return;
    const handleNavigate = (event: Event) => {
      const { line } = (event as CustomEvent<{ line: number }>).detail;
      const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
      // Land after the indentation, where typing actually fixes the line
      const anchor = target.from + (target.text.match(/^\s*/)?.[0].length ?? 0);
      view.dispatch({
        selection: { anchor },
        effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 24 }),
      });
      view.focus();
    };
    window.addEventListener('outline-navigate', handleNavigate);
    return () => window.removeEventListener('outline-navigate', handleNavigate);
  }, [view]);

  // The preview reports diagrams that failed to parse; mark those lines here
  useEffect(() => {
    if (!view) return;
    const handleErrors = (event: Event) => {
      const { lines } = (event as CustomEvent<{ lines: number[] }>).detail;
      view.dispatch({ effects: setDiagramErrorLines.of(lines) });
    };
    window.addEventListener('diagram-errors', handleErrors);
    return () => window.removeEventListener('diagram-errors', handleErrors);
  }, [view]);

  const ratioFromPointer = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setSplitRatio(((clientX - rect.left) / rect.width) * 100);
    },
    [setSplitRatio]
  );

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const move = (ev: PointerEvent) => ratioFromPointer(ev.clientX);
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    },
    [ratioFromPointer]
  );

  const handleResizeKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setSplitRatio(splitRatio - step);
    else if (e.key === 'ArrowRight') setSplitRatio(splitRatio + step);
    else if (e.key === 'Home') setSplitRatio(25);
    else if (e.key === 'End') setSplitRatio(75);
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
          style={{ width: `${splitRatio}%` }}
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
            basicSetup={{
              lineNumbers: editorSettings.lineNumbers,
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
            }}
          />
        </div>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize source and preview"
          aria-valuenow={Math.round(splitRatio)}
          aria-valuemin={25}
          aria-valuemax={75}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKey}
          onDoubleClick={() => setSplitRatio(50)}
          className={cn(
            'relative w-px flex-shrink-0 bg-rule cursor-col-resize outline-none',
            'before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[""]',
            'hover:bg-accent-primary focus-visible:bg-accent-primary transition-colors'
          )}
        />

        {/* Preview pane */}
        <div className="h-full overflow-hidden bg-canvas" style={{ width: `${100 - splitRatio}%` }}>
          {isBlank ? (
            <div className="h-full overflow-auto flex items-center justify-center p-8 bg-panel">
              <StartPanel writeHint="Type Markdown in the left pane; the formatted document appears here as you write." />
            </div>
          ) : (
            <MarkdownPreview content={content} ref={previewRef} />
          )}
        </div>
      </div>
    </div>
  );
}
