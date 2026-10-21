import { useEffect, useState } from 'react';
import type { ReactCodeMirrorProps } from '@uiw/react-codemirror';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { historyField } from '@codemirror/commands';
import { selectActiveTab, useTabsStore } from '@/features/tabs';

/**
 * CodeMirror states (text, selection, undo history) of editors that were unmounted, so a
 * tab switch does not cost the document its history. Keyed by the tab's loadId, never its
 * id, so a history never reaches another document loaded into the same tab. Memory only.
 */

type SavedState = NonNullable<ReactCodeMirrorProps['initialState']>;

interface SavedEditorState {
  doc: string;
  initialState: SavedState;
}

const HISTORY_FIELDS = { history: historyField };

const states = new Map<string, SavedEditorState>();

/** Remembers an unmounting editor's state, and forgets states of documents no tab holds */
function saveEditorState(loadId: string, state: EditorState): void {
  const liveLoadIds = new Set(useTabsStore.getState().tabs.map((tab) => tab.loadId));

  for (const id of states.keys()) {
    if (!liveLoadIds.has(id)) states.delete(id);
  }

  // The tab was closed before the editor unmounted
  if (!liveLoadIds.has(loadId)) return;

  states.set(loadId, {
    doc: state.doc.toString(),
    initialState: { json: state.toJSON(HISTORY_FIELDS), fields: HISTORY_FIELDS },
  });
}

/**
 * The state to reopen this document from, if its text is unchanged since it was saved
 * (history positions would not map onto other text). Never deletes: StrictMode reads twice.
 */
function savedEditorState(loadId: string, content: string): SavedState | undefined {
  const saved = states.get(loadId);

  return saved?.doc === content ? saved.initialState : undefined;
}

/**
 * For a CodeMirror editor of the active tab, mounted once per loaded document: returns the
 * `initialState` to open it with, and saves the view's state when the editor unmounts.
 */
export function usePreservedEditorState(content: string, view: EditorView | null): SavedState | undefined {
  // EditorContainer keys the editors by loadId, so it is fixed per mount
  const [loadId] = useState(() => selectActiveTab(useTabsStore.getState())?.loadId);
  // Read once: @uiw/react-codemirror only uses it when it creates the state
  const [initialState] = useState(() => (loadId ? savedEditorState(loadId, content) : undefined));

  // view.state stays readable after the view is destroyed, so cleanup order does not matter
  useEffect(() => {
    if (!view || !loadId) return;

    return () => saveEditorState(loadId, view.state);
  }, [view, loadId]);

  return initialState;
}
