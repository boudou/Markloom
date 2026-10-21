// Single source of truth for keyboard shortcuts: the Shortcuts window, tooltips and
// the global key handler all read from here, so what we advertise is what works.

const platform = typeof navigator !== 'undefined' ? navigator.platform : '';

export const isMac = /Mac|iPhone|iPad/.test(platform);

// The browser keeps some combinations for itself (Ctrl+N, Ctrl+T, Ctrl+W); the desktop app does not.
export const isDesktop = typeof window !== 'undefined' && !!window.markloomDesktop;

export type ShortcutId =
  | 'newDocument'
  | 'openFile'
  | 'openFolder'
  | 'save'
  | 'saveAs'
  | 'closeTab'
  | 'export'
  | 'toggleSidebar'
  | 'showShortcuts'
  | 'undo'
  | 'redo'
  | 'find'
  | 'replace'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'taskList'
  | 'toggleTask'
  | 'codeBlock'
  | 'commandPalette'
  | 'toggleMode'
  | 'toggleOutline'
  | 'versionHistory';

interface ShortcutDef {
  label: string;
  group: 'File' | 'Edit' | 'Format' | 'View';
  /** CodeMirror-style combo: Mod = Ctrl (Cmd on macOS) */
  combo: string;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  newDocument: { label: 'New document', group: 'File', combo: isDesktop ? 'Mod-n' : 'Alt-n' },
  openFile: { label: 'Open file', group: 'File', combo: 'Mod-o' },
  openFolder: { label: 'Open folder', group: 'File', combo: 'Mod-Shift-o' },
  save: { label: 'Save', group: 'File', combo: 'Mod-s' },
  saveAs: { label: 'Save as…', group: 'File', combo: 'Mod-Shift-s' },
  closeTab: { label: 'Close tab', group: 'File', combo: isDesktop ? 'Mod-w' : 'Alt-w' },
  export: { label: 'Export', group: 'File', combo: 'Mod-e' },

  undo: { label: 'Undo', group: 'Edit', combo: 'Mod-z' },
  redo: { label: 'Redo', group: 'Edit', combo: 'Mod-Shift-z' },
  find: { label: 'Find', group: 'Edit', combo: 'Mod-f' },
  replace: { label: 'Find and replace', group: 'Edit', combo: 'Mod-h' },

  bold: { label: 'Bold', group: 'Format', combo: 'Mod-b' },
  italic: { label: 'Italic', group: 'Format', combo: 'Mod-i' },
  strikethrough: { label: 'Strikethrough', group: 'Format', combo: 'Mod-Alt-x' },
  inlineCode: { label: 'Inline code', group: 'Format', combo: 'Mod-`' },
  link: { label: 'Link', group: 'Format', combo: 'Mod-k' },
  heading1: { label: 'Heading 1', group: 'Format', combo: 'Mod-Alt-1' },
  heading2: { label: 'Heading 2', group: 'Format', combo: 'Mod-Alt-2' },
  heading3: { label: 'Heading 3', group: 'Format', combo: 'Mod-Alt-3' },
  bulletList: { label: 'Bulleted list', group: 'Format', combo: 'Mod-Alt-8' },
  orderedList: { label: 'Numbered list', group: 'Format', combo: 'Mod-Alt-7' },
  blockquote: { label: 'Quote', group: 'Format', combo: 'Mod-Shift-b' },
  taskList: { label: 'Task list', group: 'Format', combo: 'Mod-Alt-9' },
  toggleTask: { label: 'Tick or untick a task', group: 'Format', combo: 'Mod-Enter' },
  codeBlock: { label: 'Code block', group: 'Format', combo: 'Mod-Alt-c' },

  commandPalette: { label: 'Command palette', group: 'View', combo: 'Mod-Shift-p' },
  toggleMode: { label: 'Switch Markdown / Rich text', group: 'View', combo: 'Mod-Shift-m' },
  toggleOutline: { label: 'Show or hide contents (outline)', group: 'View', combo: 'Mod-Shift-l' },
  versionHistory: { label: 'Version history', group: 'View', combo: 'Mod-Shift-h' },
  toggleSidebar: { label: 'Show or hide sidebar', group: 'View', combo: 'Mod-\\' },
  showShortcuts: { label: 'Keyboard shortcuts', group: 'View', combo: 'Mod-/' },
};

const KEY_NAMES: Record<string, string> = {
  Mod: isMac ? '⌘' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: isMac ? '⇧' : 'Shift',
  Enter: isMac ? '↩' : 'Enter',
};

// One name per key, e.g. ["Ctrl", "Shift", "O"] or ["⌘", "⇧", "O"]. Splitting on "-" holds
// while no combo uses "-" as its key; a "Mod--" combo would need a different split.
export function shortcutParts(id: ShortcutId): string[] {
  return SHORTCUTS[id].combo.split('-').map((part) => KEY_NAMES[part] ?? part.toUpperCase());
}

/** Human-readable keys, e.g. "Ctrl+Shift+O" or "⌘⇧O" */
export function shortcutKeys(id: ShortcutId): string {
  return shortcutParts(id).join(isMac ? '' : '+');
}

const KEY_WORDS = new Map([
  ['Mod', isMac ? 'cmd command' : 'ctrl'],
  ['Alt', isMac ? 'option alt' : 'alt'],
]);

/** Plain key names for search, e.g. "cmd command enter": macOS shows "Enter" as "↩" */
export function shortcutWords(id: ShortcutId): string {
  return SHORTCUTS[id].combo
    .split('-')
    .map((part) => KEY_WORDS.get(part) ?? part.toLowerCase())
    .join(' ');
}

/** "Bold (Ctrl+B)" for tooltips */
export function shortcutHint(label: string, id?: ShortcutId): string {
  return id ? `${label} (${shortcutKeys(id)})` : label;
}

/** Does a keyboard event match a combo like "Mod-Shift-o"? */
export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('-');
  const key = parts[parts.length - 1].toLowerCase();
  const wantMod = parts.includes('Mod');
  const wantAlt = parts.includes('Alt');
  const wantShift = parts.includes('Shift');
  const mod = isMac ? event.metaKey : event.ctrlKey;

  // event.code keeps Alt/Shift combinations layout-independent (Alt+N types "ñ" on macOS)
  const pressed =
    event.code.startsWith('Key') ? event.code.slice(3).toLowerCase()
    : event.code.startsWith('Digit') ? event.code.slice(5)
    : event.key.toLowerCase();

  return (
    pressed === key &&
    mod === wantMod &&
    event.altKey === wantAlt &&
    event.shiftKey === wantShift
  );
}
