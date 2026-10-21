// Single source of truth for app-level commands: the global key handler and the command
// palette both read this table. Formatting commands live in the editors themselves.
import { useTabsStore } from '@/features/tabs';
import { useFindReplaceStore } from '@/features/find-replace';
import { toggleAutoSave } from '@/features/auto-save';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { newDocument, openFile, openFolder, requestCloseTabs, saveActiveTab } from './documentActions';
import { SHORTCUTS, matchesCombo, type ShortcutId } from './shortcuts';

export interface AppCommand {
  id: string;
  group: 'File' | 'View' | 'Edit' | 'Help';
  /** The command's name in the palette */
  label: string;
  /** Toggles: what running it does right now ("Switch to Rich text"); read when the palette opens */
  stateLabel?: () => string;
  shortcut?: ShortcutId;
  /** Offered, in the palette and by its key, only while this holds */
  when?: () => boolean;
  /** Reached by its key only; the palette doesn't list it */
  keyOnly?: true;
  run: () => void;
}

// Array order is palette order; keep each group together (the palette heads each run of a group)
export const APP_COMMANDS: readonly AppCommand[] = [
  { id: 'new', group: 'File', label: 'New document', shortcut: 'newDocument', run: newDocument },
  { id: 'open', group: 'File', label: 'Open file…', shortcut: 'openFile', run: () => void openFile() },
  { id: 'open-folder', group: 'File', label: 'Open folder…', shortcut: 'openFolder', run: () => void openFolder() },
  { id: 'save', group: 'File', label: 'Save', shortcut: 'save', run: () => void saveActiveTab() },
  { id: 'save-as', group: 'File', label: 'Save as…', shortcut: 'saveAs', run: () => void saveActiveTab({ saveAs: true }) },
  {
    id: 'auto-save',
    group: 'File',
    label: 'Auto-save',
    stateLabel: () => (useSettingsStore.getState().autoSave ? 'Turn off auto-save' : 'Turn on auto-save'),
    run: toggleAutoSave,
  },
  { id: 'export', group: 'File', label: 'Export…', shortcut: 'export', run: () => useUiStore.getState().openDialog('export') },
  { id: 'templates', group: 'File', label: 'New from template…', run: () => useUiStore.getState().openDialog('templates') },
  {
    id: 'close-tab',
    group: 'File',
    label: 'Close tab',
    shortcut: 'closeTab',
    run: () => {
      const { activeTabId } = useTabsStore.getState();

      if (activeTabId) requestCloseTabs([activeTabId]);
    },
  },
  {
    id: 'mode',
    group: 'View',
    label: 'Switch Markdown / Rich text',
    stateLabel: () => (useAppStore.getState().editorMode === 'split' ? 'Switch to Rich text' : 'Switch to Markdown'),
    shortcut: 'toggleMode',
    run: () => {
      const app = useAppStore.getState();
      app.setEditorMode(app.editorMode === 'split' ? 'wysiwyg' : 'split');
    },
  },
  {
    id: 'outline',
    group: 'View',
    label: 'Show or hide contents (outline)',
    stateLabel: () => {
      const { sidebarOpen, sidebarView } = useAppStore.getState();

      return sidebarOpen && sidebarView === 'outline' ? 'Hide contents' : 'Show contents (outline)';
    },
    shortcut: 'toggleOutline',
    run: () => useAppStore.getState().toggleSidebarView('outline'),
  },
  {
    id: 'files',
    group: 'View',
    label: 'Show or hide files',
    when: () => !!useAppStore.getState().rootPath,
    run: () => useAppStore.getState().toggleSidebarView('files'),
  },
  { id: 'sidebar', group: 'View', label: 'Show or hide sidebar', shortcut: 'toggleSidebar', run: () => useAppStore.getState().toggleSidebar() },
  { id: 'history', group: 'View', label: 'Version history', shortcut: 'versionHistory', run: () => useUiStore.getState().setHistoryOpen(true) },
  {
    id: 'find',
    group: 'Edit',
    label: 'Find',
    shortcut: 'find',
    // Keeps the replace row the way the user left it
    run: () => {
      const find = useFindReplaceStore.getState();
      find.open(find.showReplace);
    },
  },
  { id: 'replace', group: 'Edit', label: 'Find and replace', shortcut: 'replace', run: () => useFindReplaceStore.getState().open(true) },
  { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', shortcut: 'showShortcuts', run: () => useUiStore.getState().openDialog('shortcuts') },
  { id: 'palette', group: 'Help', label: 'Command palette', shortcut: 'commandPalette', keyOnly: true, run: () => useUiStore.getState().openDialog('palette') },
];

export function isOffered(command: AppCommand): boolean {
  return command.when?.() ?? true;
}

/** The command a key press runs, if any */
export function commandForKey(event: KeyboardEvent): AppCommand | undefined {
  return APP_COMMANDS.find(
    (command) => command.shortcut !== undefined && matchesCombo(event, SHORTCUTS[command.shortcut].combo) && isOffered(command)
  );
}
