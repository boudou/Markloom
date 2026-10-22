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
  | 'quickOpen'
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
  | 'searchFolder'
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
  | 'toggleFocus'
  | 'versionHistory';

export type ShortcutGroup = 'File' | 'Edit' | 'Format' | 'View';

interface ShortcutDef {
  label: string;
  group: ShortcutGroup;
  /** CodeMirror-style combo: Mod = Ctrl (Cmd on macOS) */
  combo: string;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  newDocument: { label: 'New document', group: 'File', combo: isDesktop ? 'Mod-n' : 'Alt-n' },
  openFile: { label: 'Open file…', group: 'File', combo: 'Mod-o' },
  openFolder: { label: 'Open folder…', group: 'File', combo: 'Mod-Shift-o' },
  quickOpen: { label: 'Quick open…', group: 'File', combo: 'Mod-p' },
  save: { label: 'Save', group: 'File', combo: 'Mod-s' },
  saveAs: { label: 'Save as…', group: 'File', combo: 'Mod-Shift-s' },
  closeTab: { label: 'Close tab', group: 'File', combo: isDesktop ? 'Mod-w' : 'Alt-w' },
  export: { label: 'Export…', group: 'File', combo: 'Mod-e' },

  undo: { label: 'Undo', group: 'Edit', combo: 'Mod-z' },
  redo: { label: 'Redo', group: 'Edit', combo: 'Mod-Shift-z' },
  find: { label: 'Find', group: 'Edit', combo: 'Mod-f' },
  replace: { label: 'Find and replace', group: 'Edit', combo: 'Mod-h' },
  searchFolder: { label: 'Search in folder', group: 'Edit', combo: 'Mod-Shift-f' },

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
  toggleFocus: { label: 'Focus mode', group: 'View', combo: 'Mod-Shift-Enter' },
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

/** Spoken names for screen readers, e.g. "Command+Shift+P": glyphs like ⌘ are announced inconsistently */
const KEY_LABELS = new Map([
  ['Mod', isMac ? 'Command' : 'Ctrl'],
  ['Alt', isMac ? 'Option' : 'Alt'],
  ['Shift', 'Shift'],
  ['Enter', isMac ? 'Return' : 'Enter'],
  ['`', 'Backtick'],
  ['\\', 'Backslash'],
  ['/', 'Slash'],
]);

const MODIFIERS = ['Mod', 'Alt', 'Shift'] as const;

type Modifier = (typeof MODIFIERS)[number];

function isModifier(part: string): part is Modifier {
  return MODIFIERS.some((modifier) => modifier === part);
}

/** Split a combo like "Mod-Shift-o" into its modifiers (in written order) and key; "Mod--" has key "-" */
export function parseCombo(combo: string) {
  const cut = combo.lastIndexOf('-', combo.length - 2);
  const key = combo.slice(cut + 1);

  const mods = cut < 0 ? [] : combo.slice(0, cut).split('-').map((part) => {
    if (!isModifier(part)) throw new Error(`Unknown modifier "${part}" in shortcut "${combo}"`);

    return part;
  });

  return { mods, key };
}

function comboParts(id: ShortcutId): string[] {
  const { mods, key } = parseCombo(SHORTCUTS[id].combo);

  return [...mods, key];
}

/** One name per key, e.g. ["Ctrl", "Shift", "O"] or ["⌘", "⇧", "O"] */
export function shortcutParts(id: ShortcutId): string[] {
  return comboParts(id).map((part) => KEY_NAMES[part] ?? part.toUpperCase());
}

/** Spoken keys for assistive tech, e.g. "Ctrl+Shift+P" or "Command+Shift+P" */
export function shortcutSpokenKeys(id: ShortcutId): string {
  return comboParts(id)
    .map((part) => KEY_LABELS.get(part) ??part.toUpperCase())
    .join('+');
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
  return comboParts(id)
    .map((part) => KEY_WORDS.get(part) ?? part.toLowerCase())
    .join(' ');
}

/** "Bold (Ctrl+B)" for tooltips */
export function shortcutHint(label: string, id?: ShortcutId): string {
  return id ? `${label} (${shortcutKeys(id)})` : label;
}

/** Does a keyboard event match a combo like "Mod-Shift-o"? */
export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const { mods, key } = parseCombo(combo);
  const wantMod = mods.includes('Mod');
  const wantAlt = mods.includes('Alt');
  const wantShift = mods.includes('Shift');
  const mod = isMac ? event.metaKey : event.ctrlKey;

  // event.code keeps Alt/Shift combinations layout-independent (Alt+N types "ñ" on macOS)
  const pressed =
    event.code.startsWith('Key') ? event.code.slice(3).toLowerCase()
    : event.code.startsWith('Digit') ? event.code.slice(5)
    : event.key.toLowerCase();

  return (
    pressed === key.toLowerCase() &&
    mod === wantMod &&
    event.altKey === wantAlt &&
    event.shiftKey === wantShift
  );
}
