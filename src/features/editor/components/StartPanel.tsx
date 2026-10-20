import { FileText, FolderOpen, LayoutTemplate, History } from 'lucide-react';
import { openFile, openFolder } from '@/lib/documentActions';
import { shortcutKeys } from '@/lib/shortcuts';
import { Kbd } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import { useSessionStore, restoreLastSession, dismissLastSession } from '@/lib/session';
import { cn } from '@/lib/utils';

interface StartPanelProps {
  /** Where the writing happens, so the hint can point at it */
  writeHint: string;
  className?: string;
}

/** Shown in place of an empty document: say where to type, then offer the other ways in. */
export function StartPanel({ writeHint, className }: StartPanelProps) {
  const openDialog = useUiStore((s) => s.openDialog);
  const offer = useSessionStore((s) => s.offer);
  const restoring = useSessionStore((s) => s.restoring);

  const offerLabel = offer
    ? [
        offer.rootName && `“${offer.rootName}”`,
        offer.paths.length > 0 && `${offer.paths.length} document${offer.paths.length === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' and ')
    : '';

  const actions = [
    { icon: FileText, label: 'Open a file', hint: shortcutKeys('openFile'), run: openFile },
    { icon: FolderOpen, label: 'Open a folder', hint: shortcutKeys('openFolder'), run: openFolder },
    { icon: LayoutTemplate, label: 'Start from a template', hint: '', run: () => openDialog('templates') },
  ];

  return (
    <div className={cn('max-w-sm', className)}>
      <h2 className="font-display text-2xl font-semibold text-text-primary text-balance">
        A blank page
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{writeHint}</p>

      {offer && (
        <div className="mt-6 rounded-lg border border-accent-primary/30 bg-accent-muted/40 p-3">
          <div className="flex items-start gap-3">
            <History className="w-4 h-4 mt-0.5 text-accent-hover flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium text-text-primary">Pick up where you left off</p>
              <p className="text-text-secondary truncate">Reopen {offerLabel}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 pl-7">
            <button
              type="button"
              onClick={() => void restoreLastSession()}
              disabled={restoring}
              className="h-8 px-3 rounded-md bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
            >
              {restoring ? 'Reopening…' : 'Reopen'}
            </button>
            <button
              type="button"
              onClick={dismissLastSession}
              className="h-8 px-3 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-wash outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-rule">
        {actions.map(({ icon: Icon, label, hint, run }) => (
          <button
            key={label}
            type="button"
            onClick={() => void run()}
            className={cn(
              'w-full flex items-center gap-3 py-2.5 border-b border-rule text-left text-sm',
              'text-text-primary hover:text-accent-hover outline-none',
              'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 rounded-sm'
            )}
          >
            <Icon className="w-4 h-4 text-text-secondary" />
            <span className="flex-1">{label}</span>
            {hint && <kbd className="font-mono text-xs text-text-muted">{hint}</kbd>}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Every command is a keystroke away: <Kbd>{shortcutKeys('commandPalette')}</Kbd>
      </p>
    </div>
  );
}
