import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMenuHighlight } from './useMenuHighlight';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Select…',
  disabled,
  className,
}: SelectProps) {
  const { onFocusCapture, highlight } = useMenuHighlight();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          className={cn(
            'flex items-center justify-between w-full px-3 py-2 rounded-lg',
            'bg-wash border border-rule',
            'text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
            'transition-[background-color,box-shadow] duration-150',
            // Pressed in while its list is open (interior.dev)
            'data-[state=open]:bg-panel data-[state=open]:shadow-[inset_0_1px_2px_rgba(26,26,26,0.06)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            '[&[data-placeholder]]:text-text-muted'
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="w-4 h-4 text-text-muted transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] [[data-state=open]_&]:rotate-180" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cn(
              'ml-surface ml-float [--ml-origin:var(--radix-select-content-transform-origin)]',
              'z-50 overflow-hidden min-w-[var(--radix-select-trigger-width)]'
            )}
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="relative p-1" onFocusCapture={onFocusCapture}>
              {highlight}
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'relative flex items-center px-8 py-2 rounded-[7px] cursor-pointer',
                    'text-sm text-text-primary',
                    'outline-none',
                    'data-[state=checked]:text-accent-primary'
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="ml-check absolute left-2">
                    <Check className="w-4 h-4" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
