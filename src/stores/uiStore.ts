import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { EditorCommands } from '@/features/editor/types';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
}

export interface LineRequest {
  tabId: string;
  line: number;
  kind: 'reveal' | 'cursor';
}

export type AppDialog = 'export' | 'shortcuts' | 'templates' | 'settings' | 'whatsNew' | 'palette' | 'quickOpen' | null;

interface UiState {
  // Modal dialogs
  dialog: AppDialog;
  openDialog: (dialog: Exclude<AppDialog, null>) => void;
  closeDialog: () => void;

  // Version history popover (opened from the title bar, palette or shortcut)
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;

  // The active editor's formatting commands, for the command palette
  editorCommands: EditorCommands | null;
  setEditorCommands: (commands: EditorCommands | null) => void;

  // A 1-based source line for the editor showing a tab. 'reveal' scrolls there and focuses the
  // editor (search results, "Show line N", Export's "Show"); 'cursor' only moves the cursor
  // (a Contents click, where the rendered document scrolls itself). Every editor acts on it: the
  // Markdown and .mmd sources at the line (codemirror/useLineRequest.ts), rich text at the line's
  // block (milkdown/lineRequest.ts). Stamped with its tab: the editor showing another tab drops
  // it, so it never lands in a different document.
  lineRequest: LineRequest | null;
  navigateToLine: (tabId: string, line: number) => void;
  placeCursorAtLine: (tabId: string, line: number) => void;
  clearLineRequest: () => void;

  // A tab whose editor should take the keyboard focus once it shows (a template was just
  // applied). Consumed like lineRequest: by the editor of that tab, dropped by any other.
  editorFocusRequest: string | null;
  requestEditorFocus: (tabId: string) => void;
  clearEditorFocusRequest: () => void;

  // Tabs waiting on a "save changes?" decision before they close
  pendingClose: string[] | null;
  setPendingClose: (tabIds: string[] | null) => void;

  // Transient notifications
  toasts: Toast[];
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const TOAST_DURATION: Record<ToastTone, number> = {
  success: 2500,
  info: 4000,
  error: 9000,
};

export const useUiStore = create<UiState>()((set, get) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  historyOpen: false,
  setHistoryOpen: (historyOpen) => set({ historyOpen }),

  editorCommands: null,
  setEditorCommands: (editorCommands) => set({ editorCommands }),

  lineRequest: null,
  navigateToLine: (tabId, line) => set({ lineRequest: { tabId, line, kind: 'reveal' } }),
  placeCursorAtLine: (tabId, line) => set({ lineRequest: { tabId, line, kind: 'cursor' } }),
  clearLineRequest: () => set({ lineRequest: null }),

  editorFocusRequest: null,
  requestEditorFocus: (editorFocusRequest) => set({ editorFocusRequest }),
  clearEditorFocusRequest: () => set({ editorFocusRequest: null }),

  pendingClose: null,
  setPendingClose: (pendingClose) => set({ pendingClose }),

  toasts: [],
  notify: (toast) => {
    const id = nanoid();
    // Keep the stack short; the newest message matters most
    set({ toasts: [...get().toasts.slice(-2), { ...toast, id }] });
    setTimeout(() => get().dismissToast(id), TOAST_DURATION[toast.tone]);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Shorthand for components and plain modules */
export const notify = (toast: Omit<Toast, 'id'>) => useUiStore.getState().notify(toast);

/** Writes the active editor's pending edits into the tabs store (see EditorCommands.flush) */
export function flushEditorEdits(): void {
  useUiStore.getState().editorCommands?.flush();
}
