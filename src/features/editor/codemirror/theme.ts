// Light CodeMirror theme drawn from the app's tokens (see src/styles/globals.css).
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const ink = {
  primary: '#1A1A1A',
  secondary: '#5A5A5A',
  muted: '#626977',
  accent: '#1D4ED8',
  accentMuted: '#DBEAFE',
  // Code (inline and fenced) in slate: readable without shouting over long diagram blocks
  code: '#475569',
  wash: '#F1F3F5',
  rule: '#E9ECEF',
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
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 0.5rem 0 1rem',
      fontSize: '12px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: ink.primary,
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(241, 243, 245, 0.7)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: ink.accent,
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: `${ink.accentMuted} !important`,
    },
    '.cm-searchMatch': {
      backgroundColor: '#FEF3C7',
      outline: '1px solid #F59E0B',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#FDE68A',
    },
    '.cm-selectionMatch': {
      backgroundColor: ink.wash,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: ink.wash,
      border: `1px solid ${ink.rule}`,
      color: ink.muted,
    },
  },
  { dark: false }
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
    { tag: [t.keyword, t.atom, t.bool], color: '#7C3AED' },
    { tag: [t.string, t.special(t.string)], color: '#15803D' },
    { tag: t.number, color: '#B45309' },
  ])
);
