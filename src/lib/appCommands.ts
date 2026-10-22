// Single source of truth for app-level commands: the global key handler, the command palette
// and the title bar read this table; a command with a key takes its name and group from SHORTCUTS.
// Formatting commands live in the editors themselves.
import { selectActiveContent, selectActiveTab, useTabsStore } from '@/features/tabs';
import { useFindReplaceStore } from '@/features/find-replace';
import { toggleAutoSave } from '@/features/auto-save';
// The store only: the panel itself is a lazy chunk, loaded by the sidebar
import { useFolderSearchStore } from '@/features/folder-search/stores/folderSearchStore';
import { useAppStore } from '@/stores/appStore';
import { PAGE_WIDTHS, useSettingsStore } from '@/stores/settingsStore';
import { flushEditorEdits, notify, useUiStore } from '@/stores/uiStore';
import { newDocument, openFile, openFolder, requestCloseTabs, saveActiveTab } from './documentActions';
import { SHORTCUTS, matchesCombo, shortcutHint, type ShortcutGroup, type ShortcutId } from './shortcuts';
import { errorMessage } from './utils';

/**
 * Copies the editor's selection, or else the whole document, as HTML plus its Markdown.
 * The write starts synchronously: Safari and Firefox allow it only during the click's (or
 * Enter's) user activation, so the slow rendering is a promise inside the ClipboardItem.
 */
function copyAsRichText() {
  const commands = useUiStore.getState().editorCommands;

  if (!commands) return;

  flushEditorEdits();
  const selection = commands.selectionMarkdown();
  const tabs = useTabsStore.getState();
  const markdown = selection || selectActiveContent(tabs);
  const docPath = selectActiveTab(tabs)?.path ?? null;

  if (!/\S/.test(markdown)) {
    notify({ tone: 'info', title: 'Nothing to copy' });

    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    notify({ tone: 'error', title: 'This browser can’t copy formatted text' });

    return;
  }

  // A dynamic import: the renderer pulls in the export pipeline and Mermaid
  const html = import('@/features/export/pipeline/clipboard')
    .then(({ clipboardHtml }) => clipboardHtml(markdown, docPath))
    .then((body) => new Blob([body], { type: 'text/html' }));

  const item = new ClipboardItem({ 'text/html': html, 'text/plain': new Blob([markdown], { type: 'text/plain' }) });

  navigator.clipboard.write([item]).then(
    () => notify({ tone: 'success', title: selection ? 'Copied the selection as rich text' : 'Copied as rich text' }),
    (error) => notify({ tone: 'error', title: 'Could not copy', detail: errorMessage(error) })
  );
}

interface CommandBase {
  id: string;
  /** Offered, in the palette and by its key, only while this holds */
  when?: () => boolean;
  run: () => void;
}

/** Has a key: named and grouped by its SHORTCUTS entry */
interface KeyCommand extends CommandBase {
  shortcut: ShortcutId;
  /** Toggles: what running it does right now ("Switch to Rich text"), in place of the key's name */
  label?: () => string;
}

/** No key: names and groups itself; the label is read when the palette opens or the title bar renders */
interface PlainCommand extends CommandBase {
  shortcut?: undefined;
  group: ShortcutGroup;
  label: () => string;
}

export type AppCommand = KeyCommand | PlainCommand;

