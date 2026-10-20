import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function MenuContent({ className, sideOffset = 6, align = 'start', ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[200px] p-1 rounded-lg',
          'bg-canvas border border-rule',
          'shadow-[0_8px_24px_-6px_rgba(26,26,26,0.16),0_2px_6px_rgba(26,26,26,0.06)]',
          'animate-fade-in',
          className
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
});

interface MenuItemProps extends ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
  icon?: ReactNode;
  hint?: string;
  description?: string;
}

export const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(function MenuItem(
  { icon, hint, description, children, className, ...props },
  ref
) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        'flex items-start gap-2.5 px-2 py-1.5 rounded-md text-sm text-text-primary',
        'cursor-default select-none outline-none',
        'data-[highlighted]:bg-wash data-[disabled]:opacity-40',
        className
      )}
      {...props}
    >
      {icon && <span className="mt-0.5 text-text-secondary [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block">{children}</span>
        {description && <span className="block text-xs text-text-muted">{description}</span>}
      </span>
      {hint && <span className="text-xs text-text-muted tabular-nums pl-4">{hint}</span>}
    </DropdownMenu.Item>
  );
});

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs font-medium text-text-muted">
      {children}
    </DropdownMenu.Label>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-rule" />;
}

export const MenuSub = DropdownMenu.Sub;

interface MenuSubTriggerProps extends ComponentPropsWithoutRef<typeof DropdownMenu.SubTrigger> {
  icon?: ReactNode;
}

export const MenuSubTrigger = forwardRef<HTMLDivElement, MenuSubTriggerProps>(function MenuSubTrigger(
  { icon, children, className, ...props },
  ref
) {
  return (
    <DropdownMenu.SubTrigger
      ref={ref}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-text-primary',
        'cursor-default select-none outline-none',
        'data-[highlighted]:bg-wash data-[state=open]:bg-wash',
        className
      )}
      {...props}
    >
      {icon && <span className="text-text-secondary [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-text-muted" aria-hidden="true">
        <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </DropdownMenu.SubTrigger>
  );
});

export const MenuSubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.SubContent>
>(function MenuSubContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[220px] p-1 rounded-lg bg-canvas border border-rule',
          'shadow-[0_8px_24px_-6px_rgba(26,26,26,0.16),0_2px_6px_rgba(26,26,26,0.06)] animate-fade-in',
          className
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
});
