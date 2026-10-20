import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { List, ChevronRight, X } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useToc } from '../hooks';
import { getMinLevel, type TocItem } from '../utils';

interface TocPanelProps {
  onNavigate?: (line: number) => void;
}

export function TocPanel({ onNavigate }: TocPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const items = useToc();
  const minLevel = getMinLevel(items);

  const handleItemClick = (item: TocItem) => {
    setActiveItem(item.id);
    onNavigate?.(item.line);
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <Tooltip content={isOpen ? 'Hide Table of Contents' : 'Table of Contents'}>
        <IconButton
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(isOpen && 'bg-rule')}
        >
          <List className="w-4 h-4" />
        </IconButton>
      </Tooltip>

      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full right-0 mt-2 z-50',
              'w-72 max-h-96 overflow-auto',
              'bg-wash border border-rule rounded-lg shadow-xl'
            )}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-rule">
              <span className="text-sm font-medium text-text-primary">
                Table of Contents
              </span>
              <IconButton variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </IconButton>
            </div>

            <nav className="p-2">
              {items.map((item) => (
                <TocItemButton
                  key={`${item.id}-${item.line}`}
                  item={item}
                  minLevel={minLevel}
                  isActive={activeItem === item.id}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </nav>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TocItemButtonProps {
  item: TocItem;
  minLevel: number;
  isActive: boolean;
  onClick: () => void;
}

function TocItemButton({ item, minLevel, isActive, onClick }: TocItemButtonProps) {
  const indent = (item.level - minLevel) * 12;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors',
        'hover:bg-rule',
        isActive ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary'
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <span className="flex items-center gap-1.5">
        <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
        <span className="truncate">{item.text}</span>
      </span>
    </button>
  );
}
