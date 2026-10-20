import { useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { diffLines, type Change } from 'diff';
import {
  History,
  Clock,
  Trash2,
  RotateCcw,
  X,
  ChevronRight,
  Plus,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { IconButton, Tooltip } from '@/components/ui';
import { useAppStore } from '@/stores/appStore';
import { useUiStore } from '@/stores/uiStore';
import { useHistoryStore } from '../stores/historyStore';
import { type VersionEntry } from '../utils';

export function HistoryPanel() {
  const isOpen = useUiStore((s) => s.historyOpen);
  const setIsOpen = useUiStore((s) => s.setHistoryOpen);
  const { activeFilePath, content, setContent } = useAppStore();
  const {
    versions,
    isLoading,
    selectedVersionId,
    loadVersions,
    saveCurrentVersion,
    selectVersion,
    removeVersion,
  } = useHistoryStore();

  // Load versions when file changes
  useEffect(() => {
    if (activeFilePath) {
      loadVersions(activeFilePath);
    }
  }, [activeFilePath, loadVersions]);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);

  const handleSaveVersion = async () => {
    if (activeFilePath && content) {
      await saveCurrentVersion(activeFilePath, content);
    }
  };

  const handleRestoreVersion = async (version: VersionEntry) => {
    // Keep what's on screen as a version first, so restoring can always be undone
    if (activeFilePath && content && content !== version.content) {
      await saveCurrentVersion(activeFilePath, content, 'Before restore');
    }
    setContent(version.content);
    selectVersion(null);
  };

  const formatDate = (timestamp: number) => {
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
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip content="Version history">
        <Popover.Trigger asChild>
          <IconButton variant="ghost" size="sm" pressed={isOpen}>
            <History className="w-4 h-4" />
          </IconButton>
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            'w-[28rem] max-h-[70vh] rounded-lg',
            'bg-canvas border border-rule',
            'shadow-[0_12px_32px_-8px_rgba(26,26,26,0.22)] overflow-hidden',
            'animate-fade-in z-50'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
            <span className="text-sm font-medium text-text-primary">Version history</span>
            <div className="flex items-center gap-1">
              {activeFilePath && versions.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveVersion}
                  className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-text-secondary hover:bg-wash hover:text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
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
                    className="mt-4 h-8 px-3 rounded-md bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
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
                        isSelected={selectedVersionId === version.id}
                        onSelect={() => selectVersion(version.id)}
                        onDelete={() => removeVersion(version.id)}
                        formatDate={formatDate}
                        formatTime={formatTime}
                      />
                    ))}
                  </AnimatePresence>
                </div>
            </div>

            {/* Preview/Diff */}
            <div className="w-1/2 overflow-hidden flex flex-col">
              {selectedVersion ? (
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
                    <DiffViewer
                      oldContent={selectedVersion.content}
                      newContent={content}
                    />
                  </div>
                  <div className="p-2 border-t border-rule/50">
                    <button
                      onClick={() => handleRestoreVersion(selectedVersion)}
                      className={cn(
                        'w-full py-1.5 px-3 rounded-lg text-sm',
                        'bg-accent-primary text-white',
                        'hover:bg-accent-primary/90 transition-colors',
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface VersionItemProps {
  version: VersionEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  formatDate: (timestamp: number) => string;
  formatTime: (timestamp: number) => string;
}

function VersionItem({
  version,
  isSelected,
  onSelect,
  onDelete,
  formatDate,
  formatTime,
}: VersionItemProps) {
  return (
    <m.div
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
        'px-3 py-2 cursor-pointer transition-colors group outline-none focus-visible:bg-wash',
        isSelected
          ? 'bg-accent-primary/10 border-l-2 border-accent-primary'
          : 'hover:bg-rule/50 border-l-2 border-transparent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
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
            className="p-1 rounded text-text-muted hover:text-[#B91C1C] hover:bg-rule transition-colors"
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
}

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
}

function DiffViewer({ oldContent, newContent }: DiffViewerProps) {
  const changes = diffLines(oldContent, newContent);

  return (
    <div className="text-xs font-mono">
      {changes.map((change, index) => (
        <DiffLine key={index} change={change} />
      ))}
    </div>
  );
}

interface DiffLineProps {
  change: Change;
}

function DiffLine({ change }: DiffLineProps) {
  const lines = change.value.split('\n').filter((line, idx, arr) =>
    // Keep empty lines except trailing one
    idx < arr.length - 1 || line !== ''
  );

  if (lines.length === 0) return null;

  return (
    <>
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'px-2 py-0.5 border-l-2',
            change.added && 'bg-green-500/10 border-green-500 text-green-300',
            change.removed && 'bg-red-500/10 border-red-500 text-red-300',
            !change.added && !change.removed && 'border-transparent text-text-muted'
          )}
        >
          <span className="mr-2 text-text-muted/50 select-none">
            {change.added ? '+' : change.removed ? '-' : ' '}
          </span>
          {line || ' '}
        </div>
      ))}
    </>
  );
}
