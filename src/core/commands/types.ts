export interface Command {
  id: string;
  name: string;
  description?: string;
  shortcut?: string;
  category: CommandCategory;
  action: () => void;
  when?: () => boolean;
}

export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'insert'
  | 'format'
  | 'navigation'
  | 'help'
  | 'other';

export interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

// Shortcut display mapping
export const KEY_DISPLAY_MAP: Record<string, string> = {
  ArrowUp: '\u2191',
  ArrowDown: '\u2193',
  ArrowLeft: '\u2190',
  ArrowRight: '\u2192',
  Enter: '\u21B5',
  Escape: 'Esc',
  Backspace: '\u232B',
  Delete: 'Del',
  Tab: '\u21B9',
  ' ': 'Space',
};

export const MODIFIER_DISPLAY = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: navigator.platform.includes('Mac') ? '\u2318' : 'Win',
};
