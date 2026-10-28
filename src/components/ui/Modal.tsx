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
  /** Where focus goes once the dialog has closed (after its exit animation), instead of
   *  back to what had focus when it opened. */
  returnFocus?: () => void;
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
// what had focus and go back there (the editor, usually) when the dialog closes. Each open
// dialog keeps its own target, keyed by its content element (Radix dispatches both
// auto-focus events on it), so a dialog closing late can't clear another one's.
const focusBeforeDialog = new WeakMap<EventTarget, HTMLElement>();

export function rememberFocus(event: Event) {
  const content = event.currentTarget;
  const active = document.activeElement;

  if (!content || !(active instanceof HTMLElement) || active === document.body) return;

  // Opened from a dialog that is still animating out (a palette command): that element is
  // about to go, so return to where the closing dialog would have.
  const closing = active.closest('[role="dialog"][data-state="closed"]');
  const target = closing ? focusBeforeDialog.get(closing) : active;

  if (target) focusBeforeDialog.set(content, target);
}

export function restoreFocus(event: Event) {
  const content = event.currentTarget;
  const target = content ? focusBeforeDialog.get(content) : undefined;

  if (content) focusBeforeDialog.delete(content);

  // Something outside the dialog took focus while it closed (the dialog's action moved the
  // cursor, or another dialog opened): leave it there
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
  rememberFocus(event);
  const content = event.currentTarget;
  const preferred = content instanceof HTMLElement ? content.querySelector<HTMLElement>('[data-autofocus]') : null;

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
  returnFocus,
}: ModalProps) {
  const onCloseAutoFocus = (event: Event) => {
    if (!returnFocus) {
      restoreFocus(event);

      return;
    }

    if (event.currentTarget) focusBeforeDialog.delete(event.currentTarget);

    event.preventDefault();
    returnFocus();
  };

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
                className="fixed inset-0 bg-scrim/40 z-50"
              />
            </Dialog.Overlay>

            {/* Centres the panel; clicks on it fall through to the overlay, which closes the dialog */}
            <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
            <Dialog.Content asChild onOpenAutoFocus={focusPreferred} onCloseAutoFocus={onCloseAutoFocus}>
              <m.div
                variants={panel}
                initial="closed"
                animate="open"
                exit="gone"
                className={cn(
                  'relative w-full p-6 rounded-[14px] bg-canvas pointer-events-auto',
                  'shadow-[0_0_0_1px_rgb(var(--edge-rgb)/0.12),0_2px_4px_rgb(var(--shadow-rgb)/0.06),0_12px_32px_-8px_rgb(var(--shadow-rgb)/0.14)]',
                  'focus:outline-hidden',
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
