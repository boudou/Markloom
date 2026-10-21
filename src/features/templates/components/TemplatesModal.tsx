import { lazy, Suspense } from 'react';
import { Modal } from '@/components/ui';

// The list, preview and template bodies load on first open. Modal stays mounted so the dialog
// still animates out.
const TemplatesBody = lazy(() => import('./TemplatesBody'));

interface TemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatesModal({ open, onOpenChange }: TemplatesModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New from template" size="3xl">
      <Suspense fallback={<div className="h-[60vh] min-h-[360px]" aria-busy="true" />}>
        <TemplatesBody onClose={() => onOpenChange(false)} />
      </Suspense>
    </Modal>
  );
}
