import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { pageBox } from '../pipeline/pageGeometry';
import type { PagedDocument } from '../pipeline/pages';

/** The preview's one async job: lay the pages out, then build the document that shows them. */
export type Preview =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; doc: PagedDocument; html: string }
  | { status: 'error'; message: string };

interface PagePreviewProps {
  preview: Preview;
  /** Zero-based */
  page: number;
  onPageChange: (page: number) => void;
}

/** Shows one page of a laid-out document at a scale that fits the space, with page stepping. */
export function PagePreview({ preview, page, onPageChange }: PagePreviewProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [frameReady, setFrameReady] = useState(false);
  const ready = preview.status === 'ready' ? preview : null;
  const html = ready?.html ?? null;

  useEffect(() => {
    const element = areaRef.current;

    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // A new document loads into a new frame
  useEffect(() => setFrameReady(false), [html]);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;

    if (!frameReady || !doc) return;

    for (const section of Array.from(doc.querySelectorAll<HTMLElement>('section.page'))) {
      section.hidden = section.dataset.page !== String(page + 1);
    }
  }, [frameReady, page, html]);

  const count = ready?.doc.pages.length ?? 0;
  const busy = preview.status === 'idle' || preview.status === 'loading';
  const box = ready ? pageBox(ready.doc.page) : null;
  const scale = box && area.width > 0 && area.height > 0 ? Math.min(area.width / box.width, area.height / box.height) : 0;

  let status: string | null = null;

  if (preview.status === 'error') {
    status = `Preview failed: ${preview.message}`;
  } else if (ready && count === 0) {
    status = 'Nothing to preview';
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div ref={areaRef} className="relative h-[min(60vh,540px)] rounded-lg bg-wash">
        {html && box && !status && scale > 0 && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-white shadow-[0_0_0_1px_rgba(26,26,26,0.12),0_4px_12px_rgba(26,26,26,0.1)]"
            style={{ width: box.width * scale, height: box.height * scale }}
          >
            <iframe
              ref={frameRef}
              title={`Page ${page + 1} of ${count}`}
              sandbox="allow-same-origin"
              srcDoc={html}
              onLoad={() => setFrameReady(true)}
              tabIndex={-1}
              className="border-0 origin-top-left"
              style={{ width: box.width, height: box.height, transform: `scale(${scale})` }}
            />
          </div>
        )}
        {(busy || status) && (
          <div role="status" className="absolute inset-0 grid place-items-center p-4 text-sm text-text-secondary text-center">
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                Laying out pages…
              </span>
            ) : (
              status
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={busy || page <= 0}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>
        <span className="text-sm tabular-nums text-text-secondary" aria-live="polite">
          {count > 0 ? `Page ${page + 1} of ${count}` : ''}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={busy || page >= count - 1}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
