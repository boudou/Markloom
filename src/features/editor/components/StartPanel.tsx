import { FileText, Folder, FolderOpen, LayoutTemplate, History } from 'lucide-react';
import { openFile, openFolder, openPath, reopenFolder } from '@/lib/documentActions';
import type { ShortcutId } from '@/lib/shortcuts';
import { ProjectLinks } from '@/components/layout/ProjectLinks';
import { Kbd } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionStore, restoreLastSession, dismissLastSession } from '@/lib/session';
import { cn } from '@/lib/utils';

interface StartPanelProps {
  /** Where the writing happens, so the hint can point at it */
  writeHint: string;
  className?: string;
}

interface StartAction {
  icon: typeof FileText;
  label: string;
  shortcut?: ShortcutId;
  run: () => void | Promise<void>;
}

/** How many recent folders and recent files the start screen lists */
const RECENT_ROWS = 5;

const ROW_CLASS = cn(
  'w-full flex items-center gap-3 py-2.5 border-b border-rule text-left text-sm',
  'text-text-primary hover:text-accent-hover outline-hidden',
  'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-xs'
);

interface RecentRow {
  id: string;
  name: string;
  /** Runs straight from the click: reopening a folder may need the click to ask for access */
  run: () => void;
}

function RecentList({ title, icon: Icon, rows }: { title: string; icon: typeof FileText; rows: RecentRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="text-xs font-medium text-text-muted">{title}</h3>
      <div className="mt-1 border-t border-rule">
        {rows.map(({ id, name, run }) => (
          <button key={id} type="button" onClick={run} title={name} className={ROW_CLASS}>
            <Icon className="w-4 h-4 text-text-secondary shrink-0" />
            <span className="flex-1 truncate">{name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "a", "a and b", "a, b and c" */
function joinList(parts: string[]): string {
  return parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Shown in place of an empty document: say where to type, then offer the other ways in. */
export function StartPanel({ writeHint, className }: StartPanelProps) {
  const openDialog = useUiStore((s) => s.openDialog);
  const offer = useSessionStore((s) => s.offer);
  const restoring = useSessionStore((s) => s.restoring);
  const recentFolders = useSettingsStore((s) => s.recentFolders);
  const recentFiles = useSettingsStore((s) => s.recentFiles);

  const offerLabel = offer
    ? joinList(
        [
          offer.rootName && `“${offer.rootName}”`,
          offer.paths.length > 0 && countOf(offer.paths.length, 'document'),
          offer.drafts.length > 0 && countOf(offer.drafts.length, 'unsaved draft'),
        ].filter((part): part is string => !!part)
      )
    : '';

  const actions: StartAction[] = [
    { icon: FileText, label: 'Open a file', shortcut: 'openFile', run: openFile },
    { icon: FolderOpen, label: 'Open a folder', shortcut: 'openFolder', run: openFolder },
    { icon: LayoutTemplate, label: 'Start from a template', run: () => openDialog('templates') },
  ];

  const folderRows: RecentRow[] = recentFolders.slice(0, RECENT_ROWS).map((folder) => ({
    id: folder.key,
    name: folder.name,
    run: () => void reopenFolder(folder.key),
  }));

  const fileRows: RecentRow[] = recentFiles.slice(0, RECENT_ROWS).map((file) => ({
    id: file.path,
    name: file.name,
    run: () => void openPath(file.path),
  }));

  return (
    <div className={cn('max-w-sm', className)}>
      <h2 className="font-display text-2xl font-semibold text-text-primary text-balance">
        A blank page
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{writeHint}</p>

      {offer && (
        <div className="mt-6 rounded-lg border border-accent-primary/30 bg-accent-muted/40 p-3">
          <div className="flex items-start gap-3">
            <History className="w-4 h-4 mt-0.5 text-accent-hover shrink-0" />
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
              className="h-8 px-3 rounded-md bg-accent-primary text-on-accent text-sm font-medium hover:bg-accent-hover disabled:opacity-60 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {restoring ? 'Reopening…' : 'Reopen'}
            </button>
            <button
              type="button"
              onClick={dismissLastSession}
              className="h-8 px-3 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-wash outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-rule">
        {actions.map(({ icon: Icon, label, shortcut, run }) => (
          <button
            key={label}
            type="button"
            onClick={() => void run()}
            className={ROW_CLASS}
          >
            <Icon className="w-4 h-4 text-text-secondary" />
            <span className="flex-1">{label}</span>
            {shortcut && <Kbd id={shortcut} />}
          </button>
        ))}
      </div>

      <RecentList title="Recent folders" icon={Folder} rows={folderRows} />
      <RecentList title="Recent files" icon={FileText} rows={fileRows} />

      <p className="mt-4 text-xs text-text-muted">
        Every command is a keystroke away: <Kbd id="commandPalette" />
      </p>

      {/* The status bar shows these on wider windows */}
      <ProjectLinks className="mt-6 text-xs text-text-muted md:hidden" />
    </div>
  );
}
