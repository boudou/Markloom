import { lazy, Suspense } from 'react';
import { Modal } from '@/components/ui';

// The sections load on first open. Modal stays mounted so the dialog still animates out.
const SettingsBody = lazy(() => import('./SettingsBody'));

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Settings" size="3xl">
      <Suspense fallback={<div className="h-[60vh] min-h-[360px]" aria-busy="true" />}>
        <SettingsBody />
      </Suspense>
    </Modal>
  );
}
