// Syntax colours in rich-text code blocks: the preview's highlight.js runs, laid over the text as
// inline decorations, so the editable DOM and the document are never touched. Code shows plain
// until the grammars load (this plugin asks for them), then a full pass colours it in.
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { highlightTokens, isHighlighterReady, onHighlighterReady, type HighlightToken } from '@/features/syntax-highlight';
import { fenceLanguage } from '@/lib/markdown';
import { highlightedMatches } from './search';

/** Where a find match sits in the document */
interface MatchRange {
  from: number;
  to: number;
}

interface HighlightState {
  decorations: DecorationSet;
  /** Scope spans (one per run and scope level) in the whole document */
  runs: number;
  /** Mapped rather than recomputed: a catch-up pass is due */
  stale: boolean;
  /** The find matches on screen, whose edges cut the runs */
  matches: MatchRange[];
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
 *
 * Runs are cut at the edges of find matches (#277). ProseMirror splits a run that a match
 * partly overlaps by itself, but it puts the pieces of the run's levels back in reverse order:
 * after the cut the outer scope would wrap closest to the text and its colour would win.
 */
function fullPass(doc: ProseNode, matches: MatchRange[]): HighlightState {
  const decorations: Decoration[] = [];
  const edges = matches.flatMap((match) => [match.from, match.to]).sort((a, b) => a - b);
  // Runs come in document order, so an edge before the current run is never needed again
  let nextEdge = 0;

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;

    for (const token of blockTokens(node)) {
      const from = pos + 1 + token.from;
      const to = pos + 1 + token.to;

      while (nextEdge < edges.length && edges[nextEdge] <= from) nextEdge++;

      let pieceFrom = from;

      for (let edge = nextEdge; pieceFrom < to; edge++) {
        const pieceTo = edge < edges.length && edges[edge] < to ? edges[edge] : to;

        // Two matches side by side share an edge
        if (pieceTo === pieceFrom) continue;

        // One span per scope, as the preview nests them, so the inner scope's colour wins and
        // descendant rules (`.hljs-meta .hljs-keyword`) match. Every level of a piece covers
        // the same range, and ProseMirror wraps text in same-range decorations in array order,
        // the first closest to the text: so the innermost scope goes first.
        for (let level = token.scopes.length - 1; level >= 0; level--) {
          decorations.push(Decoration.inline(pieceFrom, pieceTo, { nodeName: 'span', class: token.scopes[level] }));
        }

        pieceFrom = pieceTo;
      }
    }

    return false;
  });

  return { decorations: DecorationSet.create(doc, decorations), runs: decorations.length, stale: false, matches };
}

/** Matches follow an edit as their highlights do: inline decorations, so neither end grows */
function mapMatches(matches: MatchRange[], tr: Transaction): MatchRange[] {
  return matches.flatMap((match) => {
    const from = tr.mapping.map(match.from, 1);
    const to = tr.mapping.map(match.to, -1);

    return from < to ? [{ from, to }] : [];
  });
}

export const codeHighlight = $prose(
  () =>
    new Plugin<HighlightState>({
      key: codeHighlightKey,
      state: {
        init: (_config, state) => fullPass(state.doc, []),
        apply: (tr, previous) => {
          const found = highlightedMatches(tr);

          // New find highlights: cut the runs where the new matches are (nothing to do while
          // there are none, before or after)
          if (found && (found.length > 0 || previous.matches.length > 0)) return fullPass(tr.doc, found);

          if (tr.getMeta(codeHighlightKey)) return fullPass(tr.doc, previous.matches);

          if (!tr.docChanged) return previous;

          const matches = mapMatches(previous.matches, tr);

          if (previous.runs <= DEFER_ABOVE_RUNS) return fullPass(tr.doc, matches);

          return { decorations: previous.decorations.map(tr.mapping, tr.doc), runs: previous.runs, stale: true, matches };
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
