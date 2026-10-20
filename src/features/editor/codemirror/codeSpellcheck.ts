// Identifiers aren't misspellings: turn the spell checker off inside code in the source editor.
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

const noSpellLine = Decoration.line({ attributes: { spellcheck: 'false' } });
const noSpellInline = Decoration.mark({ attributes: { spellcheck: 'false' } });

function build(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
          for (let pos = node.from; pos <= node.to; ) {
            const line = view.state.doc.lineAt(pos);
            ranges.push({ from: line.from, to: line.from, deco: noSpellLine });
            pos = line.to + 1;
          }
          return false;
        }
        if (node.name === 'InlineCode') {
          ranges.push({ from: node.from, to: node.to, deco: noSpellInline });
          return false;
        }
        return undefined;
      },
    });
  }
  // RangeSetBuilder needs ranges in order, line decorations before marks at the same position
  ranges.sort((a, b) => a.from - b.from || (a.deco === noSpellLine ? -1 : 1));
  const builder = new RangeSetBuilder<Decoration>();
  let lastLine = -1;
  for (const r of ranges) {
    if (r.deco === noSpellLine) {
      if (r.from === lastLine) continue;
      lastLine = r.from;
    }
    builder.add(r.from, r.to, r.deco);
  }
  return builder.finish();
}

export const codeSpellcheck = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);
