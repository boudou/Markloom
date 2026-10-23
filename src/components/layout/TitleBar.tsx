import { FileText, FolderOpen, Save, FileDown, ClipboardCopy, LayoutTemplate, Keyboard, PanelLeft, ListTree, Search, Settings } from 'lucide-react';
import { IconButton, Kbd, Tooltip } from '@/components/ui';
import { RecentFilesMenu } from '@/features/recent-files';
import { HistoryPanel } from '@/features/version-history';
import { selectActiveContent, selectActiveTab, useTabsStore } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';
import { appCommand, commandHint, useOffered } from '@/lib/appCommands';
import { cn } from '@/lib/utils';
import { MarkloomMark } from './MarkloomMark';
import { useRef } from 'react';
import { useRovingToolbar } from '@/lib/useRovingToolbar';

const desktop = window.markloomDesktop;

const isMacDesktop = desktop?.platform === 'darwin';

const FILES = appCommand('files');

const OPEN = appCommand('open');

const OPEN_FOLDER = appCommand('open-folder');

const SAVE = appCommand('save');

const EXPORT = appCommand('export');

const COPY_RICH = appCommand('copy-rich');

const TEMPLATES = appCommand('templates');

const OUTLINE = appCommand('outline');

const SHORTCUTS_WINDOW = appCommand('shortcuts');

const PALETTE = appCommand('palette');

const SETTINGS = appCommand('settings');

function Separator() {
  return <div className="w-px h-4 bg-rule mx-1" aria-hidden />;
}

/**
 * App chrome in one row: file actions, the current document, and panels.
 * On desktop it is also the window's drag handle.
 */
export function TitleBar() {
  // Primitives only: the tab object itself changes on every keystroke
  const hasContent = useTabsStore((s) => /\S/.test(selectActiveContent(s)));
  const isDirty = useTabsStore((s) => !!selectActiveTab(s)?.isDirty);
  const docName = useTabsStore((s) => selectActiveTab(s)?.name ?? '');
  const docPath = useTabsStore((s) => selectActiveTab(s)?.path ?? null);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarView = useAppStore((s) => s.sidebarView);
  const rootPath = useAppStore((s) => s.rootPath);
  // The palette's own condition: a .mmd file has no editor commands, so no rich-text copy
  const copyOffered = useOffered(COPY_RICH);
  const filesVisible = sidebarOpen && sidebarView === 'files' && !!rootPath;
  const outlineOpen = sidebarOpen && sidebarView === 'outline';

  const barRef = useRef<HTMLElement>(null);
  useRovingToolbar(barRef);


  return (
    <header
      ref={barRef}
      role="toolbar"
      aria-label="Document actions"
      className={cn(
        'h-11 flex items-center gap-1 px-2 flex-shrink-0',
        'bg-panel border-b border-rule select-none',
        desktop && 'app-drag-region',
        isMacDesktop && 'pl-20',
        desktop && !isMacDesktop && 'pr-36'
      )}
    >
      {/* Left: brand + file actions */}
      <div className="flex items-center gap-0.5 min-w-0">
        <Tooltip
          content={rootPath ? commandHint(FILES) : 'Open a folder to browse its files'}
        >
          <IconButton
            variant="ghost"
            size="sm"
            pressed={filesVisible}
            onClick={() => (rootPath ? FILES.run() : OPEN_FOLDER.run())}
          >
            <PanelLeft className="w-4 h-4" />
          </IconButton>
        </Tooltip>

        <div className="flex items-center gap-1.5 px-2">
          <MarkloomMark className="w-5 h-5" />
          <span className="font-display text-sm font-semibold text-text-primary">Markloom</span>
        </div>

        <Separator />
        <Tooltip content={commandHint(OPEN)}>
          <IconButton variant="ghost" size="sm" onClick={() => OPEN.run()}>
            <FileText className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content={commandHint(OPEN_FOLDER)}>
          <IconButton variant="ghost" size="sm" onClick={() => OPEN_FOLDER.run()}>
            <FolderOpen className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <RecentFilesMenu />
        <Tooltip content={commandHint(SAVE)}>
          <IconButton variant="ghost" size="sm" onClick={() => SAVE.run()} disabled={!hasContent && !isDirty}>
            <Save className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Separator />
        <Tooltip content={commandHint(EXPORT)}>
          <IconButton variant="ghost" size="sm" onClick={() => EXPORT.run()} disabled={!hasContent}>
            <FileDown className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content={commandHint(COPY_RICH)}>
          <IconButton variant="ghost" size="sm" onClick={() => COPY_RICH.run()} disabled={!hasContent || !copyOffered}>
            <ClipboardCopy className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content={commandHint(TEMPLATES)}>
          <IconButton variant="ghost" size="sm" onClick={() => TEMPLATES.run()}>
            <LayoutTemplate className="w-4 h-4" />
          </IconButton>
        </Tooltip>
      </div>

      {/* Centre: which document, and whether it's saved */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 px-3">
        <span className="truncate text-sm text-text-primary" title={docPath ?? docName}>
          {docName}
        </span>
        <span className={cn('flex-shrink-0 text-xs', isDirty ? 'text-accent-hover' : 'text-text-muted')}>
          {isDirty ? 'Edited' : docPath ? 'Saved' : ''}
        </span>
      </div>

      {/* Right: command palette, then document panels */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => PALETTE.run()}
          // No aria-label: axe reads Kbd's sr-only text as visible, so the name must come from the content
          className={cn(
            'hidden md:flex items-center gap-2 h-7 pl-2 pr-1.5 mr-1.5 rounded-md border border-rule bg-canvas',
            'text-xs text-text-secondary hover:text-text-primary hover:border-[#D9DCE1] transition-colors',
            'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary'
          )}
        >
          <Search className="w-3.5 h-3.5" aria-hidden />
          <span>Commands</span>
          <Kbd id="commandPalette" size="sm" className="ml-1" />
        </button>
        <Tooltip content={commandHint(OUTLINE)}>
          <IconButton variant="ghost" size="sm" pressed={outlineOpen} onClick={() => OUTLINE.run()}>
            <ListTree className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <HistoryPanel />
        <Tooltip content={commandHint(SHORTCUTS_WINDOW)}>
          <IconButton variant="ghost" size="sm" onClick={() => SHORTCUTS_WINDOW.run()}>
            <Keyboard className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content={commandHint(SETTINGS)}>
          <IconButton variant="ghost" size="sm" onClick={() => SETTINGS.run()}>
            <Settings className="w-4 h-4" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
