import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { useMenuHighlight } from './useMenuHighlight';

export const Menu = DropdownMenu.Root;

export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function MenuContent({ className, sideOffset = 6, align = 'start', children, ...props }, ref) {
  const { onFocusCapture, highlight } = useMenuHighlight();

  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        onFocusCapture={onFocusCapture}
        className={cn(
          'ml-surface ml-float [--ml-origin:var(--radix-dropdown-menu-content-transform-origin)]',
          'relative z-50 min-w-[200px] p-1 outline-hidden',
          className
        )}
        {...props}
      >
        {highlight}
        {children}
      </DropdownMenu.Content>
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
        'relative flex items-start gap-2.5 px-2 py-1.5 rounded-[7px] text-sm text-text-primary',
        'cursor-default select-none outline-hidden data-disabled:opacity-40',
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
        'relative flex items-center gap-2.5 px-2 py-1.5 rounded-[7px] text-sm text-text-primary',
        'cursor-default select-none outline-hidden',
        // Stays lit while focus is in its submenu
        'data-[state=open]:bg-wash',
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
>(function MenuSubContent({ className, sideOffset = 6, children, ...props }, ref) {
  const { onFocusCapture, highlight } = useMenuHighlight();

  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        ref={ref}
        sideOffset={sideOffset}
        onFocusCapture={onFocusCapture}
        className={cn(
          'ml-surface ml-float [--ml-origin:var(--radix-dropdown-menu-content-transform-origin)]',
          'relative z-50 min-w-[220px] p-1 outline-hidden',
          className
        )}
        {...props}
      >
        {highlight}
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  );
});
