import { FileText, FolderOpen, Save, FileDown, LayoutTemplate, Keyboard, PanelLeft, ListTree, Search } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { RecentFilesMenu } from '@/features/recent-files';
import { HistoryPanel } from '@/features/version-history';
import { useTabsStore } from '@/features/tabs';
import { useAppStoreBase } from '@/stores/appStore';
import { useUiStore } from '@/stores/uiStore';
import { openFile, openFolder, saveActiveTab } from '@/lib/documentActions';
import { shortcutHint, shortcutKeys } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { MarkloomMark } from './MarkloomMark';
import { useRef } from 'react';
import { useRovingToolbar } from '@/lib/useRovingToolbar';

const desktop = window.markloomDesktop;
const isMacDesktop = desktop?.platform === 'darwin';

function Separator() {
  return <div className="w-px h-4 bg-rule mx-1" aria-hidden />;
}

/**
 * App chrome in one row: file actions, the current document, and panels.
 * On desktop it is also the window's drag handle.
 */
export function TitleBar() {
  const activeTab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const sidebarOpen = useAppStoreBase((s) => s.sidebarOpen);
  const toggleSidebarView = useAppStoreBase((s) => s.toggleSidebarView);
  const sidebarView = useAppStoreBase((s) => s.sidebarView);
  const rootPath = useAppStoreBase((s) => s.rootPath);
  const filesVisible = sidebarOpen && sidebarView === 'files' && !!rootPath;
  const outlineOpen = sidebarOpen && sidebarView === 'outline';
  const openDialog = useUiStore((s) => s.openDialog);

  const barRef = useRef<HTMLElement>(null);
  useRovingToolbar(barRef);

  const hasContent = !!activeTab?.content.trim();
  const isDirty = !!activeTab?.isDirty;
  const docName = activeTab?.name ?? 'Untitled';

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
          content={
            rootPath
              ? shortcutHint(filesVisible ? 'Hide files' : 'Show files', 'toggleSidebar')
              : 'Open a folder to browse its files'
          }
        >
          <IconButton
            variant="ghost"
            size="sm"
            pressed={filesVisible}
            onClick={() => (rootPath ? toggleSidebarView('files') : void openFolder())}
          >
            <PanelLeft className="w-4 h-4" />
          </IconButton>
        </Tooltip>

        <div className="flex items-center gap-1.5 px-2">
          <MarkloomMark className="w-5 h-5" />
          <span className="font-display text-sm font-semibold text-text-primary">Markloom</span>
        </div>

        <Separator />
        <Tooltip content={shortcutHint('Open file', 'openFile')}>
          <IconButton variant="ghost" size="sm" onClick={() => void openFile()}>
            <FileText className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content={shortcutHint('Open folder', 'openFolder')}>
          <IconButton variant="ghost" size="sm" onClick={() => void openFolder()}>
            <FolderOpen className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <RecentFilesMenu />
        <Tooltip content={shortcutHint('Save', 'save')}>
          <IconButton variant="ghost" size="sm" onClick={() => void saveActiveTab()} disabled={!hasContent && !isDirty}>
            <Save className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Separator />
        <Tooltip content={shortcutHint('Export to Word, PDF or Markdown', 'export')}>
          <IconButton variant="ghost" size="sm" onClick={() => openDialog('export')} disabled={!hasContent}>
            <FileDown className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <Tooltip content="New from template">
          <IconButton variant="ghost" size="sm" onClick={() => openDialog('templates')}>
            <LayoutTemplate className="w-4 h-4" />
          </IconButton>
        </Tooltip>
      </div>

      {/* Centre: which document, and whether it's saved */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 px-3">
        <span className="truncate text-sm text-text-primary" title={activeTab?.path ?? docName}>
          {docName}
        </span>
        <span className={cn('flex-shrink-0 text-xs', isDirty ? 'text-accent-hover' : 'text-text-muted')}>
          {isDirty ? 'Edited' : activeTab?.path ? 'Saved' : ''}
        </span>
      </div>

      {/* Right: command palette, then document panels */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => openDialog('palette')}
          aria-label={shortcutHint('Commands', 'commandPalette')}
          className={cn(
            'hidden md:flex items-center gap-2 h-7 pl-2 pr-1.5 mr-1.5 rounded-md border border-rule bg-canvas',
            'text-xs text-text-secondary hover:text-text-primary hover:border-[#D9DCE1] transition-colors',
            'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary'
          )}
        >
          <Search className="w-3.5 h-3.5" aria-hidden />
          <span>Commands</span>
          <kbd className="ml-1 px-1 rounded bg-wash font-mono text-[10px] text-text-muted" aria-hidden>
            {shortcutKeys('commandPalette')}
          </kbd>
        </button>
        <Tooltip content={shortcutHint(outlineOpen ? 'Hide contents' : 'Show contents', 'toggleOutline')}>
          <IconButton variant="ghost" size="sm" pressed={outlineOpen} onClick={() => toggleSidebarView('outline')}>
            <ListTree className="w-4 h-4" />
          </IconButton>
        </Tooltip>
        <HistoryPanel />
        <Tooltip content={shortcutHint('Keyboard shortcuts', 'showShortcuts')}>
          <IconButton variant="ghost" size="sm" onClick={() => openDialog('shortcuts')}>
            <Keyboard className="w-4 h-4" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
