import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { X, Plus } from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';
import { useTabsStore } from '../stores';
import { IconButton, Tooltip } from '@/components/ui';
import { useMenuHighlight } from '@/components/ui/useMenuHighlight';
import { newDocument, requestCloseTabs } from '@/lib/documentActions';
import { shortcutHint } from '@/lib/shortcuts';

const menuItemClass =
  'relative flex items-center px-2 py-1.5 text-sm text-text-primary rounded-[7px] cursor-default outline-none';

export function TabBar() {
  // Ids only: typing changes a tab's content, which must not re-render the bar
  const tabIds = useTabsStore(useShallow((s) => s.tabs.map((t) => t.id)));
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const id = tabIds[(index + tabIds.length) % tabIds.length];
    setActiveTab(id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus();
  };

  // Arrow keys move between tabs; Delete closes the focused one
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') focusTab(index + 1);
    else if (e.key === 'ArrowLeft') focusTab(index - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(tabIds.length - 1);
    else if (e.key === 'Delete') requestCloseTabs([tabIds[index]]);
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
        {tabIds.map((id, index) => (
          <TabItem
            key={id}
            id={id}
            isActive={id === activeTabId}
            onSelect={() => setActiveTab(id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onClose={() => requestCloseTabs([id])}
            onCloseOthers={() => requestCloseTabs(tabIds.filter((other) => other !== id))}
            onCloseAll={() => requestCloseTabs(tabIds)}
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
  id: string;
  isActive: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
}

function TabItem({ id, isActive, onSelect, onKeyDown, onClose, onCloseOthers, onCloseAll }: TabItemProps) {
  const { name, path, isDirty } = useTabsStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.id === id);

      return { name: tab?.name ?? '', path: tab?.path ?? null, isDirty: !!tab?.isDirty };
    })
  );

  const { onFocusCapture, highlight } = useMenuHighlight();

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
            data-tab-id={id}
            aria-selected={isActive}
            aria-keyshortcuts="Delete"
            tabIndex={isActive ? 0 : -1}
            title={path && !path.startsWith('file://') ? path : name}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            className="flex items-center gap-1.5 h-full text-sm outline-none focus-visible:underline decoration-accent-primary decoration-2 underline-offset-4"
          >
            <span className="truncate max-w-[200px]">{name}</span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0">
                <span className="sr-only">(unsaved changes)</span>
              </span>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            // A tablist may own only tabs; keyboard and AT users close via Delete or the context menu
            aria-hidden="true"
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
        <ContextMenu.Content
          onFocusCapture={onFocusCapture}
          className="ml-surface ml-float [--ml-origin:var(--radix-context-menu-content-transform-origin)] relative z-50 min-w-[170px] p-1 outline-none"
        >
          {highlight}
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
