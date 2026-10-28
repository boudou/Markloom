import { forwardRef, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { History, Clock, Trash2, RotateCcw, X, ChevronRight, Plus } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui';
import { useActiveContent, useActivePath, useSetActiveContent } from '@/features/tabs';
import { useHistoryStore } from '../stores/historyStore';
import { type VersionMeta } from '../utils';
import { DiffViewer } from './DiffViewer';

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  // Less than a minute
  if (diff < 60000) return 'Just now';

  // Less than an hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

  // Less than a day
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The panel's contents. Lazy and mounted only while open, so neither versions nor the diff library load until asked for. */
export default function HistoryBody() {
  const activeFilePath = useActivePath();
  const content = useActiveContent();
  const setContent = useSetActiveContent();
  const versions = useHistoryStore((s) => s.versions);
  const isLoading = useHistoryStore((s) => s.isLoading);
  const selected = useHistoryStore((s) => s.selected);
  const loadVersions = useHistoryStore((s) => s.loadVersions);
  const saveCurrentVersion = useHistoryStore((s) => s.saveCurrentVersion);
  const selectVersion = useHistoryStore((s) => s.selectVersion);
  const removeVersion = useHistoryStore((s) => s.removeVersion);

  useEffect(() => {
    if (activeFilePath) {
      loadVersions(activeFilePath);
    }
  }, [activeFilePath, loadVersions]);

  const selectedVersion = selected ? versions.find((v) => v.id === selected.id) : undefined;

  const handleSaveVersion = async () => {
    if (activeFilePath && content) {
      await saveCurrentVersion(activeFilePath, content);
    }
  };

  const handleRestoreVersion = async (versionContent: string) => {
    // Keep what's on screen as a version first, so restoring can always be undone
    if (activeFilePath && content && content !== versionContent) {
      await saveCurrentVersion(activeFilePath, content, 'Before restore');
    }

    setContent(versionContent);
    selectVersion(null);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
        <span className="text-sm font-medium text-text-primary">Version history</span>
        <div className="flex items-center gap-1">
          {activeFilePath && versions.length > 0 && (
            <button
              type="button"
              onClick={handleSaveVersion}
              className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-text-secondary hover:bg-wash hover:text-text-primary outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              Save version
            </button>
          )}
          <Popover.Close asChild>
            <IconButton variant="ghost" size="sm" aria-label="Close version history">
              <X className="w-3.5 h-3.5" />
            </IconButton>
          </Popover.Close>
        </div>
      </div>

      {/* One empty state for the whole panel, explaining what a version is */}
      {!activeFilePath || isLoading || versions.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <History className="w-8 h-8 mx-auto mb-3 text-text-muted" aria-hidden />
          {!activeFilePath ? (
            <p className="text-sm text-text-secondary">Save the document to a file to keep versions of it.</p>
          ) : isLoading ? (
            <p className="text-sm text-text-secondary">Loading…</p>
          ) : (
            <>
              <p className="text-sm font-medium text-text-primary">No versions yet</p>
              <p className="mt-1 text-sm text-text-secondary max-w-xs mx-auto">
                A version is a snapshot you can compare with and restore later. Saving the file doesn’t create one.
              </p>
              <button
                type="button"
                onClick={handleSaveVersion}
                className="mt-4 h-8 px-3 rounded-md bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
              >
                Save this version
              </button>
    </>
        )}
      </div>
    ) : (
    <div className="flex h-[50vh]">
      {/* Version list */}
      <div className="w-1/2 border-r border-rule/50 overflow-y-auto">
          <div className="py-1">
            <AnimatePresence mode="popLayout">
              {versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isSelected={selected?.id === version.id}
                  onSelect={() => selectVersion(version.id)}
                  onDelete={() => removeVersion(version.id)}
                />
              ))}
            </AnimatePresence>
          </div>
      </div>

      {/* Preview/Diff */}
      <div className="w-1/2 overflow-hidden flex flex-col">
        {selected && selectedVersion ? (
          <>
            <div className="p-2 border-b border-rule/50">
              <p className="text-xs text-text-muted">
                {formatDate(selectedVersion.timestamp)} at {formatTime(selectedVersion.timestamp)}
              </p>
              {selectedVersion.label && (
                <p className="text-sm text-text-primary mt-1">{selectedVersion.label}</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {selected.content !== null ? (
                <DiffViewer oldContent={selected.content} newContent={content} />
              ) : (
                <p className="p-4 text-sm text-text-muted">Loading…</p>
              )}
            </div>
            <div className="p-2 border-t border-rule/50">
              <button
                type="button"
                disabled={selected.content === null}
                onClick={() => {
                  if (selected.content !== null) handleRestoreVersion(selected.content);
                }}
                className={cn(
                  'w-full py-1.5 px-3 rounded-lg text-sm',
                  'bg-accent-primary text-white',
                  'hover:bg-accent-primary/90 transition-colors disabled:opacity-50',
                  'flex items-center justify-center gap-2'
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore this version
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-text-muted p-4">
            <div>
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a version to compare</p>
            </div>
          </div>
        )}
      </div>
    </div>
    )}
    </>
  );
}

interface VersionItemProps {
  version: VersionMeta;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// popLayout measures exiting items, so the row needs a ref
const VersionItem = forwardRef<HTMLDivElement, VersionItemProps>(function VersionItem(
  { version, isSelected, onSelect, onDelete },
  ref
) {
  return (
    <m.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'px-3 py-2 cursor-pointer transition-colors group outline-hidden focus-visible:bg-wash',
        isSelected
          ? 'bg-accent-primary/10 border-l-2 border-accent-primary'
          : 'hover:bg-rule/50 border-l-2 border-transparent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-text-primary truncate">
              {formatDate(version.timestamp)}
            </p>
            <p className="text-xs text-text-muted">
              {formatTime(version.timestamp)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            aria-label={`Delete version from ${formatDate(version.timestamp)} ${formatTime(version.timestamp)}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded-sm text-text-muted hover:text-[#B91C1C] hover:bg-rule transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <ChevronRight className="w-3 h-3 text-text-muted" />
        </div>
      </div>
      {version.label && (
        <p className="text-xs text-accent-primary mt-1 truncate">{version.label}</p>
      )}
    </m.div>
  );
});
