// Marks source lines where a Mermaid diagram failed to parse (reported by the preview).
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export const setDiagramErrorLines = StateEffect.define<number[]>();

const errorLine = Decoration.line({
  attributes: { class: 'cm-diagram-error-line', title: 'Diagram error on this line' },
});

export const diagramErrorLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setDiagramErrorLines)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const lines = [...new Set(effect.value)].filter((n) => n >= 1 && n <= tr.state.doc.lines).sort((a, b) => a - b);

      for (const n of lines) {
        const line = tr.state.doc.line(n);
        builder.add(line.from, line.from, errorLine);
      }

      return builder.finish();
    }

    // Keep marks attached to their text while the user edits
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const diagramErrorTheme = EditorView.baseTheme({
  '.cm-diagram-error-line': {
    backgroundColor: '#FEF2F2',
    boxShadow: 'inset 2px 0 0 #DC2626',
    textDecoration: 'underline wavy #DC2626',
    textDecorationSkipInk: 'none',
    textUnderlineOffset: '3px',
  },
});
