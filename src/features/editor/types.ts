import type { SearchEngine } from '@/features/find-replace/engine';

/** Formatting actions shared by the toolbar, shortcuts and both editors */
export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'image'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'ul'
  | 'ol'
  | 'checkbox'
  | 'quote'
  | 'hr'
  | 'table'
  | 'codeblock';

/** The on/off formats of FormatState, which the editors set from marks and syntax nodes */
export type FormatFlag = 'bold' | 'italic' | 'strikethrough' | 'code' | 'link';

/** What applies at the cursor, so the toolbar can show it */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
  /** 0 = body text, 1-6 = heading level */
  heading: number;
  list: 'ul' | 'ol' | 'checkbox' | null;
  quote: boolean;
}

export const EMPTY_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  link: false,
  heading: 0,
  list: null,
  quote: false,
};

export function sameFormatState(a: FormatState, b: FormatState): boolean {
  // SAFETY: format states are copies of EMPTY_FORMAT_STATE, so their keys are exactly keyof FormatState.
  return (Object.keys(a) as (keyof FormatState)[]).every((key) => a[key] === b[key]);
}

/** What an editor exposes to the shared toolbar */
export interface EditorCommands {
  run: (action: MarkdownAction) => void;
  /** Drives the shared Find bar */
  search: SearchEngine;
  /** Inserts a markdown snippet (e.g. a fenced Mermaid block) at the cursor */
  insert: (markdown: string) => void;
  /** Puts keyboard focus back in the document, e.g. after a toolbar menu closes */
  focus: () => void;
  /** Writes any edit the editor still holds into the tabs store, synchronously. Called before the store's text or dirty state is read (save, export, close). */
  flush: () => void;
}
