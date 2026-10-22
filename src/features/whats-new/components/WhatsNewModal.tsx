import { lazy, Suspense } from 'react';
import { Modal } from '@/components/ui';

// The changelog loads on first open. Modal stays mounted so the dialog still animates out.
const WhatsNewBody = lazy(() => import('./WhatsNewBody'));

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewModal({ open, onOpenChange }: WhatsNewModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`What's new in Markloom ${__APP_VERSION__}`} size="xl">
      <Suspense fallback={<div className="min-h-[200px]" aria-busy="true" />}>
        <WhatsNewBody />
      </Suspense>
    </Modal>
  );
}
