import { useEffect, useLayoutEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { m } from 'framer-motion';
import { parseMarkdown } from '@/lib/markdown';
import { isHighlighterReady, onHighlighterReady } from '@/features/syntax-highlight';
import { fillMath, isMathReady, loadMath, onMathReady } from '@/features/math';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { fillDiagram } from '@/features/mermaid/utils/errors';
import { addCopyButtons, handleCopyClick } from '../utils/codeCopy';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  /** The scrolling surface, shared with scroll sync */
  surfaceRef: React.RefObject<HTMLDivElement>;
  /** The rendered document inside the surface; scroll sync watches its size */
  contentRef: React.RefObject<HTMLElement>;
  /** "Show line N" on a diagram error card; the latest one is called, so it need not be stable */
  onShowLine: (line: number) => void;
  /** Source lines of the diagrams that failed, after each render. Keep stable: it re-runs diagram rendering. */
  onDiagramErrors: (lines: number[]) => void;
}

export function MarkdownPreview({
  content,
  className,
  surfaceRef,
  contentRef,
  onShowLine,
  onDiagramErrors,
}: MarkdownPreviewProps) {
  // Re-parse shortly after typing pauses rather than on every keystroke
  const debouncedContent = useDebouncedValue(content, 120);
  // Code renders plain until the highlighter chunk arrives, then once more with colour
  const highlighterReady = useSyncExternalStore(onHighlighterReady, isHighlighterReady);
  const html = useMemo(() => parseMarkdown(debouncedContent), [debouncedContent, highlighterReady]);

  // Typeset math placeholders before paint, so the TeX source never flashes between React
  // setting the HTML and the fill. Until KaTeX has loaded they show the source.
  const mathReady = useSyncExternalStore(onMathReady, isMathReady);
  useLayoutEffect(() => {
    const article = contentRef.current;

    if (!article?.querySelector('[data-math]')) return;

    if (mathReady) fillMath(article);
    else void loadMath();
  }, [html, mathReady, contentRef]);

  // Resolve relative images and make links navigable
  useDocumentLinks(surfaceRef, html);

  // Copy buttons on code blocks; one listener serves all of them
  const statusRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (contentRef.current) addCopyButtons(contentRef.current);
  }, [html, contentRef]);
  useEffect(() => {
    const article = contentRef.current;

    if (!article) return;

    const announce = (message: string) => {
      if (statusRef.current) statusRef.current.textContent = message;
    };

    const onClick = (event: MouseEvent) => void handleCopyClick(event, announce);
    article.addEventListener('click', onClick);

    return () => article.removeEventListener('click', onClick);
  }, [contentRef]);

  // Error cards call the latest onShowLine, so a new callback does not re-render diagrams
  const showLineRef = useRef(onShowLine);
  useEffect(() => {
    showLineRef.current = onShowLine;
  }, [onShowLine]);

  // Fill Mermaid placeholders; unchanged diagrams come straight from the shared cache.
  // Failures become an error card and are reported so the source pane can mark the line.
  useEffect(() => {
    const container = surfaceRef.current;

    if (!container) return;
    let cancelled = false;

    const renders = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-container[data-mermaid]')).map(
      async (slot): Promise<number | null> => {
        const code = decodeURIComponent(slot.getAttribute('data-mermaid') || '');

        if (!code) return null;

        const result = await renderMermaid(code, 'preview');

        if (cancelled) return null;

        const error = fillDiagram(slot, result, code, {
          firstLine: Number(slot.getAttribute('data-line')) || undefined,
          onShowLine: (line) => showLineRef.current(line),
        });

        return error ? error.line : null;
      }
    );

    void Promise.all(renders).then((lines) => {
      if (cancelled) return;
      onDiagramErrors(lines.filter((l): l is number => l !== null));
    });

    return () => {
      cancelled = true;
    };
  }, [html, surfaceRef, onDiagramErrors]);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      ref={surfaceRef}
      data-doc-surface
      role="region"
      aria-label="Preview"
      className={cn('relative h-full overflow-auto px-8 py-8', className)}
    >
      <article
        ref={contentRef}
        className="prose-markloom reading-column font-editor text-base leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <span ref={statusRef} role="status" aria-live="polite" className="sr-only" />
    </m.div>
  );
}
