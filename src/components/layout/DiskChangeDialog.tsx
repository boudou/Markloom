import { lazy, Suspense, useState } from 'react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import { useTabsStore, selectTab, selectTabContent } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';
import { useDiskChanges, reloadFromDisk, keepMyVersion, dismissDiskConflict } from '@/lib/diskChanges';

// The diff library stays out of the startup bundle until someone compares
const DiffViewer = lazy(() =>
  import('@/features/version-history/components/DiffViewer').then((m) => ({ default: m.DiffViewer }))
);

/** "“notes.md” changed on disk": another program changed a file whose tab has unsaved changes. */
export function DiskChangeDialog() {
  const conflict = useDiskChanges((s) => s.conflicts[0]);
  const name = useTabsStore((s) => (conflict ? selectTab(s, conflict.tabId)?.name : undefined));
  // Never stacks on another modal: it shows once that one closes
  const otherModalOpen = useUiStore((s) => s.dialog !== null || s.pendingClose !== null);
  const [comparing, setComparing] = useState<string | null>(null);

  const tabId = conflict?.tabId ?? null;
  const isComparing = !!tabId && comparing === tabId;

  return (
    <Modal
      open={!!conflict && !!name && !otherModalOpen}
      onOpenChange={(open) => !open && tabId && dismissDiskConflict(tabId)}
      title={`“${name ?? ''}” changed on disk`}
      description="Another program changed this file while you had unsaved changes here."
      size={isComparing ? 'xl' : 'md'}
    >
      {conflict && isComparing && <Comparison tabId={conflict.tabId} diskContent={conflict.diskContent} />}
      <ModalFooter className="justify-between">
        <Button variant="danger" onClick={() => tabId && reloadFromDisk(tabId)}>
          Reload from disk
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setComparing(isComparing ? null : tabId)}>
            {isComparing ? 'Hide comparison' : 'Compare'}
          </Button>
          <Button onClick={() => tabId && keepMyVersion(tabId)} data-autofocus>
            Keep my version
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

function Comparison({ tabId, diskContent }: { tabId: string; diskContent: string }) {
  // The modal holds the focus, so the text doesn't change while this shows
  const content = useTabsStore((s) => selectTabContent(s, tabId));

  return (
    <div className="mb-2">
      <p className="mb-1 font-mono text-xs text-text-muted">− on disk&nbsp;&nbsp;&nbsp;+ your version</p>
      <div className="max-h-[50vh] overflow-auto rounded border border-rule">
        <Suspense fallback={<p className="p-4 text-sm text-text-muted">Comparing…</p>}>
          <DiffViewer oldContent={diskContent} newContent={content} />
        </Suspense>
      </div>
    </div>
  );
}
