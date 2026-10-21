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

export type AppDialog = 'export' | 'shortcuts' | 'templates' | 'palette' | null;

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

  // A 1-based source line asked for from outside the editor (Export's "Show");
  // the Markdown view takes it once its editor exists, then clears it
  lineRequest: number | null;
  navigateToLine: (line: number) => void;
  clearLineRequest: () => void;

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
  navigateToLine: (lineRequest) => set({ lineRequest }),
  clearLineRequest: () => set({ lineRequest: null }),

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
