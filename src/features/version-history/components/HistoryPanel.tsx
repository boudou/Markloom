import { lazy, Suspense } from 'react';
import { History } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { IconButton, Tooltip } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';

const HistoryBody = lazy(() => import('./HistoryBody'));

export function HistoryPanel() {
  const isOpen = useUiStore((s) => s.historyOpen);
  const setIsOpen = useUiStore((s) => s.setHistoryOpen);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip content="Version history">
        <Popover.Trigger asChild>
          <IconButton variant="ghost" size="sm" pressed={isOpen}>
            <History className="w-4 h-4" />
          </IconButton>
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            'ml-surface ml-float [--ml-origin:var(--radix-popover-content-transform-origin)]',
            'w-[28rem] max-h-[70vh] overflow-hidden outline-none z-50'
          )}
        >
          <Suspense fallback={<p className="px-6 py-8 text-center text-sm text-text-secondary">Loading…</p>}>
            <HistoryBody />
          </Suspense>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
