// Syntax colours in rich-text code blocks: the preview's highlight.js runs, laid over the text as
// inline decorations, so the editable DOM and the document are never touched. Code shows plain
// until the grammars load (this plugin asks for them), then a full pass colours it in.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { highlightTokens, isHighlighterReady, onHighlighterReady, type HighlightToken } from '@/features/syntax-highlight';
import { fenceLanguage } from '@/lib/markdown';

interface HighlightState {
  decorations: DecorationSet;
  /** Scope spans (one per run and scope level) in the whole document */
  runs: number;
  /** Mapped rather than recomputed: a catch-up pass is due */
  stale: boolean;
}

const codeHighlightKey = new PluginKey<HighlightState>('markloom-code-highlight');

// Nodes are immutable, so a block's runs hold until its text or language changes
const tokenCache = new WeakMap<ProseNode, HighlightToken[]>();

function blockTokens(node: ProseNode): HighlightToken[] {
  const cached = tokenCache.get(node);

  if (cached) return cached;

  const tokens = highlightTokens(node.textContent, fenceLanguage(node.attrs.language || ''));

  // Before the grammars load every block is plain; don't remember that
  if (isHighlighterReady()) tokenCache.set(node, tokens);

  return tokens;
}

// Above this many runs in the document, re-colouring on every keystroke lags (highlight.js over a
// large block, then the browser restyling thousands of spans): edits map the colours they have,
// and a full pass catches up once typing pauses.
const DEFER_ABOVE_RUNS = 2000;

const CATCH_UP_DELAY_MS = 150;

/**
 * Every code block's runs as one set. Built afresh: only a changed block runs highlight.js
 * again (the others come from the cache), and a fresh set is far cheaper than removing and
 * re-adding a large block's decorations in the old one.
 */
function fullPass(doc: ProseNode): HighlightState {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;

    for (const token of blockTokens(node)) {
      const from = pos + 1 + token.from;
      const to = pos + 1 + token.to;

      // One span per scope, as the preview nests them, so the inner scope's colour wins and
      // descendant rules (`.hljs-meta .hljs-keyword`) match. Every level of a run covers the
      // same range, and ProseMirror wraps text in same-range decorations in array order, the
      // first closest to the text: so the innermost scope goes first.
      for (let level = token.scopes.length - 1; level >= 0; level--) {
        decorations.push(Decoration.inline(from, to, { nodeName: 'span', class: token.scopes[level] }));
      }
    }

    return false;
  });

  return { decorations: DecorationSet.create(doc, decorations), runs: decorations.length, stale: false };
}

export const codeHighlight = $prose(
  () =>
    new Plugin<HighlightState>({
      key: codeHighlightKey,
      state: {
        init: (_config, state) => fullPass(state.doc),
        apply: (tr, previous) => {
          if (tr.getMeta(codeHighlightKey)) return fullPass(tr.doc);

          if (!tr.docChanged) return previous;

          if (previous.runs <= DEFER_ABOVE_RUNS) return fullPass(tr.doc);

          return { decorations: previous.decorations.map(tr.mapping, tr.doc), runs: previous.runs, stale: true };
        },
      },
      props: {
        decorations: (state) => codeHighlightKey.getState(state)?.decorations,
      },
      view: (view) => {
        const refresh = () => view.dispatch(view.state.tr.setMeta(codeHighlightKey, true));
        let timer: number | undefined;
        // Already loaded: init coloured everything
        const stopWaiting = isHighlighterReady() ? () => {} : onHighlighterReady(refresh);

        return {
          update: () => {
            if (!codeHighlightKey.getState(view.state)?.stale) return;

            window.clearTimeout(timer);
            timer = window.setTimeout(refresh, CATCH_UP_DELAY_MS);
          },
          destroy: () => {
            window.clearTimeout(timer);
            stopWaiting();
          },
        };
      },
    })
);
