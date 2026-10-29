import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { renderMermaid } from '../utils/mermaidConfig';
import { currentTheme, onThemeChange } from '@/lib/appearance';
import { fillDiagram } from '../utils/errors';
import { cn } from '@/lib/utils';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

export function MermaidRenderer({ code, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Until the first result only; later edits and theme changes swap the diagram in place, as the preview does
  const [ready, setReady] = useState(false);
  const theme = useSyncExternalStore(onThemeChange, currentTheme);

  useEffect(() => {
    let cancelled = false;

    void renderMermaid(code, theme).then((result) => {
      const container = containerRef.current;

      if (cancelled || !container) return;

      fillDiagram(container, result, code);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence>
        {!ready && (
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
      </AnimatePresence>

      <div ref={containerRef} className="mermaid-diagram" />
    </div>
  );
}
