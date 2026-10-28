import { AnimatePresence, m } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore, type ToastTone } from '@/stores/uiStore';

const toneIcon: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const toneColor: Record<ToastTone, string> = {
  success: 'text-[#15803D]',
  error: 'text-[#B91C1C]',
  info: 'text-accent-hover',
};

/** Bottom-right notifications. Errors are announced assertively, others politely. */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-10 right-4 z-60 flex flex-col items-end gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone];

          return (
            <m.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-3 w-[360px] max-w-[calc(100vw-2rem)]',
                'px-3.5 py-3 rounded-lg bg-canvas border border-rule',
                'shadow-[0_10px_30px_-10px_rgba(26,26,26,0.25),0_2px_6px_rgba(26,26,26,0.06)]'
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', toneColor[toast.tone])} />
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-medium text-text-primary wrap-break-word">{toast.title}</p>
                {toast.detail && (
                  <p className="mt-0.5 text-text-secondary wrap-break-word">{toast.detail}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="-m-1 p-1 rounded-sm text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary outline-hidden"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
