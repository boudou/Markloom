import { useEffect, useRef } from 'react';
import { m } from 'framer-motion';
import { FolderTree, ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResizeDrag } from '@/lib/useResizeDrag';
import { useAppStore, type SidebarView } from '@/stores/appStore';
import { FileTree } from '@/features/file-tree/components';
import { OutlineDock } from '@/features/outline';

const MIN_WIDTH = 200;

const MAX_WIDTH = 500;

const VIEWS: { id: SidebarView; label: string; icon: typeof FolderTree }[] = [
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'outline', label: 'Contents', icon: ListTree },
];

export function Sidebar() {
  const rootPath = useAppStore((s) => s.rootPath);
  const view = useAppStore((s) => s.sidebarView);
  const showSidebarView = useAppStore((s) => s.showSidebarView);
  // Contents is always useful; the file list only once a folder is open
  const open = useAppStore((s) => s.sidebarOpen) && (view === 'outline' || !!rootPath);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const asideRef = useRef<HTMLElement>(null);

  // A collapsed panel must not be reachable by keyboard (React 18 has no `inert` prop)
  useEffect(() => {
    asideRef.current?.toggleAttribute('inert', !open);
  }, [open]);

  const drag = useResizeDrag({
    stored: sidebarWidth,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    anchorRef: asideRef,
    toValue: (x, rect) => x - rect.left,
    commit: setSidebarWidth,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;

    if (e.key === 'ArrowLeft') setSidebarWidth(sidebarWidth - step);
    else if (e.key === 'ArrowRight') setSidebarWidth(sidebarWidth + step);
    else if (e.key === 'Home') setSidebarWidth(MIN_WIDTH);
    else if (e.key === 'End') setSidebarWidth(MAX_WIDTH);
    else return;
    e.preventDefault();
  };

  return (
    <m.aside
      ref={asideRef}
      aria-label="Sidebar"
      initial={false}
      animate={{ width: open ? drag.value : 0 }}
      // Follow the pointer exactly while dragging; animate only open/close
      transition={drag.dragging ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative h-full flex-shrink-0 overflow-hidden bg-panel', open && 'border-r border-rule')}
    >
      <div className="h-full flex flex-col overflow-hidden" style={{ width: drag.value }}>
        <div role="tablist" aria-label="Sidebar view" className="flex items-center gap-1 h-10 px-2 border-b border-rule flex-shrink-0">
          {VIEWS.map(({ id, label, icon: Icon }) => {
            const selected = view === id;

            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => showSidebarView(id)}
                className={cn(
                  'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                  'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                  selected ? 'bg-canvas text-text-primary shadow-[0_1px_2px_rgba(26,26,26,0.08)]' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="flex-1 min-h-0">
          {view === 'files' ? <FileTree /> : <OutlineDock />}
        </div>
      </div>

      {open && (
        // An 8px grab strip along the edge (easy to hit, above the file list's scrollbar)
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={drag.value}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          onPointerDown={drag.onPointerDown}
          onDoubleClick={() => setSidebarWidth(280)}
          onKeyDown={handleKeyDown}
          className={cn(
            'group absolute top-0 right-0 z-20 w-2 h-full cursor-col-resize outline-none touch-none',
            'flex justify-end'
          )}
        >
          <span
            aria-hidden
            className={cn(
              'w-0.5 h-full transition-colors',
              drag.dragging ? 'bg-accent-primary' : 'bg-transparent group-hover:bg-accent-primary/60 group-focus-visible:bg-accent-primary'
            )}
          />
        </div>
      )}
    </m.aside>
  );
}
