import { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectActiveTab, useTabsStore } from '@/features/tabs';
import { FindReplaceBar } from '@/features/find-replace';
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

export function EditorContainer() {
  const editorMode = useAppStore((s) => s.editorMode);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activePath = useTabsStore((s) => selectActiveTab(s)?.path ?? null);
  const loadId = useTabsStore((s) => selectActiveTab(s)?.loadId);
  const [commands, setCommands] = useState<EditorCommands | null>(null);

  const handleCommands = useCallback((next: EditorCommands | null) => {
    setCommands(() => next);
    useUiStore.getState().setEditorCommands(next);
  }, []);

  const [formatState, setFormatState] = useState<FormatState>(EMPTY_FORMAT_STATE);

  if (!activeTabId) return null;

  // .mmd files get the dedicated diagram editor
  if (activePath && isMermaidFile(activePath)) {
    return (
      <div className="h-full bg-canvas">
        <MermaidEditor key={loadId} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-canvas">
      <EditorToolbar
        commands={commands}
        active={formatState}
        trailing={
          <div className="flex items-center gap-2 pl-2">
            {editorMode === 'split' && <SyncScrollToggle />}
            <ModeToggle />
          </div>
        }
      />

      <FindReplaceBar engine={commands?.search ?? null} />

      {/* Each loaded document gets its own editor instance, so undo history never crosses documents */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
        {editorMode === 'split' ? (
          <SplitViewEditor key={loadId} onCommands={handleCommands} onFormatState={setFormatState} />
        ) : (
          <Suspense fallback={<div className="h-full bg-canvas" />}>
            <RichTextEditor key={loadId} tabId={activeTabId} onCommands={handleCommands} onFormatState={setFormatState} />
          </Suspense>
        )}
        </div>
      </div>
    </div>
  );
}
