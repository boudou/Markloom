import { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowDownUp, MoveHorizontal } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { PAGE_WIDTHS, useSettingsStore } from '@/stores/settingsStore';
import { selectActiveTab, useTabsStore } from '@/features/tabs';
import { FindReplaceBar, IDLE_SEARCH_ENGINE } from '@/features/find-replace';
import { useUiStore } from '@/stores/uiStore';
import { IconButton, Tooltip } from '@/components/ui';
import { SplitViewEditor } from './SplitViewEditor';
import { MermaidEditor } from './MermaidEditor';
import { EditorToolbar } from './EditorToolbar';
import { ModeToggle } from './ModeToggle';
import { isMermaidFile } from '@/lib/utils';
import { EMPTY_FORMAT_STATE, type EditorCommands, type FormatState } from '../types';

// Milkdown is sizeable; load it only when someone switches to Rich text
const RichTextEditor = lazy(() => import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor })));

function SyncScrollToggle() {
  const syncScroll = useSettingsStore((s) => s.syncScroll);
  const setSyncScroll = useSettingsStore((s) => s.setSyncScroll);

  return (
    <Tooltip content={syncScroll ? 'Scroll panes together: on' : 'Scroll panes together: off'}>
      <IconButton variant="ghost" size="sm" pressed={syncScroll} onClick={() => setSyncScroll(!syncScroll)}>
        <ArrowDownUp className="w-4 h-4" />
      </IconButton>
    </Tooltip>
  );
}

/** Cycles Readable, Wide, Full; an unknown stored value shows as Readable */
function PageWidthToggle() {
  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const setPageWidth = useSettingsStore((s) => s.setPageWidth);
  const index = Math.max(0, PAGE_WIDTHS.findIndex((w) => w.value === pageWidth));
  const current = PAGE_WIDTHS[index];
  const next = PAGE_WIDTHS[(index + 1) % PAGE_WIDTHS.length];

  return (
    <Tooltip content={`Page width: ${current.label} (click for ${next.label})`}>
      <IconButton variant="ghost" size="sm" className="w-auto px-1.5 gap-1" onClick={() => setPageWidth(next.value)}>
        <MoveHorizontal className="w-4 h-4" />
        <span className="hidden lg:inline text-xs font-medium">{current.label}</span>
      </IconButton>
    </Tooltip>
  );
}

export function EditorContainer() {
  const editorMode = useAppStore((s) => s.editorMode);
  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activePath = useTabsStore((s) => selectActiveTab(s)?.path ?? null);
  const loadId = useTabsStore((s) => selectActiveTab(s)?.loadId);
  const [commands, setCommands] = useState<EditorCommands | null>(null);

  const handleCommands = useCallback((next: EditorCommands | null) => {
    setCommands(() => next);
    useUiStore.getState().setEditorCommands(next);
  }, []);

  const [formatState, setFormatState] = useState<FormatState>(EMPTY_FORMAT_STATE);

  // The document the Rich text editor last showed. It stays mounted, hidden, while that
  // document is open in Markdown mode; another document in Markdown mode drops it.
  const [richLoadId, setRichLoadId] = useState<string | undefined>(undefined);

  const nextRichLoadId = editorMode === 'wysiwyg' || richLoadId === loadId ? loadId : undefined;

  if (nextRichLoadId !== richLoadId) setRichLoadId(nextRichLoadId);

  if (!activeTabId) return null;

  // .mmd files get the dedicated diagram editor
  if (activePath && isMermaidFile(activePath)) {
    return (
      <div className="h-full bg-canvas">
        <MermaidEditor key={loadId} />
      </div>
    );
  }

  const showRich = editorMode === 'wysiwyg';
  const keepRich = showRich || (loadId !== undefined && richLoadId === loadId);

  return (
    <div className="h-full flex flex-col bg-canvas" data-page-width={pageWidth}>
      <EditorToolbar
        commands={commands}
        active={formatState}
        trailing={
          <div className="flex items-center gap-2 pl-2">
            {editorMode === 'split' && <SyncScrollToggle />}
            <PageWidthToggle />
            <ModeToggle />
          </div>
        }
      />

      <FindReplaceBar engine={commands?.search ?? IDLE_SEARCH_ENGINE} />

      {/* One editor instance per loaded document and mode, so undo history never crosses
          documents. Rich text stays mounted while hidden, so its history survives a mode switch. */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
        {editorMode === 'split' && (
          <SplitViewEditor key={loadId} onCommands={handleCommands} onFormatState={setFormatState} />
        )}
        {keepRich && (
          <div className={showRich ? 'h-full' : 'hidden'}>
            <Suspense fallback={<div className="h-full bg-canvas" />}>
              <RichTextEditor
                key={loadId}
                tabId={activeTabId}
                active={showRich}
                onCommands={handleCommands}
                onFormatState={setFormatState}
              />
            </Suspense>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
