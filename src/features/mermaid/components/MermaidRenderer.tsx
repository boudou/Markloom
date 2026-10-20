import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { renderMermaid } from '../utils/mermaidConfig';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';

interface MermaidRendererProps {
  code: string;
  className?: string;
  onRender?: (svgElement: SVGElement) => void;
  onError?: (error: Error) => void;
}

export function MermaidRenderer({
  code,
  className,
  onRender,
  onError,
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const renderCountRef = useRef(0);

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current || !code.trim()) return;

    setIsLoading(true);
    setError(null);

    // Generate a unique ID for each render to avoid Mermaid DOM conflicts
    renderCountRef.current += 1;
    const uniqueRenderId = `mermaid-${nanoid(8)}-${renderCountRef.current}`;

    try {
      const { svg, bindFunctions } = await renderMermaid(code, uniqueRenderId);

      if (containerRef.current) {
        containerRef.current.innerHTML = svg;

        // Bind any interactive functions
        if (bindFunctions) {
          bindFunctions(containerRef.current);
        }

        // Get the SVG element and call onRender callback
        const svgElement = containerRef.current.querySelector('svg');
        if (svgElement && onRender) {
          onRender(svgElement);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram';
      setError(errorMessage);
      if (onError) {
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    } finally {
      setIsLoading(false);
    }
  }, [code, onRender, onError]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  const handleRetry = () => {
    renderDiagram();
  };

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="wait">
        {isLoading && (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-wash/50 rounded-lg"
          >
            <div className="flex items-center gap-2 text-text-muted">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Rendering diagram…</span>
            </div>
          </m.div>
        )}

        {error && (
          <m.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mermaid-error flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">Diagram error</p>
              <p className="text-xs opacity-80 whitespace-pre-wrap">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-2 text-xs text-error hover:text-error/80 underline"
              >
                Try again
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div
        ref={containerRef}
        className={cn(
          'mermaid-diagram transition-opacity duration-200',
          isLoading && 'opacity-50',
          error && 'hidden'
        )}
      />
    </div>
  );
}
