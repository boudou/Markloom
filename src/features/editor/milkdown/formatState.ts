// Which formats apply at the cursor in the rich-text editor (for the toolbar).
import type { EditorState } from '@milkdown/kit/prose/state';
import { EMPTY_FORMAT_STATE, type FormatFlag, type FormatState } from '../types';

const MARKS: Record<string, FormatFlag> = {
  strong: 'bold',
  emphasis: 'italic',
  strike_through: 'strikethrough',
  inlineCode: 'code',
  link: 'link',
};

export function richFormatState(state: EditorState): FormatState {
  const result: FormatState = { ...EMPTY_FORMAT_STATE };
  const { $from } = state.selection;

  for (const mark of state.storedMarks ?? $from.marks()) {
    const flag = MARKS[mark.type.name];

    if (flag) result[flag] = true;
  }

  if ($from.parent.type.name === 'heading') {
    // SAFETY: the heading node schema declares `level` as a number attribute.
    result.heading = $from.parent.attrs.level as number;
  }

  // Innermost list wins: a task item inside a numbered list is a task
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const name = node.type.name;

    if (name === 'blockquote') result.quote = true;

    if (result.list) continue;

    if (name === 'list_item' && node.attrs.checked != null) result.list = 'checkbox';
    else if (name === 'bullet_list') result.list = 'ul';
    else if (name === 'ordered_list') result.list = 'ol';
  }

  return result;
}
