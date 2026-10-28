import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Clock, FileText, X, Trash2 } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { useMenuHighlight } from '@/components/ui/useMenuHighlight';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { openPath } from '@/lib/documentActions';

export function RecentFilesMenu() {
  const recentFiles = useSettingsStore((s) => s.recentFiles);
  const removeRecentFile = useSettingsStore((s) => s.removeRecentFile);
  const clearRecentFiles = useSettingsStore((s) => s.clearRecentFiles);

  const { onFocusCapture, highlight } = useMenuHighlight();

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();

    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (recentFiles.length === 0) {
    return null;
  }

  return (
    <DropdownMenu.Root>
      <Tooltip content="Recent files">
        <DropdownMenu.Trigger asChild>
          <IconButton variant="ghost" size="sm">
            <Clock className="w-4 h-4" />
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'ml-surface ml-float [--ml-origin:var(--radix-dropdown-menu-content-transform-origin)]',
            'relative z-50 min-w-[280px] max-w-[400px] p-1 outline-hidden'
          )}
          sideOffset={6}
          align="start"
          onFocusCapture={onFocusCapture}
        >
          {highlight}
          <div className="flex items-center justify-between px-2 py-1.5">
            <DropdownMenu.Label className="text-xs font-medium text-text-muted">
              Recent Files
            </DropdownMenu.Label>
            <Tooltip content="Clear all">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  clearRecentFiles();
                }}
                className="p-1 rounded-sm hover:bg-rule text-text-muted hover:text-error transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Tooltip>
          </div>

          <DropdownMenu.Separator className="h-px bg-rule my-1" />

          {recentFiles.map((file) => (
            <DropdownMenu.Item
              key={file.path}
              className={cn(
                'relative flex items-center gap-2 px-2 py-2 rounded-[7px] cursor-pointer',
                'outline-hidden group'
              )}
              onSelect={() => void openPath(file.path)}
            >
              <FileText className="w-4 h-4 text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">
                  {file.name}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {file.path}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">
                  {formatDate(file.accessedAt)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentFile(file.path);
                  }}
                  className="p-1 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-wash text-text-muted hover:text-error transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
