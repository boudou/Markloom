import { useEffect } from 'react';
import { type EditorView } from '@codemirror/view';
import { useSettingsStore } from '@/stores/settingsStore';

interface UseSyncScrollOptions {
  editorView: EditorView | null | undefined;
  /** The preview's scrolling surface */
  previewRef: React.RefObject<HTMLElement>;
  /** The rendered document inside it, whose height changes as blocks render and resize */
  previewContentRef: React.RefObject<HTMLElement>;
  /** False while the preview pane isn't mounted (blank document) */
  previewReady?: boolean;
}

interface Anchor {
  /** 1-based source line */
  line: number;
  /** Offset of the rendered block from the top of the preview's scroll content */
  top: number;
}

/**
 * Rendered blocks carry `data-line` (their source line). Matching scroll positions through
 * those anchors keeps both panes on the same paragraph, however tall images and diagrams are.
 */
function previewAnchors(preview: HTMLElement): Anchor[] {
  const base = preview.getBoundingClientRect().top - preview.scrollTop;
  const anchors: Anchor[] = [];

  for (const el of Array.from(preview.querySelectorAll<HTMLElement>('[data-line]'))) {
    const line = Number(el.dataset.fenceLine || el.dataset.line);

    // Footnotes are drawn at the end but keep their source lines; a mid-document definition's
    // line there would go backwards and cut sync for every block after it
    if (!line || el.closest('section.footnotes')) continue;

    anchors.push({ line, top: el.getBoundingClientRect().top - base });
  }

  anchors.sort((a, b) => a.line - b.line || a.top - b.top);

  // Nested blocks share lines with their parents: keep the first (outermost) of each. Blocks
  // drawn above an earlier line (floats) are dropped too, so both keys only ever grow.
  const kept: Anchor[] = [];

  for (const anchor of anchors) {
    const last = kept[kept.length - 1];

    if (last && (anchor.line === last.line || anchor.top < last.top)) continue;
    kept.push(anchor);
  }

  return kept;
}

/** The anchors around `value` (by line, or by top): the last one at or before it, and the next */
function bracket(anchors: Anchor[], key: 'line' | 'top', value: number): [Anchor, Anchor | undefined] {
  let low = 0;
  let high = anchors.length - 1;
  let index = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;

    if (anchors[mid][key] <= value) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return [anchors[index], anchors[index + 1]];
}

export function useSyncScroll({
  editorView,
  previewRef,
  previewContentRef,
  previewReady = true,
}: UseSyncScrollOptions): void {
  const syncScroll = useSettingsStore((s) => s.syncScroll);

  useEffect(() => {
    const preview = previewRef.current;
    const content = previewContentRef.current;

    if (!syncScroll || !editorView || !preview || !content) return;

    const scroller = editorView.scrollDOM;
    // Which pane the user is moving; the other one follows and must not echo back
    let driver: 'editor' | 'preview' | null = null;
    let releaseTimer = 0;
    // The preview only drives the editor while the reader is actually using the preview.
    // While typing, the preview reflows (diagrams re-render) and those scroll events aren't
    // the user's: following them threw the caret out of view.
    let pointerInPreview = false;
    let frame = 0;
    // Measured on the first scroll after the preview changed, not on every frame
    let anchors: Anchor[] | null = null;

    // The pane being scrolled leads; the other follows on the next frame
    const lead = (pane: 'editor' | 'preview', follow: () => void) => {
      driver = pane;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => (driver = null), 120);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };

    const handleEditorScroll = () => {
      if (driver === 'preview') return;
      lead('editor', () => {
        // Ends of the source map to the ends of the preview (padding and first margins included)
        if (scroller.scrollTop <= 1) {
          preview.scrollTop = 0;

          return;
        }

        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
          preview.scrollTop = preview.scrollHeight;

          return;
        }

        const block = editorView.lineBlockAtHeight(scroller.scrollTop);
        const line = editorView.state.doc.lineAt(block.from).number;
        const fraction = block.height ? (scroller.scrollTop - block.top) / block.height : 0;
        anchors ??= previewAnchors(preview);

        if (!anchors.length) return;
        const [a, b] = bracket(anchors, 'line', line);
        const end = b ?? { line: editorView.state.doc.lines + 1, top: preview.scrollHeight };
        const span = Math.max(1, end.line - a.line);
        const t = Math.min(1, Math.max(0, (line + fraction - a.line) / span));
        preview.scrollTop = line < a.line ? 0 : a.top + (end.top - a.top) * t;
      });
    };

    const handlePreviewScroll = () => {
      if (driver === 'editor') return;

      if (editorView.hasFocus && !pointerInPreview) return;
      lead('preview', () => {
        if (preview.scrollTop <= 1) {
          scroller.scrollTop = 0;

          return;
        }

        if (preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 2) {
          scroller.scrollTop = scroller.scrollHeight;

          return;
        }

        anchors ??= previewAnchors(preview);

        if (!anchors.length) return;
        const [a, b] = bracket(anchors, 'top', preview.scrollTop);
        const doc = editorView.state.doc;
        const end = b ?? { line: doc.lines + 1, top: preview.scrollHeight };
        const t = end.top > a.top ? Math.min(1, Math.max(0, (preview.scrollTop - a.top) / (end.top - a.top))) : 0;
        const target = preview.scrollTop < a.top ? 1 : a.line + (end.line - a.line) * t;
        const lineNumber = Math.min(doc.lines, Math.max(1, Math.floor(target)));
        const block = editorView.lineBlockAt(doc.line(lineNumber).from);
        scroller.scrollTop = block.top + block.height * (target - Math.floor(target));
      });
    };

    const enter = () => (pointerInPreview = true);
    const leave = () => (pointerInPreview = false);
    const invalidate = () => (anchors = null);

    // Re-renders, diagrams and copy buttons change the blocks; images, fonts, <details> and
    // the split change their sizes
    const mutations = new MutationObserver(invalidate);
    mutations.observe(preview, { childList: true, subtree: true });
    const resizes = new ResizeObserver(invalidate);
    resizes.observe(preview);
    resizes.observe(content);

    scroller.addEventListener('scroll', handleEditorScroll, { passive: true });
    preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    preview.addEventListener('pointerenter', enter);
    preview.addEventListener('pointerleave', leave);

    return () => {
      scroller.removeEventListener('scroll', handleEditorScroll);
      preview.removeEventListener('scroll', handlePreviewScroll);
      preview.removeEventListener('pointerenter', enter);
      preview.removeEventListener('pointerleave', leave);
      mutations.disconnect();
      resizes.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(releaseTimer);
    };
  }, [syncScroll, editorView, previewRef, previewContentRef, previewReady]);
}
