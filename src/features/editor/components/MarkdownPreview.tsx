import { useEffect, useRef, useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { parseMarkdown } from '@/lib/markdown';
import { isHighlighterReady, onHighlighterReady } from '@/features/syntax-highlight';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useDocumentLinks } from '../hooks/useDocumentLinks';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { describeDiagramError, diagramErrorElement } from '@/features/mermaid/utils/errors';
import { addCopyButtons, handleCopyClick } from '../utils/codeCopy';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  /** The scrolling surface, shared with scroll sync */
  surfaceRef: React.RefObject<HTMLDivElement>;
  /** "Show line N" on a diagram error card. Keep stable: it re-runs diagram rendering. */
  onShowLine: (line: number) => void;
  /** Source lines of the diagrams that failed, after each render. Keep stable too. */
  onDiagramErrors: (lines: number[]) => void;
}

export function MarkdownPreview({ content, className, surfaceRef, onShowLine, onDiagramErrors }: MarkdownPreviewProps) {
  // Re-parse shortly after typing pauses rather than on every keystroke
  const debouncedContent = useDebouncedValue(content, 120);
  // Code renders plain until the highlighter chunk arrives, then once more with colour
  const [highlighterReady, setHighlighterReady] = useState(isHighlighterReady);
  useEffect(() => onHighlighterReady(() => setHighlighterReady(true)), []);
  const html = useMemo(() => parseMarkdown(debouncedContent), [debouncedContent, highlighterReady]);

  // Resolve relative images and make links navigable
  useDocumentLinks(surfaceRef, html);

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
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', `Diagram: ${code.split('\n')[0].trim()}`);

        const result = await renderMermaid(code, 'preview');

        if (cancelled) return null;

        if (result.ok) {
          slot.innerHTML = result.svg;

          return null;
        }

        const firstLine = Number(slot.getAttribute('data-line')) || undefined;
        const described = describeDiagramError(result.error, code, firstLine);
        slot.removeAttribute('role');
        slot.replaceChildren(diagramErrorElement(described, onShowLine));

        return described.line;
      }
    );

    void Promise.all(renders).then((lines) => {
      if (cancelled) return;
      onDiagramErrors(lines.filter((l): l is number => l !== null));
    });

    return () => {
      cancelled = true;
    };
  }, [html, surfaceRef, onShowLine, onDiagramErrors]);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      ref={surfaceRef}
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
