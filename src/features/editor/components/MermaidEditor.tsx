import { useRef, useCallback, useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { GripVertical, AlertCircle, RefreshCw, ZoomIn, ZoomOut, RotateCcw, Maximize2, Columns } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { markloomEditorTheme, markloomHighlight } from '../codemirror/theme';
import { usePreservedEditorState } from '../codemirror/documentStates';
import { useActiveContent, useSetActiveContent } from '@/features/tabs';
import { MermaidRenderer } from '@/features/mermaid/components/MermaidRenderer';
import { forgetDiagram } from '@/features/mermaid/utils/mermaidConfig';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';

// Stable references: @uiw/react-codemirror reconfigures the editor whenever these change
const sourceExtensions = [markloomEditorTheme, markloomHighlight, EditorView.lineWrapping];

const basicSetup = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  highlightActiveLine: true,
  foldGutter: false,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: false,
  rectangularSelection: true,
  crosshairCursor: false,
  highlightSelectionMatches: true,
  lintKeymap: false,
};

interface MermaidSourceProps {
  content: string;
  onChange: (value: string) => void;
}

// Its own component so each mount (tab switch, or back from "Diagram only") reopens with the
// state the source had when it was last shown, undo history included
function MermaidSource({ content, onChange }: MermaidSourceProps) {
  const [view, setView] = useState<EditorView | null>(null);
  const initialState = usePreservedEditorState(content, view);

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      onCreateEditor={setView}
      initialState={initialState}
      height="100%"
      theme="light"
      extensions={sourceExtensions}
      basicSetup={basicSetup}
      className="h-full"
    />
  );
}

export function MermaidEditor() {
  const content = useActiveContent();
  const setContent = useSetActiveContent();

  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [debouncedContent, setDebouncedContent] = useState(content);
  const [renderKey, setRenderKey] = useState(0);
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split');
  const [zoom, setZoom] = useState(100);

  // Update debounced content with delay for live preview
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(content);
    }, 300);

    return () => clearTimeout(timer);
  }, [content]);

  // Results are cached (errors too), so drop this one or the remount gets it back unchanged
  const handleRefresh = useCallback(() => {
    forgetDiagram(debouncedContent, 'preview');
    setRenderKey((k) => k + 1);
  }, [debouncedContent]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 25, 25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  // View mode toggle
  const toggleViewMode = useCallback(() => {
    setViewMode((mode) => (mode === 'split' ? 'preview' : 'split'));
  }, []);

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
    },
    [setContent]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      setSplitPosition(Math.min(Math.max(percentage, 20), 80));
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <m.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex bg-canvas"
    >
      {/* Code Editor Panel */}
      {viewMode === 'split' && (
        <div
          className="h-full overflow-hidden border-r border-rule/30"
          style={{ width: `${splitPosition}%` }}
        >
        <div className="h-full flex flex-col">
          <div className="px-4 py-2 border-b border-rule/30 bg-panel/50">
            <span className="text-sm text-text-muted font-medium">Mermaid source</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <MermaidSource content={content} onChange={handleContentChange} />
          </div>
        </div>
      </div>
      )}

      {/* Resizer */}
      {viewMode === 'split' && (
        <div
          className={cn(
            'w-1 flex items-center justify-center cursor-col-resize group transition-colors',
            isDragging ? 'bg-accent-primary' : 'bg-rule/30 hover:bg-accent-primary/50'
          )}
          onMouseDown={handleMouseDown}
        >
          <GripVertical
            className={cn(
              'w-4 h-4 transition-colors',
              isDragging ? 'text-white' : 'text-text-muted group-hover:text-accent-primary'
            )}
          />
        </div>
      )}

      {/* Preview Panel */}
      <div
        className="h-full overflow-hidden"
        style={{ width: viewMode === 'preview' ? '100%' : `${100 - splitPosition}%` }}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-2 border-b border-rule/30 bg-panel/50 flex items-center justify-between">
            <span className="text-sm text-text-muted font-medium">Diagram preview</span>
            <div className="flex items-center gap-1">
              {/* Zoom controls */}
              <Tooltip content="Zoom out">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 25}
                  className="p-1 rounded hover:bg-rule/30 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </Tooltip>
              <span className="text-xs text-text-muted w-10 text-center">{zoom}%</span>
              <Tooltip content="Zoom in">
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className="p-1 rounded hover:bg-rule/30 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="Reset zoom">
                <button
                  onClick={handleResetZoom}
                  className="p-1 rounded hover:bg-rule/30 text-text-muted hover:text-text-primary transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </Tooltip>

              <div className="w-px h-4 bg-rule/30 mx-1" />

              {/* View mode toggle */}
              <Tooltip content={viewMode === 'split' ? 'Diagram only' : 'Split view'}>
                <button
                  onClick={toggleViewMode}
                  className="p-1 rounded hover:bg-rule/30 text-text-muted hover:text-text-primary transition-colors"
                >
                  {viewMode === 'split' ? <Maximize2 className="w-4 h-4" /> : <Columns className="w-4 h-4" />}
                </button>
              </Tooltip>

              <div className="w-px h-4 bg-rule/30 mx-1" />

              {/* Refresh */}
              <Tooltip content="Refresh diagram">
                <button
                  onClick={handleRefresh}
                  className="p-1 rounded hover:bg-rule/30 text-text-muted hover:text-text-primary transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-panel/30">
            {debouncedContent.trim() ? (
              <div className="flex items-center justify-center min-h-full">
                <div
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s ease-out',
                  }}
                >
                  <MermaidRenderer
                    key={renderKey}
                    code={debouncedContent}
                    className="max-w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Enter Mermaid diagram code to see the preview</p>
                  <p className="text-xs mt-2 opacity-70">
                    Example: graph TD; A--&gt;B
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </m.div>
  );
}
