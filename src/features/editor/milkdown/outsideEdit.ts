import type { Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { trailingConfig } from '@milkdown/kit/plugin/trailing';
import { headingSchema } from '@milkdown/kit/preset/commonmark';
import { Transform } from '@milkdown/kit/prose/transform';
import { setHeadingIds } from './plugins';

/**
 * Shows Markdown edited elsewhere (in Markdown mode) as one minimal, non-history change, so
 * this editor's undo history keeps its own edits, mapped onto the new text, and never
 * undoes the other editor's. Edits inside the replaced range lose their undo steps.
 */
export function applyOutsideEdit(markdown: string): (ctx: Ctx) => void {
  return (ctx) => {
    const view = ctx.get(editorViewCtx);
    const parsed = ctx.get(parserCtx)(markdown);

    if (!parsed) return;

    // The live doc carries heading ids and the trailing paragraph; a fresh parse has neither,
    // and without them the diff would stop at the first heading or at the very end
    const withIds = new Transform(parsed);

    setHeadingIds(withIds, headingSchema.type(ctx));

    const { shouldAppend, getNode } = ctx.get(trailingConfig.key);

    if (shouldAppend(withIds.doc.lastChild, view.state)) {
      withIds.insert(withIds.doc.content.size, getNode(view.state));
    }

    const next = withIds.doc;
    const live = view.state.doc;
    const start = live.content.findDiffStart(next.content);

    if (start === null) return;

    const end = live.content.findDiffEnd(next.content);

    if (!end) return;

    // Repeated text can make the two ends overlap the start; widen both by the overlap
    const overlap = start - Math.min(end.a, end.b);
    const liveEnd = overlap > 0 ? end.a + overlap : end.a;
    const nextEnd = overlap > 0 ? end.b + overlap : end.b;

    view.dispatch(view.state.tr.replace(start, liveEnd, next.slice(start, nextEnd)).setMeta('addToHistory', false));
  };
}
