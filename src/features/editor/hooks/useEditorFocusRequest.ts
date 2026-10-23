import { useEffect } from 'react';
import { useTabsStore } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';

/** A CodeMirror or ProseMirror EditorView: both focus their document */
interface Focusable {
  focus(): void;
}

/**
 * Focuses this editor when the pending focus request names the active tab (a template was just
 * applied). Like useLineRequest, it waits until the editor exists and drops a request for any
 * other tab as stale.
 */
export function useEditorFocusRequest(target: Focusable | null): void {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const request = useUiStore((s) => s.editorFocusRequest);

  useEffect(() => {
    if (!target || request === null) return;

    if (request === activeTabId) target.focus();

    useUiStore.getState().clearEditorFocusRequest();
  }, [target, request, activeTabId]);
}
