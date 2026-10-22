// Reports which Markdown formats apply at the cursor in the source editor.
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { EMPTY_FORMAT_STATE, sameFormatState, type FormatFlag, type FormatState } from '../types';

const INLINE_NODES: Record<string, FormatFlag> = {
  StrongEmphasis: 'bold',
  Emphasis: 'italic',
  Strikethrough: 'strikethrough',
  InlineCode: 'code',
  Link: 'link',
};

export function sourceFormatState(state: EditorState): FormatState {
  const result: FormatState = { ...EMPTY_FORMAT_STATE };
  const head = state.selection.main.head;

  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(head, -1); node; node = node.parent) {
    const flag = INLINE_NODES[node.name];

    if (flag) result[flag] = true;

    if (node.name === 'Blockquote') result.quote = true;
  }

  const text = state.doc.lineAt(head).text;
  const heading = text.match(/^(#{1,6})\s/);

  if (heading) result.heading = heading[1].length;
  const body = text.replace(/^(\s*>\s?)+/, '');

  if (/^\s*[-*+]\s+\[[ xX]\]/.test(body)) result.list = 'checkbox';
  else if (/^\s*[-*+]\s/.test(body)) result.list = 'ul';
  else if (/^\s*\d+[.)]\s/.test(body)) result.list = 'ol';

  return result;
}

/** The selected source text, all ranges one per line; '' when nothing is selected */
export function selectedSource(state: EditorState): string {
  return state.selection.ranges.flatMap((range) => (range.empty ? [] : [state.sliceDoc(range.from, range.to)])).join('\n');
}

/** Reports the selected text (all ranges, one per line) for the selection count */
export function selectionReporter(report: (text: string) => void) {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    report(selectedSource(update.state));
  });
}

/** Calls `report` whenever the format at the cursor changes. */
export function formatStateReporter(report: (state: FormatState) => void) {
  let last = EMPTY_FORMAT_STATE;

  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged && !update.focusChanged) return;
    const next = sourceFormatState(update.state);

    if (!sameFormatState(next, last)) {
      last = next;
      report(next);
    }
  });
}
