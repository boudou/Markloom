// CodeMirror theme drawn from the app's CSS variables (see src/styles/globals.css), so it follows
// the `dark` class on <html> with no reconfigure: the document and undo history are untouched.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const ink = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  muted: 'var(--text-muted)',
  accent: 'var(--accent-hover)',
  accentMuted: 'var(--accent-muted)',
  // Code (inline and fenced) in slate: readable without shouting over long diagram blocks
  code: 'var(--code-text)',
  wash: 'var(--wash)',
  rule: 'var(--rule)',
};

export const markloomEditorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: ink.primary,
    },
    '.cm-scroller': {
      fontFamily: '"IBM Plex Mono", Consolas, monospace',
      fontSize: '14px',
      lineHeight: '1.75',
    },
    '.cm-content': {
      padding: '1.25rem 0 40vh',
      caretColor: ink.accent,
    },
    '.cm-line': {
      padding: '0 1.25rem 0 1rem',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
      color: ink.muted,
    },
    // CodeMirror's default grey fails AA contrast on the active-line wash
    '.cm-placeholder': {
      color: ink.muted,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 0.5rem 0 1rem',
      fontSize: '12px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: ink.primary,
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--active-line)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: ink.accent,
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: `${ink.accentMuted} !important`,
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--find-match-bg)',
      outline: '1px solid var(--find-current-ring)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--find-current-bg)',
    },
    '.cm-selectionMatch': {
      backgroundColor: ink.wash,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: ink.wash,
      border: `1px solid ${ink.rule}`,
      color: ink.muted,
    },
  }
);

// Markdown syntax: content stays near-black; the markup recedes so the words lead.
export const markloomHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: ink.primary, fontWeight: '700' },
    { tag: t.heading1, color: ink.primary, fontWeight: '700' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: [t.link, t.url], color: ink.accent },
    { tag: t.monospace, color: ink.code },
    { tag: t.quote, color: ink.secondary, fontStyle: 'italic' },
    { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: ink.muted },
    { tag: t.comment, color: ink.muted, fontStyle: 'italic' },
    { tag: [t.keyword, t.atom, t.bool], color: 'var(--syntax-keyword)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
    { tag: t.number, color: 'var(--syntax-number)' },
  ])
);
