// Markdown formatting for the rich-text editor: each toolbar, palette and shortcut
// action mapped to a Milkdown command. The rich-text twin of codemirror/commands.ts.
import { type Editor, editorViewCtx } from '@milkdown/kit/core';
import {
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
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { type $Command, callCommand, insert } from '@milkdown/kit/utils';
import type { MarkdownAction } from '../types';

/** Asks the editor's host to open the link or image dialog */
export type LinkRequest = { kind: 'link' | 'image'; hasSelection: boolean };

type RichAction = (editor: Editor, requestLink: (request: LinkRequest) => void) => void;

function focusDocument(editor: Editor): void {
  editor.action((ctx) => ctx.get(editorViewCtx).focus());
}

// Takes the command plugin, not its key: Milkdown assigns `.key` only when the plugin
// registers with an editor, so reading it at module load gives undefined
function command<T>(cmd: $Command<T>, payload?: T): RichAction {
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
  table: command(insertTableCommand, { row: 3, col: 3 }),
  checkbox: (editor) => {
    editor.action(insert('- [ ] '));
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
