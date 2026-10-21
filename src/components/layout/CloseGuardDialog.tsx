import { useState } from 'react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import { useTabsStore } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';
import { saveTab } from '@/lib/documentActions';

/** "Save changes?" before closing tabs that have unsaved work. */
export function CloseGuardDialog() {
  const pending = useUiStore((s) => s.pendingClose);
  const setPending = useUiStore((s) => s.setPendingClose);
  const tabs = useTabsStore((s) => s.tabs);
  const closeTabs = useTabsStore((s) => s.closeTabs);
  const [saving, setSaving] = useState(false);

  const dirty = pending ? tabs.filter((t) => pending.includes(t.id) && t.isDirty) : [];
  const single = dirty.length === 1 ? dirty[0] : null;

  const cancel = () => {
    if (!saving) setPending(null);
  };

  const discard = () => {
    if (!pending) return;
    closeTabs(pending);
    setPending(null);
  };

  const saveAndClose = async () => {
    if (!pending) return;
    setSaving(true);

    try {
      for (const tab of dirty) {
        // Stop at the first cancel or failure so nothing unsaved gets closed
        if (!(await saveTab(tab.id))) return;
      }

      closeTabs(pending);
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!pending && dirty.length > 0}
      onOpenChange={(open) => !open && cancel()}
      title={single ? `Save changes to “${single.name}”?` : `Save changes to ${dirty.length} documents?`}
      description="If you close without saving, your changes will be lost."
      size="md"
    >
      {!single && (
        <ul className="mb-2 space-y-1 text-sm text-text-primary">
          {dirty.map((tab) => (
            <li key={tab.id} className="truncate">
              {tab.name}
            </li>
          ))}
        </ul>
      )}
      <ModalFooter className="justify-between">
        <Button variant="danger" onClick={discard} disabled={saving}>
          Don't save
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void saveAndClose()} disabled={saving} data-autofocus>
            {saving ? 'Saving…' : single ? 'Save' : 'Save all'}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