// Array order is palette order; keep each group together (the palette heads each run of a group)
export const APP_COMMANDS: readonly AppCommand[] = [
  { id: 'new', shortcut: 'newDocument', run: newDocument },
  { id: 'open', shortcut: 'openFile', run: () => void openFile() },
  { id: 'open-folder', shortcut: 'openFolder', run: () => void openFolder() },
  // No `when`: the key must always be taken, or the browser prints. Quick open says when no folder is open.
  { id: 'quick-open', shortcut: 'quickOpen', run: () => useUiStore.getState().openDialog('quickOpen') },
  { id: 'save', shortcut: 'save', run: () => void saveActiveTab() },
  { id: 'save-as', shortcut: 'saveAs', run: () => void saveActiveTab({ saveAs: true }) },
  {
    id: 'auto-save',
    group: 'File',
    label: () => (useSettingsStore.getState().autoSave ? 'Turn off auto-save' : 'Turn on auto-save'),
    run: toggleAutoSave,
  },
  { id: 'export', shortcut: 'export', run: () => useUiStore.getState().openDialog('export') },
  // No key: Ctrl+Shift+C opens the browser's element inspector. Not for .mmd files, which publish no editor commands.
  {
    id: 'copy-rich',
    group: 'File',
    label: () => 'Copy as rich text',
    when: () => !!useUiStore.getState().editorCommands,
    run: copyAsRichText,
  },
  { id: 'templates', group: 'File', label: () => 'New from template…', run: () => useUiStore.getState().openDialog('templates') },
  {
    id: 'close-tab',
    shortcut: 'closeTab',
    run: () => {
      const { activeTabId } = useTabsStore.getState();

      if (activeTabId) requestCloseTabs([activeTabId]);
    },
  },
  {
    id: 'mode',
    shortcut: 'toggleMode',
    label: () => (useAppStore.getState().editorMode === 'split' ? 'Switch to Rich text' : 'Switch to Markdown'),
    run: () => {
      const app = useAppStore.getState();
      app.setEditorMode(app.editorMode === 'split' ? 'wysiwyg' : 'split');
    },
  },
  ...PAGE_WIDTHS.map(
    ({ value, label }): AppCommand => ({
      id: `page-width-${value}`,
      group: 'View',
      label: () => `Page width: ${label}`,
      run: () => useSettingsStore.getState().setPageWidth(value),
    })
  ),
  {
    id: 'outline',
    shortcut: 'toggleOutline',
    label: () => {
      const { sidebarOpen, sidebarView } = useAppStore.getState();

      return sidebarOpen && sidebarView === 'outline' ? 'Hide contents' : 'Show contents';
    },
    run: () => useAppStore.getState().toggleSidebarView('outline'),
  },
  {
    id: 'files',
    group: 'View',
    label: () => {
      const { sidebarOpen, sidebarView } = useAppStore.getState();

      return sidebarOpen && sidebarView === 'files' ? 'Hide files' : 'Show files';
    },
    when: () => !!useAppStore.getState().rootPath,
    run: () => useAppStore.getState().toggleSidebarView('files'),
  },
  {
    id: 'focus',
    shortcut: 'toggleFocus',
    label: () => (useAppStore.getState().focusMode ? 'Leave focus mode' : 'Focus mode'),
    run: () => useAppStore.getState().toggleFocusMode(),
  },
  { id: 'sidebar', shortcut: 'toggleSidebar', run: () => useAppStore.getState().toggleSidebar() },
  // Its panel is anchored in the title bar, which focus mode hides
  {
    id: 'history',
    shortcut: 'versionHistory',
    when: () => !useAppStore.getState().focusMode,
    run: () => useUiStore.getState().setHistoryOpen(true),
  },
  { id: 'shortcuts', shortcut: 'showShortcuts', run: () => useUiStore.getState().openDialog('shortcuts') },
  { id: 'palette', shortcut: 'commandPalette', run: () => useUiStore.getState().openDialog('palette') },
  {
    id: 'find',
    shortcut: 'find',
    // Keeps the replace row the way the user left it
    run: () => {
      const find = useFindReplaceStore.getState();
      find.open(find.showReplace);
    },
  },
  { id: 'replace', shortcut: 'replace', run: () => useFindReplaceStore.getState().open(true) },
  {
    id: 'search-folder',
    shortcut: 'searchFolder',
    when: () => !!useAppStore.getState().rootPath,
    run: () => {
      useAppStore.getState().showSidebarView('search');
      useFolderSearchStore.getState().requestFocus();
    },
  },
];

export function commandLabel(command: AppCommand): string {
  if (command.shortcut === undefined) return command.label();

  return command.label?.() ?? SHORTCUTS[command.shortcut].label;
}

export function commandGroup(command: AppCommand): ShortcutGroup {
  return command.shortcut === undefined ? command.group : SHORTCUTS[command.shortcut].group;
}

/** Tooltip text, e.g. "Save (Ctrl+S)" */
export function commandHint(command: AppCommand): string {
  return shortcutHint(commandLabel(command), command.shortcut);
}

/** Ids are literals in the table, so a typo throws as soon as the module that asks loads */
export function appCommand(id: string): AppCommand {
  const command = APP_COMMANDS.find((c) => c.id === id);

  if (!command) throw new Error(`Unknown app command "${id}"`);

  return command;
}

export function isOffered(command: AppCommand): boolean {
  return command.when?.() ?? true;
}

/** The command a key press runs, if any */
export function commandForKey(event: KeyboardEvent): AppCommand | undefined {
  return APP_COMMANDS.find(
    (command) => command.shortcut !== undefined && matchesCombo(event, SHORTCUTS[command.shortcut].combo) && isOffered(command)
  );
}
