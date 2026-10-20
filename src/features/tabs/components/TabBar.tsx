import { useRef } from 'react';
import { X, Plus } from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';
import { useTabsStore, type Tab } from '../stores';
import { IconButton, Tooltip } from '@/components/ui';
import { newDocument, requestCloseTabs } from '@/lib/documentActions';
import { shortcutHint } from '@/lib/shortcuts';

const menuItemClass =
  'flex items-center px-2 py-1.5 text-sm text-text-primary rounded-md cursor-default outline-none data-[highlighted]:bg-wash';

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    setActiveTab(tab.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"]`)?.focus();
  };

  // Arrow keys move between tabs; Delete closes the focused one
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') focusTab(index + 1);
    else if (e.key === 'ArrowLeft') focusTab(index - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(tabs.length - 1);
    else if (e.key === 'Delete') requestCloseTabs([tabs[index].id]);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex items-stretch h-9 bg-panel border-b border-rule flex-shrink-0">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Open documents"
        className="flex items-stretch min-w-0 overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onClose={() => requestCloseTabs([tab.id])}
            onCloseOthers={() => requestCloseTabs(tabs.filter((t) => t.id !== tab.id).map((t) => t.id))}
            onCloseAll={() => requestCloseTabs(tabs.map((t) => t.id))}
          />
        ))}
      </div>

      <div className="flex items-center px-1 flex-shrink-0">
        <Tooltip content={shortcutHint('New document', 'newDocument')}>
          <IconButton variant="ghost" size="sm" onClick={newDocument}>
            <Plus className="w-4 h-4" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
}

function TabItem({ tab, isActive, onSelect, onKeyDown, onClose, onCloseOthers, onCloseAll }: TabItemProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            'group relative flex items-center gap-1.5 pl-3 pr-1.5 border-r border-rule',
            'transition-colors duration-150',
            isActive ? 'bg-canvas text-text-primary' : 'text-text-secondary hover:bg-wash hover:text-text-primary'
          )}
          // Middle-click closes, as in browsers and editors
          onAuxClick={(e) => {
            if (e.button === 1) onClose();
          }}
        >
          {/* Active tab joins the editor surface below it */}
          {isActive && <span className="absolute inset-x-0 -bottom-px h-px bg-canvas" aria-hidden />}
          {isActive && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent-primary" aria-hidden />}

          <button
            type="button"
            role="tab"
            data-tab-id={tab.id}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={tab.path && !tab.path.startsWith('file://') ? tab.path : tab.name}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            className="flex items-center gap-1.5 h-full text-sm outline-none focus-visible:underline decoration-accent-primary decoration-2 underline-offset-4"
          >
            <span className="truncate max-w-[200px]">{tab.name}</span>
            {tab.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0">
                <span className="sr-only">(unsaved changes)</span>
              </span>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={`Close ${tab.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              'p-1 rounded text-text-muted hover:text-text-primary hover:bg-rule transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            )}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[170px] p-1 rounded-lg bg-canvas border border-rule shadow-[0_8px_24px_-6px_rgba(26,26,26,0.16)]">
          <ContextMenu.Item className={menuItemClass} onSelect={onClose}>
            Close
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={onCloseOthers}>
            Close others
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={onCloseAll}>
            Close all
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
