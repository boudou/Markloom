import { useEffect, useRef, useMemo, useState, forwardRef } from 'react';
import { m } from 'framer-motion';
import { parseMarkdown } from '@/lib/markdown';
import { isHighlighterReady, onHighlighterReady } from '@/features/syntax-highlight';
import { cn } from '@/lib/utils';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { describeDiagramError, diagramErrorElement } from '@/features/mermaid/utils/errors';
import { addCopyButtons, handleCopyClick } from '../utils/codeCopy';

// Jumps the source editor to a document line (handled by SplitViewEditor)
function showSourceLine(line: number) {
  window.dispatchEvent(new CustomEvent('outline-navigate', { detail: { line } }));
}

// Rendered diagrams keyed by source, so typing elsewhere doesn't re-run Mermaid
const mermaidSvgCache = new Map<string, string>();
const MAX_CACHED_DIAGRAMS = 50;
let mermaidRenderId = 0;

function rememberSvg(code: string, svg: string) {
  mermaidSvgCache.set(code, svg);
  if (mermaidSvgCache.size > MAX_CACHED_DIAGRAMS) {
    mermaidSvgCache.delete(mermaidSvgCache.keys().next().value!);
  }
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  function MarkdownPreview({ content, className }, forwardedRef) {
    const internalRef = useRef<HTMLDivElement>(null);
    const containerRef = (forwardedRef as React.RefObject<HTMLDivElement>) || internalRef;

    // Re-parse shortly after typing pauses rather than on every keystroke
    const debouncedContent = useDebouncedValue(content, 120);
    // Code renders plain until the highlighter chunk arrives, then once more with colour
    const [highlighterReady, setHighlighterReady] = useState(isHighlighterReady);
    useEffect(() => onHighlighterReady(() => setHighlighterReady(true)), []);
    const html = useMemo(() => parseMarkdown(debouncedContent), [debouncedContent, highlighterReady]);

    // Resolve relative images and make links navigable
    useDocumentLinks(containerRef, html);

    // Copy buttons on code blocks; one listener serves all of them
    const articleRef = useRef<HTMLElement>(null);
    const statusRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
      if (articleRef.current) addCopyButtons(articleRef.current);
    }, [html]);
    useEffect(() => {
      const article = articleRef.current;
      if (!article) return;
      const announce = (message: string) => {
        if (statusRef.current) statusRef.current.textContent = message;
      };
      const onClick = (event: MouseEvent) => void handleCopyClick(event, announce);
      article.addEventListener('click', onClick);
      return () => article.removeEventListener('click', onClick);
    }, []);

    // Fill Mermaid placeholders; unchanged diagrams come straight from the cache.
    // Failures become an error card and are reported so the source pane can mark the line.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let cancelled = false;

      const renders = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-container[data-mermaid]')).map(
        async (slot): Promise<number | null> => {
          const code = decodeURIComponent(slot.getAttribute('data-mermaid') || '');
          if (!code) return null;
          slot.setAttribute('role', 'img');
          slot.setAttribute('aria-label', `Diagram: ${code.split('\n')[0].trim()}`);

          const cached = mermaidSvgCache.get(code);
          if (cached) {
            slot.innerHTML = cached;
            return null;
          }
          try {
            const { svg } = await renderMermaid(code, `mermaid-preview-${++mermaidRenderId}`);
            rememberSvg(code, svg);
            if (!cancelled) slot.innerHTML = svg;
            return null;
          } catch (error) {
            const firstLine = Number(slot.getAttribute('data-line')) || undefined;
            const described = describeDiagramError(error instanceof Error ? error.message : String(error), code, firstLine);
            if (!cancelled) {
              slot.removeAttribute('role');
              slot.replaceChildren(diagramErrorElement(described, showSourceLine));
            }
            return described.line;
          }
        }
      );

      void Promise.all(renders).then((lines) => {
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent('diagram-errors', { detail: { lines: lines.filter((l): l is number => l !== null) } })
        );
      });

      return () => {
        cancelled = true;
      };
    }, [html, containerRef]);

    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        ref={containerRef}
        data-doc-surface
        role="region"
        aria-label="Preview"
        className={cn('h-full overflow-auto px-8 py-8', className)}
      >
        <article
          ref={articleRef}
          className="prose-markloom reading-column font-editor text-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <span ref={statusRef} role="status" aria-live="polite" className="sr-only" />
      </m.div>
    );
  }
);
