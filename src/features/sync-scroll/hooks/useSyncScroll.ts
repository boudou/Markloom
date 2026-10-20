import { useCallback, useEffect, useRef } from 'react';
import { type EditorView } from '@codemirror/view';
import { useSettingsStore } from '@/stores/settingsStore';

interface UseSyncScrollOptions {
  editorView: EditorView | null | undefined;
  previewRef: React.RefObject<HTMLElement>;
  content: string;
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
    if (!line) continue;
    anchors.push({ line, top: el.getBoundingClientRect().top - base });
  }
  anchors.sort((a, b) => a.line - b.line || a.top - b.top);
  // Nested blocks share lines with their parents; keep the first (outermost) of each
  return anchors.filter((a, i) => i === 0 || a.line !== anchors[i - 1].line);
}

/** Interpolates between the anchors around `value` (by line, or by top) */
function bracket(anchors: Anchor[], key: 'line' | 'top', value: number): [Anchor, Anchor | undefined] {
  let index = 0;
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i][key] <= value) index = i;
    else break;
  }
  return [anchors[index], anchors[index + 1]];
}

export function useSyncScroll({ editorView, previewRef, previewReady = true }: UseSyncScrollOptions) {
  const syncScroll = useSettingsStore((s) => s.syncScroll);
  // Which pane the user is moving; the other one follows and must not echo back
  const driver = useRef<'editor' | 'preview' | null>(null);
  const releaseTimer = useRef<number>();
  // The preview only drives the editor while the reader is actually using the preview.
  // While typing, the preview reflows (diagrams re-render) and those scroll events aren't
  // the user's: following them threw the caret out of view.
  const pointerInPreview = useRef(false);
  const frame = useRef(0);

  const claim = (pane: 'editor' | 'preview') => {
    driver.current = pane;
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => (driver.current = null), 120);
  };

  const handleEditorScroll = useCallback(() => {
    const preview = previewRef.current;
    if (!syncScroll || !preview || !editorView || driver.current === 'preview') return;
    claim('editor');
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const scroller = editorView.scrollDOM;
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
      const anchors = previewAnchors(preview);
      if (!anchors.length) return;
      const [a, b] = bracket(anchors, 'line', line);
      const end = b ?? { line: editorView.state.doc.lines + 1, top: preview.scrollHeight };
      const span = Math.max(1, end.line - a.line);
      const t = Math.min(1, Math.max(0, (line + fraction - a.line) / span));
      preview.scrollTop = line < a.line ? 0 : a.top + (end.top - a.top) * t;
    });
  }, [syncScroll, editorView, previewRef]);

  const handlePreviewScroll = useCallback(() => {
    const preview = previewRef.current;
    if (!syncScroll || !preview || !editorView || driver.current === 'editor') return;
    if (editorView.hasFocus && !pointerInPreview.current) return;
    claim('preview');
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const scroller = editorView.scrollDOM;
      if (preview.scrollTop <= 1) {
        scroller.scrollTop = 0;
        return;
      }
      if (preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 2) {
        scroller.scrollTop = scroller.scrollHeight;
        return;
      }
      const anchors = previewAnchors(preview);
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
  }, [syncScroll, editorView, previewRef]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!syncScroll || !editorView || !preview) return;

    const editorDOM = editorView.scrollDOM;
    const enter = () => (pointerInPreview.current = true);
    const leave = () => (pointerInPreview.current = false);

    editorDOM.addEventListener('scroll', handleEditorScroll, { passive: true });
    preview.addEventListener('scroll', handlePreviewScroll, { passive: true });
    preview.addEventListener('pointerenter', enter);
    preview.addEventListener('pointerleave', leave);

    return () => {
      editorDOM.removeEventListener('scroll', handleEditorScroll);
      preview.removeEventListener('scroll', handlePreviewScroll);
      preview.removeEventListener('pointerenter', enter);
      preview.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame.current);
    };
  }, [syncScroll, editorView, previewRef, previewReady, handleEditorScroll, handlePreviewScroll]);

  useEffect(() => () => window.clearTimeout(releaseTimer.current), []);

  return { enabled: syncScroll, handleEditorScroll, handlePreviewScroll };
}
