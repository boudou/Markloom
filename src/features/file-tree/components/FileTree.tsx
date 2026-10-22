import { useCallback, useEffect } from 'react';
import { FolderOpen, RefreshCw, AlertCircle } from 'lucide-react';
import { m } from 'framer-motion';
import { IconButton, Tooltip } from '@/components/ui';
import { useFileTreeStore } from '../stores/fileTreeStore';
import { useAppStore } from '@/stores/appStore';
import { readDirectory, isFileSystemSupported, documentName } from '../api/fileSystem';
import { openFolder, openPath } from '@/lib/documentActions';
import { notify } from '@/stores/uiStore';
import { TreeNode } from './TreeNode';
import { errorMessage } from '@/lib/utils';

// Each read of the open folder takes the next number; only the latest may change the tree or report an error.
// Kept outside the component so a read from before the sidebar remounted the tree is still superseded.
let latestLoad = 0;

// Module-level, so the memo'd TreeNodes get the same callback on every render
function openFromTree(path: string): void {
  void openPath(path);
}

export function FileTree() {
  const nodes = useFileTreeStore((s) => s.nodes);
  const rootId = useFileTreeStore((s) => s.rootId);
  const nodesRoot = useFileTreeStore((s) => s.nodesRoot);
  const isLoading = useFileTreeStore((s) => s.isLoading);
  const setNodes = useFileTreeStore((s) => s.setNodes);
  const setLoading = useFileTreeStore((s) => s.setLoading);
  const rootPath = useAppStore((s) => s.rootPath);

  const isSupported = isFileSystemSupported();

  const loadDirectory = useCallback(
    async (path: string, root: number) => {
      const load = ++latestLoad;
      // A newer read (Refresh, or another folder opening) owns the tree and the spinner
      const superseded = () => load !== latestLoad || useFileTreeStore.getState().rootId !== root;

      setLoading(true);

      try {
        const read = await readDirectory(path);

        if (superseded()) return;
        setNodes(read, root);
      } catch (error) {
        if (superseded()) return;

        // A failed Refresh keeps the tree; a folder that failed to open shows none (openRoot already cleared it)
        notify({
          tone: 'error',
          title: `Couldn't read ${documentName(path)}`,
          detail: errorMessage(error),
        });
      }

      setLoading(false);
    },
    [setNodes, setLoading]
  );

  // Reads the folder only when the store doesn't hold it yet, so the tree (and its expanded folders)
  // survives the sidebar switching to Outline and back; Refresh is the way to re-read it
  useEffect(() => {
    if (rootPath && nodesRoot !== rootId) {
      void loadDirectory(rootPath, rootId);
    }
  }, [rootPath, rootId, nodesRoot, loadDirectory]);

  const handleRefresh = useCallback(() => {
    if (rootPath) {
      void loadDirectory(rootPath, rootId);
    }
  }, [rootPath, rootId, loadDirectory]);

  // Show browser compatibility warning
  if (!isSupported) {
    return (
      <div className="h-full flex flex-col bg-panel">
        <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Explorer
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-2">Browser not supported</p>
            <p className="text-xs text-text-muted">
              Please use Chrome, Edge, or another Chromium-based browser for full file system access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="h-8 flex items-center justify-between gap-2 pl-4 pr-1.5 border-b border-rule">
        <h2 className="min-w-0 truncate text-xs font-medium text-text-secondary" title={rootPath ?? undefined}>
          {rootPath ? documentName(rootPath) : 'Files'}
        </h2>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Tooltip content="Open another folder">
            <IconButton variant="ghost" size="sm" onClick={() => void openFolder()}>
              <FolderOpen className="w-4 h-4" />
            </IconButton>
          </Tooltip>
          {rootPath && (
            <Tooltip content="Refresh">
              <IconButton variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto py-2">
        {!rootPath && nodes.length === 0 ? (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full px-4 text-center"
          >
            <FolderOpen className="w-12 h-12 text-text-muted/50 mb-4" />
            <p className="text-sm text-text-secondary mb-2">No folder open</p>
            <p className="text-xs text-text-muted mb-4">
              Open a folder to browse your markdown files
            </p>
            <button
              onClick={() => void openFolder()}
              className="text-sm text-accent-primary hover:text-accent-hover transition-colors"
            >
              Open folder
            </button>
          </m.div>
        ) : (
          // Keyed by the open folder: a same-name folder's nodes share paths but must not reuse the old TreeNodes
          <div key={rootId} className="px-1">
            {nodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                onFileSelect={openFromTree}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
