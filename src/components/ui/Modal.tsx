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

// Motion after interior.dev: the panel springs up from just below; leaving is quicker
const EASE = [0.23, 1, 0.32, 1] as const;
const LEAVE = [0.4, 0, 1, 1] as const;
const SURFACE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;

const backdrop = {
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: 0.2, ease: EASE } },
  gone: { opacity: 0, transition: { duration: 0.15, ease: LEAVE } },
};

const panel = {
  closed: { opacity: 0, scale: 0.96, y: 12 },
  open: { opacity: 1, scale: 1, y: 0, transition: { ...SURFACE, opacity: { duration: 0.16, ease: EASE } } },
  gone: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.15, ease: LEAVE } },
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
  // Something outside the dialog took focus while it closed (Export's Show puts the
  // cursor on a line): leave it there
  const active = document.activeElement;
  if (active && active !== document.body) {
    event.preventDefault();

    return;
  }

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
                variants={backdrop}
                initial="closed"
                animate="open"
                exit="gone"
                className="fixed inset-0 bg-[#1A1A1A]/40 z-50"
              />
            </Dialog.Overlay>

            {/* Centres the panel; clicks on it fall through to the overlay, which closes the dialog */}
            <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
            <Dialog.Content asChild onOpenAutoFocus={focusPreferred} onCloseAutoFocus={restoreFocus}>
              <m.div
                variants={panel}
                initial="closed"
                animate="open"
                exit="gone"
                className={cn(
                  'relative w-full p-6 rounded-[14px] bg-canvas pointer-events-auto',
                  'shadow-[0_0_0_1px_rgba(26,26,26,0.12),0_2px_4px_rgba(26,26,26,0.06),0_12px_32px_-8px_rgba(26,26,26,0.14)]',
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
            </div>
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
