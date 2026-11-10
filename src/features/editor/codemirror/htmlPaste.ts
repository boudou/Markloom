// Paste as Markdown: HTML on the clipboard (a web page, Word, Google Docs) goes into the source as
// Markdown instead of its plain text. The converter (turndown) loads on the first such paste.
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type Text } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { notify } from '@/stores/uiStore';
import type { PastedMarkdown } from './htmlToMarkdown';

type Converter = (html: string, plainText: string) => PastedMarkdown;

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

let converter: Promise<Converter> | null = null;

function loadConverter(): Promise<Converter> {
  converter ??= import('./htmlToMarkdown').then(
    (module) => module.pastedMarkdown,
    (error: Error) => {
      // Offline before the chunk was cached: the next paste tries again
      converter = null;
      throw error;
    }
  );

  return converter;
}

/** Whether pasted HTML holds any text (a copied picture alone is just an <img>) */
export function htmlHasText(html: string): boolean {
  return html !== '' && (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() !== '';
}

function inCode(view: EditorView): boolean {
  const start = syntaxTree(view.state).resolveInner(view.state.selection.main.head, -1);

  for (let node: typeof start | null = start; node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }

  return false;
}

function hasText(text: string): boolean {
  return text.trim() !== '';
}

/** Inserts at every selection range; block Markdown gets blank lines from text beside it */
function insertMarkdown(view: EditorView, markdown: string): void {
  const block = markdown.includes('\n');
  const { doc } = view.state;

  const transaction = view.state.changeByRange((range) => {
    const startLine = doc.lineAt(range.from);
    const endLine = doc.lineAt(range.to);
    const before = block && hasText(startLine.text.slice(0, range.from - startLine.from)) ? '\n\n' : '';
    const after = block && hasText(endLine.text.slice(range.to - endLine.from)) ? '\n\n' : '';

    return {
      changes: { from: range.from, to: range.to, insert: before + markdown + after },
      range: EditorSelection.cursor(range.from + before.length + markdown.length),
    };
  });

  view.dispatch(view.state.update(transaction, { userEvent: 'input.paste', scrollIntoView: true }));
}

async function pasteConverted(view: EditorView, html: string, plainText: string, doc: Text): Promise<void> {
  let pasted: PastedMarkdown;

  try {
    pasted = (await loadConverter())(html, plainText);
  } catch {
    pasted = { markdown: plainText, droppedImages: 0 };
  }

  // The first paste waits for the chunk: typing or a tab switch meanwhile cancels it
  if (!view.dom.isConnected || view.state.doc !== doc) return;

  insertMarkdown(view, pasted.markdown);

  if (pasted.droppedImages > 0) {
    notify({
      tone: 'info',
      title: 'Pictures left out',
      detail: 'Pictures that are not web addresses were not pasted. Paste or drop each picture on its own to add it.',
    });
  }
}

class HtmlPaste {
  /** Shift held for this paste (Ctrl+Shift+V pastes plain text; Shift+Insert is an ordinary paste) */
  shift = false;
  lastKey = '';

  paste(event: ClipboardEvent, view: EditorView): boolean {
    const data = event.clipboardData;

    if (view.state.readOnly || !data) return false;

    const html = data.getData('text/html');

    if (
      html === '' ||
      // VS Code copies highlighted code as HTML; code stays code
      data.types.includes('vscode-editor-data') ||
      // A copy from Rich text: its plain text is already Markdown, with Markloom's own syntax
      html.includes('data-pm-slice') ||
      (this.shift && this.lastKey !== 'Insert') ||
      inCode(view) ||
      !htmlHasText(html)
    ) {
      return false;
    }

    // The clipboard is empty once the event is over
    void pasteConverted(view, html, data.getData('text/plain'), view.state.doc);

    return true;
  }
}

export const htmlPaste = ViewPlugin.fromClass(HtmlPaste, {
  eventHandlers: {
    paste(event, view) {
      return this.paste(event, view);
    },
  },
  eventObservers: {
    keydown(event) {
      this.shift = event.shiftKey;
      this.lastKey = event.key;
    },
    keyup(event) {
      if (event.key === 'Shift') this.shift = false;
    },
    blur() {
      this.shift = false;
    },
  },
});
