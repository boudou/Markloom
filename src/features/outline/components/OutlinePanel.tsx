import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import {
  List,
  Heading1,
  Code2,
  Image,
  Link2,
  Table,
  Filter,
  ChevronRight,
  X,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { IconButton, Tooltip } from '@/components/ui';
import { useOutline } from '../hooks';
import { useOutlineStore } from '../stores/outlineStore';
import { type OutlineItem, type OutlineItemType } from '../utils';

const typeConfig: Record<OutlineItemType, { icon: typeof Heading1; label: string; color: string }> = {
  heading: { icon: Heading1, label: 'Headings', color: 'text-text-secondary' },
  code: { icon: Code2, label: 'Code Blocks', color: 'text-text-secondary' },
  image: { icon: Image, label: 'Images', color: 'text-text-secondary' },
  link: { icon: Link2, label: 'Links', color: 'text-text-secondary' },
  table: { icon: Table, label: 'Tables', color: 'text-text-secondary' },
};

export function OutlinePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { filteredItems, counts, hasItems } = useOutline();
  const { filterTypes, toggleFilterType, setFilterTypes } = useOutlineStore();

  const handleNavigate = (item: OutlineItem) => {
    // Navigate to line in editor
    // This would need to be connected to CodeMirror's scrolling API
    // For now, we'll dispatch a custom event
    window.dispatchEvent(
      new CustomEvent('outline-navigate', {
        detail: { line: item.line, text: item.text },
      })
    );
    setIsOpen(false);
  };


  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip content="Outline">
        <Popover.Trigger asChild>
          <IconButton variant="ghost" size="sm" pressed={isOpen} disabled={!hasItems}>
            <List className="w-4 h-4" />
          </IconButton>
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            'w-80 max-h-[70vh] rounded-lg',
            'bg-canvas border border-rule',
            'shadow-[0_8px_24px_-6px_rgba(26,26,26,0.16)] overflow-hidden',
            'animate-fade-in z-50'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
            <span className="text-sm font-medium text-text-primary">Outline</span>
            <div className="flex items-center gap-1">
              {/* Filter popover */}
              <Popover.Root>
                <Popover.Trigger asChild>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    className={filterTypes ? 'text-accent-primary' : ''}
                  >
                    <Filter className="w-3.5 h-3.5" />
                  </IconButton>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={4}
                    className={cn(
                      'w-48 rounded-lg p-2',
                      'bg-panel border border-rule',
                      'shadow-xl z-50'
                    )}
                  >
                    <div className="space-y-1">
                      {(Object.keys(typeConfig) as OutlineItemType[]).map((type) => {
                        const config = typeConfig[type];
                        const Icon = config.icon;
                        const isActive = filterTypes?.includes(type) ?? true;
                        const count = counts[type];

                        return (
                          <button
                            key={type}
                            onClick={() => toggleFilterType(type)}
                            className={cn(
                              'w-full flex items-center justify-between px-2 py-1.5 rounded',
                              'text-sm transition-colors',
                              isActive
                                ? 'bg-rule text-text-primary'
                                : 'text-text-muted hover:bg-rule/50'
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <Icon className={cn('w-4 h-4', config.color)} />
                              <span>{config.label}</span>
                            </span>
                            <span className="text-xs text-text-muted">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {filterTypes && (
                      <button
                        onClick={() => setFilterTypes(null)}
                        className="w-full mt-2 px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary text-center rounded hover:bg-rule/50 transition-colors"
                      >
                        Clear filters
                      </button>
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              <Popover.Close asChild>
                <IconButton variant="ghost" size="sm">
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              </Popover.Close>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(70vh-48px)]">
            {!hasItems ? (
              <div className="p-4 text-center text-text-muted text-sm">
                <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No items to show</p>
                <p className="text-xs mt-1">Add headings, code blocks, images, links, or tables</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center text-text-muted text-sm">
                <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No items match filter</p>
              </div>
            ) : (
              <div className="py-1">
                <AnimatePresence mode="popLayout">
                  {filteredItems.map((item) => (
                    <OutlineItemRow
                      key={item.id}
                      item={item}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface OutlineItemRowProps {
  item: OutlineItem;
  onNavigate: (item: OutlineItem) => void;
}

function OutlineItemRow({ item, onNavigate }: OutlineItemRowProps) {
  const config = typeConfig[item.type];
  const Icon = config.icon;

  // Calculate indentation for headings
  const indentLevel = item.type === 'heading' ? (item.level ?? 1) - 1 : 0;

  return (
    <m.button
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      onClick={() => onNavigate(item)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5',
        'text-left text-sm transition-colors',
        'hover:bg-rule/50 group'
      )}
      style={{ paddingLeft: `${12 + indentLevel * 12}px` }}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
      <span className="flex-1 truncate text-text-secondary group-hover:text-text-primary">
        {item.text}
      </span>
      <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
        L{item.line}
      </span>
      <ChevronRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
    </m.button>
  );
}
