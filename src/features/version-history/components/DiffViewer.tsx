import { useMemo } from 'react';
import { diffLines } from 'diff';
import { cn } from '@/lib/utils';
import { toDiffRows } from '../utils/diffRows';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
}

export function DiffViewer({ oldContent, newContent }: DiffViewerProps) {
  const rows = useMemo(() => toDiffRows(diffLines(oldContent, newContent)), [oldContent, newContent]);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-text-muted">No changes from the current document</p>;
  }

  return (
    <div className="text-xs font-mono">
      {rows.map((row, index) =>
        row.kind === 'gap' ? (
          <div key={index} className="px-2 py-0.5 text-text-muted italic select-none">
            ⋯ {row.hidden === 1 ? '1 unchanged line' : `${row.hidden} unchanged lines`}
          </div>
        ) : (
          <div
            key={index}
            className={cn(
              'px-2 py-0.5 border-l-2',
              row.kind === 'added' && 'bg-diff-added/10 border-diff-added text-success-text',
              row.kind === 'removed' && 'bg-diff-removed/10 border-diff-removed text-error-text',
              row.kind === 'same' && 'border-transparent text-text-muted'
            )}
          >
            <span className="mr-2 text-text-muted/50 select-none">
              {row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '}
            </span>
            {row.text || ' '}
          </div>
        )
      )}
    </div>
  );
}
