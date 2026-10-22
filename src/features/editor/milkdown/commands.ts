// Markdown formatting for the rich-text editor: each toolbar, palette and shortcut
// action mapped to a Milkdown command. The rich-text twin of codemirror/commands.ts.
import { type CmdKey, type Editor, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node } from '@milkdown/kit/prose/model';
import { TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import {
  paragraphSchema,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand,
  insertImageCommand,
  toggleLinkCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand, createTable } from '@milkdown/kit/preset/gfm';
import { callCommand, insert } from '@milkdown/kit/utils';
import type { MarkdownAction } from '../types';

/** Asks the editor's host to open the link or image dialog */
export type LinkRequest = { kind: 'link' | 'image'; hasSelection: boolean };

type RichAction = (editor: Editor, requestLink: (request: LinkRequest) => void) => void;

function focusDocument(editor: Editor): void {
  editor.action((ctx) => ctx.get(editorViewCtx).focus());
}

// Takes the command plugin, not its key: Milkdown assigns `.key` only when the plugin
// registers with an editor, so reading it at module load gives undefined
function command<T>(cmd: { key: CmdKey<T> }, payload?: T): RichAction {
  return (editor) => {
    editor.action(callCommand(cmd.key, payload));
    focusDocument(editor);
  };
}

// Opens a dialog, which takes focus, so the document is not focused here
function askForLink(kind: LinkRequest['kind']): RichAction {
  return (editor, requestLink) => {
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    requestLink({ kind, hasSelection: !view.state.selection.empty });
  };
}

// The innermost list item around the cursor and its position
function listItemAtCursor(state: EditorState): { node: Node; pos: number } | null {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);

    if (node.type.name === 'list_item') return { node, pos: $from.before(depth) };
  }

  return null;
}

// GFM has no task-list command, only the "[ ] " input rule: a task is a list item
// with `checked` set. Wrap the block in a bullet list when it isn't in one, then mark
// the item as a task; on a task item, turn it back into a plain item (as the source
// editor's shortcut toggles its "- [ ] " prefix).
function toggleTaskItem(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);

  if (!listItemAtCursor(view.state)) ctx.get(commandsCtx).call(wrapInBulletListCommand.key);

  const item = listItemAtCursor(view.state);

  if (!item) return;

  const checked = item.node.attrs.checked == null ? false : null;

  view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked }));
}

// A 3×3 table after the top-level block at the cursor (a table, a whole list, a code block), or
// in place of an empty paragraph, with the cursor in an empty paragraph below it. Milkdown's own
// command puts the table at the cursor instead, splitting the block.
function insertTableAfterBlock(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { selection } = state;
  const { $from } = selection;
  const table = createTable(ctx, 3, 3);
  const paragraph = paragraphSchema.type(ctx);
  const isEmptyParagraph = (node: Node | null) => node !== null && node.type === paragraph && node.content.size === 0;
  const { tr } = state;
  let at: number;

  if ($from.depth === 0) {
    // A node selection of a top-level node, or select-all, has no block around it
    at = selection.to;
    tr.insert(at, table);
  } else if (isEmptyParagraph($from.node(1))) {
    at = $from.before(1);
    tr.replaceWith(at, $from.after(1), table);
  } else {
    at = $from.after(1);
    tr.insert(at, table);
  }

  const after = at + table.nodeSize;

  if (!isEmptyParagraph(tr.doc.nodeAt(after))) tr.insert(after, paragraph.create());

  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
}

const RICH_ACTIONS: Record<MarkdownAction, RichAction> = {
  bold: command(toggleStrongCommand),
  italic: command(toggleEmphasisCommand),
  strikethrough: command(toggleStrikethroughCommand),
  code: command(toggleInlineCodeCommand),
  paragraph: command(wrapInHeadingCommand, 0),
  h1: command(wrapInHeadingCommand, 1),
  h2: command(wrapInHeadingCommand, 2),
  h3: command(wrapInHeadingCommand, 3),
  ul: command(wrapInBulletListCommand),
  ol: command(wrapInOrderedListCommand),
  quote: command(wrapInBlockquoteCommand),
  hr: command(insertHrCommand),
  codeblock: command(createCodeBlockCommand),
  table: (editor) => {
    editor.action(insertTableAfterBlock);
    focusDocument(editor);
  },
  checkbox: (editor) => {
    editor.action(toggleTaskItem);
    focusDocument(editor);
  },
  link: askForLink('link'),
  image: askForLink('image'),
};

export function runRichAction(editor: Editor, action: MarkdownAction, requestLink: (request: LinkRequest) => void): void {
  RICH_ACTIONS[action](editor, requestLink);
}

/** Inserts a block of Markdown (e.g. a Mermaid template) on its own lines at the cursor. */
export function insertRichSnippet(editor: Editor, markdown: string): void {
  editor.action(insert(`\n${markdown.trim()}\n`));
  focusDocument(editor);
}

/** Fills in what the link or image dialog asked for: an image, a link on the selection, or new link text. */
export function applyRichLink(editor: Editor, request: LinkRequest, url: string, text: string): void {
  focusDocument(editor);

  if (request.kind === 'image') {
    editor.action(callCommand(insertImageCommand.key, { src: url, alt: text }));
  } else if (request.hasSelection) {
    editor.action(callCommand(toggleLinkCommand.key, { href: url }));
  } else {
    const label = (text || url).replace(/[[\]]/g, '');
    editor.action(insert(`[${label}](${url})`, true));
  }
}
