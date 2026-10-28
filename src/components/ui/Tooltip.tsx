import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delayDuration,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      {/* A text tooltip doubles as the accessible name of an icon-only control */}
      <TooltipPrimitive.Trigger
        asChild
        aria-label={typeof content === 'string' ? content : undefined}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            // After interior.dev: a chip on the canvas colour that rises on first show, then swaps between neighbours
            'ml-tooltip z-50 max-w-[240px] px-2 py-1 rounded-lg select-none',
            'bg-canvas text-[11.5px] font-medium leading-snug text-text-primary',
            'shadow-[0_0_0_1px_rgb(var(--edge-rgb)/0.12),0_2px_4px_rgb(var(--shadow-rgb)/0.06),0_8px_20px_-8px_rgb(var(--shadow-rgb)/0.14)]'
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** One provider for the whole app: once a tooltip has shown, its neighbours open without the delay */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}
