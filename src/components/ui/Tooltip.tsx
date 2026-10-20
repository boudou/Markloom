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
            'z-50 px-2.5 py-1.5 text-xs font-medium rounded-md',
            'bg-text-primary text-canvas shadow-[0_4px_12px_rgba(0,0,0,0.12)]',
            'animate-fade-in',
            'select-none'
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-text-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** One provider for the whole app: once a tooltip has shown, its neighbours open without the delay */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}
