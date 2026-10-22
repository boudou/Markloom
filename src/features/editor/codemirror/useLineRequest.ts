import { useEffect } from 'react';
import type { EditorView } from '@codemirror/view';
import { useTabsStore } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';
import { placeCursor, revealLine } from './commands';

/**
 * Acts on the pending line request in a CodeMirror source view of the active tab. A request
 * waits until the view exists, so it also lands when it was made before the editor mounted;
 * a request for any other tab is stale (the document it was meant for is not here) and is dropped.
 */
export function useLineRequest(view: EditorView | null): void {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const lineRequest = useUiStore((s) => s.lineRequest);

  useEffect(() => {
    if (!view || lineRequest === null) return;

    if (lineRequest.tabId === activeTabId) {
      if (lineRequest.kind === 'reveal') revealLine(view, lineRequest.line);
      else placeCursor(view, lineRequest.line);
    }

    useUiStore.getState().clearLineRequest();
  }, [view, lineRequest, activeTabId]);
}
