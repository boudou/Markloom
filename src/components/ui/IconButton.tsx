import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Toggle state for on/off buttons (sets aria-pressed) */
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'default', size = 'md', pressed, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={pressed}
        className={cn(
          // Presses down a pixel, like interior.dev's buttons
          'relative inline-flex items-center justify-center rounded-md transition-colors duration-150 active:translate-y-px',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
          'disabled:opacity-40 disabled:pointer-events-none',
          pressed && 'bg-accent-muted text-accent-hover hover:bg-accent-muted hover:text-accent-hover',
          {
            // Variants
            'text-text-secondary hover:text-text-primary hover:bg-wash':
              variant !== 'danger' && !pressed,
            'text-text-secondary hover:text-error hover:bg-error/10':
              variant === 'danger',
            // Sizes
            'w-7 h-7': size === 'sm',
            'w-9 h-9': size === 'md',
            'w-11 h-11': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
