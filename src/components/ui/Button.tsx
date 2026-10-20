import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 ease-out-expo',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          {
            // Variants
            'bg-accent-primary text-white hover:bg-accent-hover active:scale-[0.98]':
              variant === 'primary',
            'bg-wash text-text-primary border border-rule hover:bg-rule active:scale-[0.98]':
              variant === 'secondary',
            'bg-transparent text-text-secondary hover:text-text-primary hover:bg-wash':
              variant === 'ghost',
            'bg-canvas text-[#B91C1C] border border-rule hover:bg-error/10 hover:border-error/40 active:scale-[0.98]':
              variant === 'danger',
            // Sizes
            'text-xs px-2.5 py-1.5 gap-1.5': size === 'sm',
            'text-sm px-4 py-2 gap-2': size === 'md',
            'text-base px-6 py-3 gap-2.5': size === 'lg',
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

Button.displayName = 'Button';
