import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '3xl';
  showClose?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '3xl': 'max-w-4xl',
};

// Dialogs opened from the keyboard have no trigger for Radix to return focus to; remember
// what had focus and go back there (the editor, usually) when the dialog closes.
let focusBeforeDialog: HTMLElement | null = null;

export function rememberFocus() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) focusBeforeDialog = active;
}

export function restoreFocus(event: Event) {
  const target = focusBeforeDialog;
  focusBeforeDialog = null;
  if (target?.isConnected) {
    event.preventDefault();
    target.focus();
  }
}

// Start focus on the control marked data-autofocus (e.g. the primary action) instead of
// the close button, which Radix would pick as the first focusable element.
function focusPreferred(event: Event) {
  rememberFocus();
  const content = (event.target ?? event.currentTarget) as HTMLElement | null;
  const preferred = content?.querySelector<HTMLElement>('[data-autofocus]');
  if (preferred) {
    event.preventDefault();
    preferred.focus();
  }
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = 'md',
  showClose = true,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-[#1A1A1A]/40 z-50"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild onOpenAutoFocus={focusPreferred} onCloseAutoFocus={restoreFocus}>
              <m.div
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={cn(
                  'fixed top-1/2 left-1/2',
                  'w-[calc(100%-2rem)] p-6 rounded-xl',
                  'bg-canvas border border-rule',
                  'shadow-[0_24px_60px_-20px_rgba(26,26,26,0.35)] z-50',
                  'focus:outline-none',
                  sizeClasses[size],
                  className
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-lg font-display font-semibold text-text-primary">
                    {title}
                  </Dialog.Title>
                  {showClose && (
                    <Dialog.Close asChild>
                      <IconButton variant="ghost" size="sm" aria-label="Close">
                        <X className="w-4 h-4" />
                      </IconButton>
                    </Dialog.Close>
                  )}
                </div>

                {description && (
                  <Dialog.Description className="text-sm text-text-secondary mb-4">
                    {description}
                  </Dialog.Description>
                )}

                {/* Content */}
                {children}
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

// Modal footer for action buttons
interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn('flex justify-end gap-3 mt-6', className)}>
      {children}
    </div>
  );
}
